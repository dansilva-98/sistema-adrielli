import { spawnSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
import {
  chmodSync,
  closeSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  AGE_HEADER,
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
  RETENTION_COUNT,
  assembleDatabaseSql,
  assertAgeCiphertext,
  assertConfigured,
  assertDriveScope,
  assertUploadLocation,
  backupFileName,
  backupListQuery,
  classifyBucketResponse,
  clinicPrivateBucketRequired,
  driveFileMetadata,
  dumpPlan,
  manifestDocument,
  parseAgeRecipient,
  safeObjectPath,
  scrubSecrets,
  selectDeletions,
  selectOrphanPatientObjects,
  storagePathsInDump,
  supabaseDumpArgs,
} from "./production-backup-lib.mjs";

const RECIPIENT_PATH = join("ops", "backup", "age-recipient.txt");

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function readAgeHeader(filePath) {
  const length = Buffer.byteLength(AGE_HEADER);
  const buffer = Buffer.alloc(length);
  const fd = openSync(filePath, "r");
  try {
    const read = readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

function secretValues(env) {
  return [
    env.BACKUP_DATABASE_URL,
    env.BACKUP_SUPABASE_SERVICE_ROLE_KEY,
    env.BACKUP_DRIVE_CLIENT_SECRET,
    env.BACKUP_DRIVE_REFRESH_TOKEN,
    env.BACKUP_DRIVE_CLIENT_ID,
  ];
}

function storageHeaders(env) {
  return {
    Authorization: `Bearer ${env.BACKUP_SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.BACKUP_SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
  };
}

export async function refreshDriveAccess({ env, fetchImpl = fetch }) {
  const body = new URLSearchParams({
    client_id: env.BACKUP_DRIVE_CLIENT_ID,
    client_secret: env.BACKUP_DRIVE_CLIENT_SECRET,
    refresh_token: env.BACKUP_DRIVE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Renovação do acesso ao Drive falhou (${response.status}).`);
  }
  const payload = await response.json();
  if (!payload.scope) {
    throw new Error("Renovação do acesso ao Drive falhou.");
  }
  assertDriveScope(payload.scope);
  if (typeof payload.access_token !== "string" || payload.access_token.length < 10) {
    throw new Error("Renovação do acesso ao Drive falhou.");
  }
  return payload.access_token;
}

export function putDriveFile(location, filePath, size) {
  assertUploadLocation(location);
  const url = new URL(location);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method: "PUT",
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": size,
          "Content-Range": `bytes 0-${size - 1}/${size}`,
        },
        timeout: 15 * 60 * 1000,
      },
      (res) => {
        const chunks = [];
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (received > 1_000_000) {
            res.destroy();
            reject(new Error("Envio ao Drive falhou."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            const error = new Error(`Envio ao Drive falhou (${status}).`);
            error.status = status;
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Envio ao Drive falhou."));
          }
        });
      },
    );
    req.on("error", () => reject(new Error("Envio ao Drive falhou.")));
    req.on("timeout", () => {
      req.destroy();
      const error = new Error("Envio ao Drive expirou.");
      error.status = 504;
      reject(error);
    });
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      req.destroy();
      reject(new Error("Envio ao Drive falhou."));
    });
    stream.pipe(req);
  });
}

export async function uploadAgeFile({
  filePath,
  name,
  folderId,
  accessToken,
  fetchImpl = fetch,
  readHeader,
  stat,
  putImpl = putDriveFile,
  sleep = delay,
}) {
  if (!filePath.endsWith(".age")) {
    throw new Error("O envio só aceita arquivo .age.");
  }
  const header = await readHeader(filePath);
  assertAgeCiphertext(header);
  const metadata = driveFileMetadata(name, folderId);
  const size = stat(filePath).size;
  if (!Number.isSafeInteger(size) || size <= Buffer.byteLength(AGE_HEADER)) {
    throw new Error("Arquivo criptografado vazio. O envio foi recusado.");
  }
  let location;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetchImpl(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,parents",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "application/octet-stream",
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(30_000),
      },
    );
    lastStatus = response.status;
    if (response.ok) {
      location = response.headers.get("location");
      break;
    }
    if (response.status !== 429 && response.status < 500) break;
    if (attempt < 3) await sleep(1000 * attempt);
  }
  if (!location) {
    throw new Error(
      lastStatus >= 200 && lastStatus < 300
        ? "Envio ao Drive falhou."
        : `Envio ao Drive falhou (${lastStatus}).`,
    );
  }
  assertUploadLocation(location);
  let payload;
  let putStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      payload = await putImpl(location, filePath, size);
      break;
    } catch (error) {
      putStatus = typeof error.status === "number" ? error.status : 0;
      const retry = putStatus === 429 || putStatus >= 500;
      if (!retry || attempt === 3) {
        throw new Error(`Envio ao Drive falhou (${putStatus}).`);
      }
      await sleep(1000 * attempt);
    }
  }
  if (!payload || typeof payload.id !== "string" || payload.name !== name) {
    throw new Error("Envio ao Drive falhou.");
  }
  if (!Array.isArray(payload.parents) || !payload.parents.includes(folderId)) {
    throw new Error("O Drive gravou o backup fora da pasta configurada.");
  }
  return { id: payload.id };
}

export async function listPrivateObjects({
  env,
  bucket = PRIVATE_BUCKET,
  fetchImpl = fetch,
  rootPrefix = "",
  withCreatedAt = false,
}) {
  const base = env.BACKUP_SUPABASE_URL.replace(/\/$/, "");
  const objects = [];
  const pending = [rootPrefix];
  const seen = new Set();
  while (pending.length > 0) {
    const prefix = pending.shift() ?? "";
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    if (prefix.split("/").filter(Boolean).length > 8) {
      throw new Error("Caminho de anexo profundo demais.");
    }
    let offset = 0;
    for (;;) {
      const response = await fetchImpl(`${base}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: storageHeaders(env),
        body: JSON.stringify({
          prefix,
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      const kind = classifyBucketResponse(response.status, text);
      if (kind === "absent") {
        if (objects.length === 0 && prefix === rootPrefix) {
          return { status: rootPrefix === "" ? "absent" : "empty", objects: [] };
        }
        throw new Error(`Leitura do bucket ${bucket} falhou (${response.status}).`);
      }
      if (kind !== "ok") {
        throw new Error(`Leitura do bucket ${bucket} falhou (${response.status}).`);
      }
      let page;
      try {
        page = JSON.parse(text);
      } catch {
        throw new Error(`Leitura do bucket ${bucket} falhou.`);
      }
      if (!Array.isArray(page)) throw new Error(`Leitura do bucket ${bucket} falhou.`);
      for (const item of page) {
        if (!item || typeof item.name !== "string") {
          throw new Error(`Leitura do bucket ${bucket} falhou.`);
        }
        const relative =
          prefix && item.name.startsWith(prefix) ? item.name : `${prefix}${item.name}`;
        safeObjectPath(relative);
        if (item.id) {
          objects.push(
            withCreatedAt
              ? {
                  name: relative,
                  createdAt: typeof item.created_at === "string" ? item.created_at : "",
                }
              : relative,
          );
        } else pending.push(relative.endsWith("/") ? relative : `${relative}/`);
      }
      if (objects.length > 100_000) {
        throw new Error(`Bucket ${bucket} grande demais para este job.`);
      }
      if (page.length < 100) break;
      offset += page.length;
    }
  }
  return {
    status: objects.length === 0 ? "empty" : "included",
    objects,
  };
}

export async function downloadPrivateObjects({
  env,
  workdir,
  bucket = PRIVATE_BUCKET,
  objects,
  fetchImpl = fetch,
}) {
  const base = env.BACKUP_SUPABASE_URL.replace(/\/$/, "");
  let objectBytes = 0;
  for (const objectName of objects) {
    const parts = safeObjectPath(objectName);
    const destination = join(workdir, "storage", bucket, ...parts);
    mkdirSync(dirname(destination), { recursive: true });
    const encoded = parts.map((part) => encodeURIComponent(part)).join("/");
    const response = await fetchImpl(`${base}/storage/v1/object/${bucket}/${encoded}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.BACKUP_SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.BACKUP_SUPABASE_SERVICE_ROLE_KEY,
      },
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download do bucket ${bucket} falhou (${response.status}).`);
    }
    try {
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(destination, { flags: "wx" }),
      );
    } catch {
      throw new Error(`Download do bucket ${bucket} falhou.`);
    }
    objectBytes += statSync(destination).size;
  }
  return objectBytes;
}

export async function deletePrivateObject({
  env,
  bucket = PRIVATE_BUCKET,
  objectName,
  fetchImpl = fetch,
}) {
  const parts = safeObjectPath(objectName);
  if (parts[0] !== "patients") {
    throw new Error("Só objetos de patients/ podem ser apagados por esta rotina.");
  }
  const encoded = parts.map((part) => encodeURIComponent(part)).join("/");
  const base = env.BACKUP_SUPABASE_URL.replace(/\/$/, "");
  const response = await fetchImpl(`${base}/storage/v1/object/${bucket}/${encoded}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.BACKUP_SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.BACKUP_SUPABASE_SERVICE_ROLE_KEY,
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Falha ao apagar anexo não confirmado (${response.status}).`);
  }
}

export async function removeOrphanPatientUploads({
  env,
  databaseSql,
  now = Date.now(),
  fetchImpl = fetch,
  bucket = PRIVATE_BUCKET,
}) {
  const registered = storagePathsInDump(databaseSql);
  const listed = await listPrivateObjects({
    env,
    bucket,
    fetchImpl,
    rootPrefix: "patients/",
    withCreatedAt: true,
  });
  const doomed = selectOrphanPatientObjects(listed.objects, registered, now);
  for (const name of doomed) {
    await deletePrivateObject({ env, bucket, objectName: name, fetchImpl });
  }
  return doomed.length;
}

async function takeBucket({ env, workdir, bucket, required, fetchImpl }) {
  const listed = await listPrivateObjects({ env, bucket, fetchImpl });
  if (listed.status === "absent") {
    if (required) {
      throw new Error(`O bucket ${bucket} não existe. O backup foi recusado.`);
    }
    return { status: "absent", objectCount: 0, objectBytes: 0 };
  }
  const objectBytes = await downloadPrivateObjects({
    env,
    workdir,
    bucket,
    objects: listed.objects,
    fetchImpl,
  });
  return {
    status: listed.status,
    objectCount: listed.objects.length,
    objectBytes,
  };
}

export async function downloadBackupBuckets({
  env,
  workdir,
  databaseSql,
  fetchImpl = fetch,
}) {
  const privateStorage = await takeBucket({
    env,
    workdir,
    bucket: PRIVATE_BUCKET,
    required: clinicPrivateBucketRequired(databaseSql),
    fetchImpl,
  });
  const publicStorage = await takeBucket({
    env,
    workdir,
    bucket: PUBLIC_BUCKET,
    required: true,
    fetchImpl,
  });
  return {
    status: privateStorage.status,
    objectCount: privateStorage.objectCount,
    objectBytes: privateStorage.objectBytes,
    publicStatus: publicStorage.status,
    publicObjectCount: publicStorage.objectCount,
    publicObjectBytes: publicStorage.objectBytes,
  };
}

async function listDriveFiles({ accessToken, folderId, fetchImpl }) {
  const files = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", backupListQuery(folderId));
    url.searchParams.set("fields", "nextPageToken,files(id,name,parents,createdTime)");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("spaces", "drive");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Lista do Drive falhou (${response.status}).`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload.files)) throw new Error("Lista do Drive inválida.");
    files.push(...payload.files);
    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";
  } while (pageToken);
  return files;
}

export async function pruneDriveBackups({
  folderId,
  protectId,
  accessToken,
  listImpl,
  deleteImpl,
  sleep = delay,
}) {
  let files = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    files = await listImpl({ accessToken, folderId });
    if (files.some((file) => file.id === protectId)) break;
    if (attempt < 3) await sleep(1000 * attempt);
  }
  const removed = selectDeletions(files, {
    folderId,
    keep: RETENTION_COUNT,
    protectId,
  });
  for (const file of removed) {
    await deleteImpl(file);
  }
  return removed.length;
}

export async function runProductionBackup(env, deps) {
  assertConfigured(env);
  const recipient = parseAgeRecipient(deps.readRecipient());
  const secrets = secretValues(env);
  let workdir;
  try {
    workdir = await deps.prepareWorkdir();
    await deps.dumpDatabase({ env, workdir, secrets });
    const storage = await deps.downloadPrivateBucket({ env, workdir, secrets });
    await deps.writeManifest({ workdir, storage, now: deps.now() });
    const plainPath = await deps.pack({ workdir });
    const cipherPath = await deps.encrypt({ workdir, plainPath, recipient, secrets });
    const header = await deps.readCipherHeader(cipherPath);
    assertAgeCiphertext(header);
    await deps.removePlainArchive(plainPath);
    const uploaded = await deps.upload({
      env,
      filePath: cipherPath,
      name: backupFileName(deps.now()),
      folderId: env.BACKUP_DRIVE_FOLDER_ID.trim(),
      secrets,
    });
    if (!uploaded?.id) throw new Error("Envio ao Drive falhou.");
    const removed = await deps.prune({
      env,
      folderId: env.BACKUP_DRIVE_FOLDER_ID.trim(),
      protectId: uploaded.id,
      secrets,
    });
    console.log("Backup de produção: envio ao Drive concluído.");
    console.log(
      `Backup de produção: retenção manteve ${RETENTION_COUNT} cópias. Removidas: ${removed}.`,
    );
    if (typeof deps.removeOrphanUploads === "function") {
      const orphans = await deps.removeOrphanUploads({ env, workdir });
      console.log(`Backup de produção: ${orphans} anexos não confirmados apagados.`);
    }
  } finally {
    if (workdir) await deps.removeWorkdir(workdir);
  }
}

function spawnChecked(binary, args, secrets) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 600_000,
  });
  if (result.error || result.status !== 0) {
    const detail = scrubSecrets(
      `${result.stderr ?? ""}\n${result.stdout ?? ""}`,
      secrets,
    );
    if (detail.trim()) console.error(detail.trim());
    throw new Error("Falha ao montar o backup. O envio não foi feito.");
  }
}

function createDeps() {
  return {
    now: () => new Date(),
    readRecipient: () => readFileSync(RECIPIENT_PATH, "utf8"),
    prepareWorkdir: async () => {
      const directory = mkdtempSync(join(tmpdir(), "adrielli-backup-"));
      chmodSync(directory, 0o700);
      return directory;
    },
    dumpDatabase: async ({ env, workdir, secrets }) => {
      const binary = process.env.SUPABASE_BIN || "supabase";
      const parts = {};
      for (const item of dumpPlan()) {
        const filePath = join(workdir, item.file);
        spawnChecked(
          binary,
          supabaseDumpArgs(env.BACKUP_DATABASE_URL, item, filePath),
          secrets,
        );
        parts[item.label] = readFileSync(filePath, "utf8");
        unlinkSync(filePath);
      }
      const sql = assembleDatabaseSql({
        authSchema: parts["auth-schema"],
        authData: parts["auth-data"],
        appSchema: parts["app-schema"],
        appData: parts["app-data"],
      });
      const target = join(workdir, "database.sql");
      writeFileSync(target, sql, { encoding: "utf8", mode: 0o600 });
      console.log("Backup de produção: dump do banco concluído.");
    },
    downloadPrivateBucket: async ({ env, workdir }) => {
      const databaseSql = readFileSync(join(workdir, "database.sql"), "utf8");
      const storage = await downloadBackupBuckets({ env, workdir, databaseSql });
      if (storage.status === "absent") {
        console.log(
          "Backup de produção: bucket privado ausente. O arquivo segue só com o banco.",
        );
      } else {
        console.log(
          `Backup de produção: ${storage.objectCount} arquivos do bucket privado incluídos.`,
        );
      }
      console.log(
        `Backup de produção: ${storage.publicObjectCount} arquivos do bucket público incluídos.`,
      );
      return storage;
    },
    writeManifest: async ({ workdir, storage, now }) => {
      writeFileSync(
        join(workdir, "manifest.json"),
        `${JSON.stringify(manifestDocument(storage, now))}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
    },
    pack: async ({ workdir }) => {
      const plainPath = `${workdir}.tar`;
      spawnChecked(
        "tar",
        ["-cf", plainPath, "-C", workdir, "."],
        secretValues(process.env),
      );
      return plainPath;
    },
    encrypt: async ({ workdir, plainPath, recipient, secrets }) => {
      const cipherPath = join(workdir, "cipher.age");
      const binary = process.env.AGE_BIN || "age";
      spawnChecked(binary, ["-r", recipient, "-o", cipherPath, plainPath], secrets);
      console.log("Backup de produção: criptografia concluída.");
      return cipherPath;
    },
    readCipherHeader: async (cipherPath) => readAgeHeader(cipherPath),
    removePlainArchive: async (plainPath) => {
      unlinkSync(plainPath);
    },
    upload: async ({ env, filePath, name, folderId }) => {
      const accessToken = await refreshDriveAccess({ env });
      return uploadAgeFile({
        filePath,
        name,
        folderId,
        accessToken,
        readHeader: readAgeHeader,
        stat: statSync,
      });
    },
    removeOrphanUploads: async ({ env, workdir }) => {
      const databaseSql = readFileSync(join(workdir, "database.sql"), "utf8");
      return removeOrphanPatientUploads({ env, databaseSql });
    },
    prune: async ({ env, folderId, protectId }) => {
      const accessToken = await refreshDriveAccess({ env });
      return pruneDriveBackups({
        folderId,
        protectId,
        accessToken,
        listImpl: (input) => listDriveFiles({ ...input, fetchImpl: fetch }),
        deleteImpl: async (file) => {
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(30_000),
            },
          );
          if (response.status !== 204 && response.status !== 200) {
            throw new Error(`Retenção do Drive falhou (${response.status}).`);
          }
        },
      });
    },
    removeWorkdir: async (workdir) => {
      rmSync(`${workdir}.tar`, { force: true });
      rmSync(workdir, { recursive: true, force: true });
    },
  };
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("production-backup.mjs")) {
  runProductionBackup(process.env, createDeps())
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : "Backup de produção falhou.";
      console.error(scrubSecrets(message, secretValues(process.env)));
      process.exit(1);
    });
}
