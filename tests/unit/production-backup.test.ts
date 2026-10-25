import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  AGE_SHA256,
  AGE_VERSION,
  APP_SCHEMAS,
  AUTH_DATA_TABLES,
  DRIVE_FILE_SCOPE,
  RETENTION_COUNT,
  assertAgeCiphertext,
  assertAuthDataDump,
  assertBackupDatabaseUrl,
  assertConfigured,
  assertDriveScope,
  assertUploadLocation,
  assembleDatabaseSql,
  backupFileName,
  backupListQuery,
  buildConsentUrl,
  classifyBucketResponse,
  driveFileMetadata,
  dumpPlan,
  excludedAuthTables,
  parseAgeRecipient,
  safeObjectPath,
  scrubSecrets,
  selectDeletions,
} from "../../scripts/production-backup-lib.mjs";
import {
  downloadPrivateObjects,
  listPrivateObjects,
  pruneDriveBackups,
  refreshDriveAccess,
  runProductionBackup,
  uploadAgeFile,
} from "../../scripts/production-backup.mjs";
import {
  ensureBackupFolder,
  exchangeAuthCode,
} from "../../scripts/backup-drive-authorize.mjs";

const FOLDER_ID = "folderid0123456789";
const RECIPIENT = "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

function configuredEnv(overrides: Record<string, string> = {}) {
  return {
    BACKUP_CONFIRM: "production",
    BACKUP_DATABASE_URL: "postgresql://postgres:secret-value@db.example:5432/postgres",
    BACKUP_SUPABASE_URL: "https://project.example.supabase.co",
    BACKUP_SUPABASE_SERVICE_ROLE_KEY: "service-role-key-0123456789",
    BACKUP_DRIVE_CLIENT_ID: "desktop-client-id",
    BACKUP_DRIVE_CLIENT_SECRET: "desktop-client-secret",
    BACKUP_DRIVE_REFRESH_TOKEN: "refresh-token-value",
    BACKUP_DRIVE_FOLDER_ID: FOLDER_ID,
    ...overrides,
  };
}

function authData() {
  return AUTH_DATA_TABLES.map(
    (table) =>
      `-- Name: ${table}; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin`,
  ).join("\n");
}

function dailyFile(id: string, day: string, createdTime = `${day}T03:15:00.000Z`) {
  return {
    id,
    name: `adrielli-flores-backup-${day}.age`,
    parents: [FOLDER_ID],
    createdTime,
  };
}

describe("backup de produção", () => {
  it("monta o dump com o schema auth antes dos dados e sem sessão", () => {
    const plan = dumpPlan();
    expect(plan.map((item) => item.file)).toEqual([
      "auth-schema.sql",
      "auth-data.sql",
      "app-schema.sql",
      "app-data.sql",
    ]);
    expect(plan[0]?.args).toEqual(["--schema", "auth"]);
    expect(plan[2]?.args).toEqual(["--schema", APP_SCHEMAS]);
    const exclude = excludedAuthTables();
    expect(exclude).toContain("auth.refresh_tokens");
    expect(exclude).toContain("auth.sessions");
    expect(exclude.split(",")).not.toContain("auth.users");
    expect(exclude.split(",")).not.toContain("auth.identities");
    expect(exclude.split(",")).not.toContain("auth.mfa_factors");
    const sql = assembleDatabaseSql({
      authSchema: "create auth",
      authData: authData(),
      appSchema: "create app",
      appData: "copy app",
    });
    const authSchema = sql.indexOf("-- auth schema");
    const authRows = sql.indexOf("-- auth data");
    const appSchema = sql.indexOf("-- schema");
    const appRows = sql.indexOf("-- data");
    expect(authSchema).toBeLessThan(authRows);
    expect(authRows).toBeLessThan(appSchema);
    expect(appSchema).toBeLessThan(appRows);
  });

  it("recusa dump de auth com refresh token e aceita só o cabeçalho age", () => {
    expect(() =>
      assertAuthDataDump(`${authData()}\nCOPY "auth"."refresh_tokens" FROM stdin;`),
    ).toThrow(/refresh_tokens/);
    const header = Buffer.from("age-encryption.org/v1\nresto");
    expect(() => assertAgeCiphertext(header)).not.toThrow();
    expect(() => assertAgeCiphertext(Buffer.from("-- PostgreSQL database dump"))).toThrow(
      /criptografado/,
    );
  });

  it("só aceita a chave pública age, nunca a privada", () => {
    expect(parseAgeRecipient(`# comentário\n${RECIPIENT}\n`)).toBe(RECIPIENT);
    expect(() => parseAgeRecipient("# só comentário\n")).toThrow(/ausente/);
    expect(() =>
      parseAgeRecipient(`${RECIPIENT}\nAGE-SECRET-KEY-1QQQQQQQQQQQQQQQ`),
    ).toThrow(/chave privada/);
    const committed = readFileSync("ops/backup/age-recipient.txt", "utf8");
    expect(committed).not.toContain("AGE-SECRET-KEY");
  });

  it("recusa banco local, banco de teste e pooler de transação sem ecoar a senha", () => {
    const local = "postgresql://postgres:secret-value@127.0.0.1:5432/postgres";
    expect(() => assertBackupDatabaseUrl(local)).toThrow(/host local/);
    try {
      assertBackupDatabaseUrl(local);
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain("secret-value");
    }
    expect(() =>
      assertBackupDatabaseUrl(
        "postgresql://postgres:secret-value@db.example:6543/postgres",
      ),
    ).toThrow(/5432/);
    expect(() =>
      assertBackupDatabaseUrl(
        "postgresql://postgres:secret-value@db.example:5432/adrielli_flores_test",
      ),
    ).toThrow(/banco de teste/);
    expect(() =>
      assertConfigured({ ...configuredEnv(), BACKUP_CONFIRM: "development" }),
    ).toThrow(/recusado/);
  });

  it("nomeia o arquivo pelo dia em America/Sao_Paulo e só grava na pasta configurada", () => {
    expect(backupFileName(new Date("2026-10-25T02:30:00.000Z"))).toBe(
      "adrielli-flores-backup-20261024.age",
    );
    expect(backupFileName(new Date("2026-10-25T03:15:00.000Z"))).toBe(
      "adrielli-flores-backup-20261025.age",
    );
    expect(driveFileMetadata("adrielli-flores-backup-20261025.age", FOLDER_ID)).toEqual({
      name: "adrielli-flores-backup-20261025.age",
      parents: [FOLDER_ID],
    });
    expect(() => driveFileMetadata("database.sql", FOLDER_ID)).toThrow(/Nome de backup/);
    expect(backupListQuery(FOLDER_ID)).toContain(`'${FOLDER_ID}' in parents`);
    expect(backupListQuery(FOLDER_ID)).not.toContain("'root'");
  });

  it("guarda 30 cópias e não apaga arquivo fora da pasta nem o envio atual", () => {
    const files = Array.from({ length: 31 }, (_, index) =>
      dailyFile(`id-${index}`, String(20260001 + index)),
    );
    files.push({
      id: "nota",
      name: "leia-me.txt",
      parents: [FOLDER_ID],
      createdTime: "2026-10-25T00:00:00.000Z",
    });
    const removed = selectDeletions(files, {
      folderId: FOLDER_ID,
      keep: RETENTION_COUNT,
      protectId: "id-30",
    });
    expect(removed.map((file) => file.id)).toEqual(["id-0"]);
    const duplicate = selectDeletions(
      [
        dailyFile("old", "20261025", "2026-10-25T03:00:00.000Z"),
        dailyFile("new", "20261025", "2026-10-25T04:00:00.000Z"),
      ],
      { folderId: FOLDER_ID, protectId: "new" },
    );
    expect(duplicate.map((file) => file.id)).toEqual(["old"]);
    expect(() =>
      selectDeletions(
        [
          {
            id: "fora",
            name: "adrielli-flores-backup-20261025.age",
            parents: ["outra-pasta-123"],
            createdTime: "2026-10-25T03:15:00.000Z",
          },
        ],
        { folderId: FOLDER_ID, protectId: "fora" },
      ),
    ).toThrow(/Nada foi apagado/);
  });

  it("pede só o escopo drive.file e recusa o Drive inteiro", () => {
    const url = buildConsentUrl({
      clientId: "desktop-client-id",
      redirectUri: "http://127.0.0.1:53682/",
      state: "state-value",
      codeChallenge: "challenge-value",
    });
    expect(url.searchParams.get("scope")).toBe(DRIVE_FILE_SCOPE);
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.getAll("scope")).toEqual([DRIVE_FILE_SCOPE]);
    expect(() => assertDriveScope("https://www.googleapis.com/auth/drive")).toThrow(
      /drive\.file/,
    );
    expect(DRIVE_FILE_SCOPE).toBe("https://www.googleapis.com/auth/drive.file");
    const authorize = readFileSync("scripts/backup-drive-authorize.mjs", "utf8");
    expect(authorize).toContain("assertDriveScope");
    expect(authorize).not.toContain('https://www.googleapis.com/auth/drive"');
    expect(authorize).not.toContain("auth/drive.readonly");
    expect(authorize).not.toContain("drive.appdata");
  });

  it("não envia texto puro e não segue endereço de upload estranho", async () => {
    const fetchImpl = vi.fn();
    const putImpl = vi.fn();
    await expect(
      uploadAgeFile({
        filePath: "backup.tar",
        name: "adrielli-flores-backup-20261025.age",
        folderId: FOLDER_ID,
        accessToken: "access-token-value",
        fetchImpl,
        readHeader: async () => Buffer.from("age-encryption.org/v1\n"),
        stat: () => ({ size: 80 }),
        putImpl,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/\.age/);
    await expect(
      uploadAgeFile({
        filePath: "backup.age",
        name: "adrielli-flores-backup-20261025.age",
        folderId: FOLDER_ID,
        accessToken: "access-token-value",
        fetchImpl,
        readHeader: async () => Buffer.from("-- PostgreSQL database dump"),
        stat: () => ({ size: 80 }),
        putImpl,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/criptografado/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(putImpl).not.toHaveBeenCalled();

    fetchImpl.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { location: "https://evil.example/upload/drive/v3/files?upload_id=1" },
      }),
    );
    await expect(
      uploadAgeFile({
        filePath: "backup.age",
        name: "adrielli-flores-backup-20261025.age",
        folderId: FOLDER_ID,
        accessToken: "access-token-value",
        fetchImpl,
        readHeader: async () => Buffer.from("age-encryption.org/v1\n"),
        stat: () => ({ size: 80 }),
        putImpl,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/Endereço de envio/);
    expect(putImpl).not.toHaveBeenCalled();
    expect(() =>
      assertUploadLocation("http://www.googleapis.com/upload/drive/v3/files"),
    ).toThrow(/recusado/);
  });

  it("sobe o ciphertext só com a pasta configurada no parent", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "adrielli-flores-backup-20261025.age",
        parents: [FOLDER_ID],
      });
      return new Response("{}", {
        status: 200,
        headers: {
          location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=abc",
        },
      });
    });
    const putImpl = vi.fn(async () => ({
      id: "uploaded-id",
      name: "adrielli-flores-backup-20261025.age",
      parents: [FOLDER_ID],
    }));
    const uploaded = await uploadAgeFile({
      filePath: "cipher.age",
      name: "adrielli-flores-backup-20261025.age",
      folderId: FOLDER_ID,
      accessToken: "access-token-value",
      fetchImpl,
      readHeader: async () => Buffer.from("age-encryption.org/v1\n"),
      stat: () => ({ size: 80 }),
      putImpl,
      sleep: async () => {},
    });
    expect(uploaded).toEqual({ id: "uploaded-id" });
    expect(putImpl).toHaveBeenCalledTimes(1);
  });

  it("recusa token com escopo amplo e não devolve o access token no erro", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        access_token: "access-token-value",
        refresh_token: "refresh-token-value",
        scope: "https://www.googleapis.com/auth/drive",
      }),
    );
    await expect(refreshDriveAccess({ env: configuredEnv(), fetchImpl })).rejects.toThrow(
      /drive\.file/,
    );
    try {
      await refreshDriveAccess({ env: configuredEnv(), fetchImpl });
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain(
        "access-token-value",
      );
    }
    await expect(
      exchangeAuthCode({
        clientId: "desktop-client-id",
        clientSecret: "desktop-client-secret",
        code: "auth-code",
        redirectUri: "http://127.0.0.1:9/",
        codeVerifier: "verifier",
        fetchImpl,
      }),
    ).rejects.toThrow(/drive\.file/);
  });

  it("trata bucket ausente sem baixar e recusa caminho que escapa da pasta", async () => {
    const absent = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "Bucket not found", message: "Bucket not found" }),
          {
            status: 404,
          },
        ),
    );
    await expect(
      listPrivateObjects({ env: configuredEnv(), fetchImpl: absent }),
    ).resolves.toEqual({
      status: "absent",
      objects: [],
    });
    const denied = vi.fn(async () => new Response("no", { status: 401 }));
    await expect(
      listPrivateObjects({ env: configuredEnv(), fetchImpl: denied }),
    ).rejects.toThrow(/401/);
    try {
      await listPrivateObjects({ env: configuredEnv(), fetchImpl: denied });
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain(
        "service-role-key-0123456789",
      );
    }
    const traversal = vi.fn(async () =>
      Response.json([{ name: "../secret", id: "obj-1" }]),
    );
    await expect(
      listPrivateObjects({ env: configuredEnv(), fetchImpl: traversal }),
    ).rejects.toThrow(/Caminho de anexo/);
    expect(classifyBucketResponse(400, "Bucket not found")).toBe("absent");
    expect(() => safeObjectPath("../secret")).toThrow(/recusado/);

    const directory = mkdtempSync(join(tmpdir(), "adrielli-backup-test-"));
    try {
      const fetchImpl = vi.fn(async () => new Response(Buffer.from("abc")));
      const bytes = await downloadPrivateObjects({
        env: configuredEnv(),
        workdir: directory,
        objects: ["patients/file.pdf"],
        fetchImpl,
      });
      expect(bytes).toBe(3);
      expect(
        readFileSync(
          join(directory, "storage", "clinic-private", "patients", "file.pdf"),
          "utf8",
        ),
      ).toBe("abc");
      await expect(
        downloadPrivateObjects({
          env: configuredEnv(),
          workdir: directory,
          objects: ["../secret"],
          fetchImpl,
        }),
      ).rejects.toThrow(/recusado/);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("criptografa antes do envio e apaga a área temporária se a criptografia falha", async () => {
    const order: string[] = [];
    const env = configuredEnv();
    const deps = {
      now: () => new Date("2026-10-25T06:15:00.000Z"),
      readRecipient: () => RECIPIENT,
      prepareWorkdir: async () => {
        order.push("workdir");
        return "temp";
      },
      dumpDatabase: async () => {
        order.push("dump");
      },
      downloadPrivateBucket: async () => {
        order.push("storage");
        return { status: "empty", objectCount: 0, objectBytes: 0 };
      },
      writeManifest: async () => {
        order.push("manifest");
      },
      pack: async () => {
        order.push("pack");
        return "temp.tar";
      },
      encrypt: async () => {
        order.push("encrypt");
        throw new Error("age falhou");
      },
      readCipherHeader: async () => Buffer.from("age-encryption.org/v1\n"),
      removePlainArchive: async () => {
        order.push("remove-plain");
      },
      upload: async () => {
        order.push("upload");
        return { id: "uploaded-id" };
      },
      prune: async () => {
        order.push("prune");
        return 0;
      },
      removeWorkdir: async () => {
        order.push("cleanup");
      },
    };
    await expect(runProductionBackup(env, deps)).rejects.toThrow(/age falhou/);
    expect(order).toEqual([
      "workdir",
      "dump",
      "storage",
      "manifest",
      "pack",
      "encrypt",
      "cleanup",
    ]);
    expect(order).not.toContain("upload");

    order.length = 0;
    await expect(
      runProductionBackup(env, {
        ...deps,
        encrypt: async () => {
          order.push("encrypt");
          return "cipher.age";
        },
        readCipherHeader: async () => {
          order.push("header");
          return Buffer.from("-- PostgreSQL database dump");
        },
      }),
    ).rejects.toThrow(/criptografado/);
    expect(order).not.toContain("upload");
    expect(order.at(-1)).toBe("cleanup");
  });

  it("não apaga cópia nenhuma se o arquivo novo não aparece na pasta", async () => {
    const deleteImpl = vi.fn();
    await expect(
      pruneDriveBackups({
        folderId: FOLDER_ID,
        protectId: "uploaded-id",
        accessToken: "access-token-value",
        listImpl: async () => [dailyFile("old", "20261024")],
        deleteImpl,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/não está na pasta/);
    expect(deleteImpl).not.toHaveBeenCalled();
  });

  it("redige URL, segredo e bearer antes de qualquer log", () => {
    const scrubbed = scrubSecrets(
      "postgresql://postgres:secret-value@db.example:5432/postgres Bearer access-token-value AGE-SECRET-KEY-1QQQQ",
      ["secret-value", "access-token-value"],
    );
    expect(scrubbed).not.toContain("secret-value");
    expect(scrubbed).not.toContain("access-token-value");
    expect(scrubbed).not.toContain("AGE-SECRET-KEY-1QQQQ");
    expect(scrubbed).toContain("[redigido]");
  });

  it("reaproveita a pasta do aplicativo sem criar outra", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ files: [{ id: FOLDER_ID, name: "adrielli-flores-backups" }] }),
    );
    await expect(
      ensureBackupFolder({ accessToken: "access-token-value", fetchImpl }),
    ).resolves.toBe(FOLDER_ID);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("blast radius do backup", () => {
  it("deixa o backup local e os workflows de publicação fora do Drive", () => {
    const local = readFileSync("scripts/backup-local-db.mjs", "utf8");
    expect(local).not.toContain("drive.google");
    expect(local).not.toContain("BACKUP_DRIVE");
    expect(local).not.toContain("age-recipient");
    expect(local).not.toContain("clinic-private");
    for (const table of ["users", "identities", "mfa_factors"]) {
      expect(local).toContain(`"${table}"`);
    }
    const production = readFileSync(".github/workflows/production.yml", "utf8");
    expect(production).not.toContain("drive.google");
    expect(production).not.toContain("BACKUP_DRIVE");
    expect(production).not.toContain("age-encryption");
    const awake = readFileSync(".github/workflows/keep-database-awake.yml", "utf8");
    expect(awake).not.toContain("BACKUP_");
    expect(awake).toContain('cron: "0 9 * * *"');
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["db:backup"]).toBe("node scripts/backup-local-db.mjs");
    const workflow = readFileSync(".github/workflows/backup.yml", "utf8");
    expect(workflow).toContain('cron: "15 6 * * *"');
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("environment: backup");
    expect(workflow).not.toMatch(/environment:\s*production/);
    expect(workflow).not.toContain("upload-artifact");
    expect(workflow).not.toContain("rm -rf");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain(AGE_SHA256);
    expect(workflow).toContain(AGE_VERSION);
    expect(workflow).toContain("BACKUP_CONFIRM: production");
    expect(workflow.indexOf("Instalar age")).toBeLessThan(
      workflow.indexOf("node scripts/production-backup.mjs"),
    );
    const runner = readFileSync("scripts/production-backup.mjs", "utf8");
    expect(runner.indexOf("deps.encrypt(")).toBeLessThan(runner.indexOf("deps.upload("));
    expect(runner.indexOf("assertAgeCiphertext(header)")).toBeLessThan(
      runner.indexOf("deps.upload("),
    );
  });
});
