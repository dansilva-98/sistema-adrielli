import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CONFIRM_TOKEN,
  CONTENT_TABLES,
  DEST_SQL_OPTIONS,
  IMAGE_COLUMNS,
  PRODUCTION_REF_ENV,
  SITE_PUBLIC_BUCKET,
  SOURCE_SQL_OPTIONS,
  SOURCE_URL_ENV,
  SOURCE_WRITE_PROBES,
  STAGING_REF_ENV,
  TARGET_URL_ENV,
  assertCopyProjects,
  assertCopyRequested,
  assertDistinctStorage,
  assertSourceRejectsWrites,
  assertStorageMatchesProjects,
  countsLine,
  describeDatabaseUrl,
  forStaging,
  imagePathsFromRows,
  isReadOnlyError,
  parseCopyArgs,
  poolerRef,
  protectedCountsLine,
  readContentFromSource,
  readCopyEnv,
  replaceContentInTransaction,
  requiredEnv,
  sitePublicImageUrl,
  supabaseProjectRef,
  copySiteImage,
  writeContent,
} from "../../scripts/copy-content-prod-to-staging.mjs";

const sourceUrl =
  "postgresql://postgres.prodref:super-secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const destUrl =
  "postgresql://postgres.stageref:staging-secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const expected = { production: "prodref", staging: "stageref" };
const imagePath = "11111111-1111-4111-8111-111111111111.webp";

function readOnlyError() {
  const error = new Error("cannot execute INSERT in a read-only transaction");
  (error as Error & { code: string }).code = "25006";
  return error;
}

function createTxMock(
  options: {
    users?: number;
    patients?: number;
    patientsAfter?: number;
    failOn?: string;
  } = {},
) {
  const log: string[] = [];
  let truncated = false;
  const run = async (strings: TemplateStringsArray) => {
    const text = strings.join("");
    log.push(text);
    if (options.failOn && text.includes(options.failOn)) {
      throw new Error(`falha em ${options.failOn}`);
    }
    if (text.includes("truncate")) truncated = true;
    return [];
  };
  const tx = Object.assign(run, {
    unsafe: async (text: string) => {
      log.push(text);
      if (text.includes("identity.users")) return [{ n: options.users ?? 1 }];
      if (text.includes("clinic.patients")) {
        return [
          {
            n: truncated
              ? (options.patientsAfter ?? options.patients ?? 2)
              : (options.patients ?? 2),
          },
        ];
      }
      return [];
    },
  });
  const proxy = new Proxy(tx, {
    apply(target, thisArg, args: unknown[]) {
      const first = args[0] as { raw?: unknown } | undefined;
      if (!Array.isArray(first) || !Object.prototype.hasOwnProperty.call(first, "raw")) {
        return first;
      }
      return target.apply(thisArg, args as [TemplateStringsArray]);
    },
  });
  return { tx: proxy, log };
}

describe("cópia do conteúdo público para o staging", () => {
  it("só grava com o token de confirmação e lê as variáveis inequívocas", () => {
    expect(parseCopyArgs([]).confirm).toBe(false);
    expect(parseCopyArgs([`--confirm=${CONFIRM_TOKEN}`]).confirm).toBe(true);
    expect(() => assertCopyRequested({ confirm: false, dryRun: false })).toThrow(
      /falta --confirm/,
    );
    expect(() => assertCopyRequested({ confirm: false, dryRun: true })).not.toThrow();
    const env = readCopyEnv(
      {
        [SOURCE_URL_ENV]: sourceUrl,
        [TARGET_URL_ENV]: destUrl,
        [PRODUCTION_REF_ENV]: "prodref",
        [STAGING_REF_ENV]: "stageref",
      },
      { needStorage: false },
    );
    expect(env.sourceUrl).toBe(sourceUrl);
    expect(env.destUrl).toBe(destUrl);
    expect(() => requiredEnv({}, SOURCE_URL_ENV)).toThrow(new RegExp(SOURCE_URL_ENV));
    expect(() =>
      readCopyEnv(
        {
          PRODUCTION_MIGRATIONS_DATABASE_URL: sourceUrl,
          STAGING_MIGRATIONS_DATABASE_URL: destUrl,
        },
        { needStorage: false },
      ),
    ).toThrow(new RegExp(SOURCE_URL_ENV));
    const withStorage = readCopyEnv({
      [SOURCE_URL_ENV]: sourceUrl,
      [TARGET_URL_ENV]: destUrl,
      [PRODUCTION_REF_ENV]: "prodref",
      [STAGING_REF_ENV]: "stageref",
      PRODUCTION_NEXT_PUBLIC_SUPABASE_URL: "https://prodref.supabase.co",
      PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: "prod-service-role-must-not-be-read",
      STAGING_NEXT_PUBLIC_SUPABASE_URL: "https://stageref.supabase.co",
      STAGING_SUPABASE_SERVICE_ROLE_KEY: "staging-key",
    });
    expect(withStorage.sourceStorage.supabaseUrl).toBe("https://prodref.supabase.co");
    expect(withStorage.sourceStorage).not.toHaveProperty("serviceRoleKey");
    expect(JSON.stringify(withStorage)).not.toContain(
      "prod-service-role-must-not-be-read",
    );
    expect(withStorage.destStorage.serviceRoleKey).toBe("staging-key");
  });

  it("recusa o mesmo projeto, refs trocados, banco local e Storage igual", () => {
    expect(poolerRef(sourceUrl)).toBe("prodref");
    expect(() => assertCopyProjects(sourceUrl, destUrl, expected)).not.toThrow();
    expect(() => assertCopyProjects(sourceUrl, sourceUrl, expected)).toThrow(
      /mesmo projeto/,
    );
    expect(() => assertCopyProjects(destUrl, sourceUrl, expected)).toThrow(/trocados/);
    expect(() =>
      assertCopyProjects(sourceUrl, destUrl, {
        production: "prodref",
        staging: "prodref",
      }),
    ).toThrow(/iguais/);
    expect(() =>
      assertCopyProjects(
        "postgresql://postgres.otherref:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
        destUrl,
        expected,
      ),
    ).toThrow(/produção/);
    expect(() =>
      poolerRef("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
    ).toThrow(/local/);
    expect(() =>
      poolerRef(
        "postgresql://app_runtime.prodref:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
      ),
    ).toThrow(/postgres\.<ref>/);
    expect(supabaseProjectRef("https://prodref.supabase.co")).toBe("prodref");
    expect(() =>
      assertStorageMatchesProjects({
        productionRef: "prodref",
        stagingRef: "stageref",
        sourceStorage: { supabaseUrl: "https://prodref.supabase.co" },
        destStorage: { supabaseUrl: "https://stageref.supabase.co" },
      }),
    ).not.toThrow();
    expect(() =>
      assertStorageMatchesProjects({
        productionRef: "prodref",
        stagingRef: "stageref",
        sourceStorage: { supabaseUrl: "https://stageref.supabase.co" },
        destStorage: { supabaseUrl: "https://prodref.supabase.co" },
      }),
    ).toThrow(/produção/);
    expect(() =>
      assertDistinctStorage(
        "https://prodref.supabase.co",
        "https://stageref.supabase.co",
      ),
    ).not.toThrow();
    expect(() =>
      assertDistinctStorage("https://prodref.supabase.co", "https://prodref.supabase.co"),
    ).toThrow(/mesmo/);
  });

  it("abre a origem em somente leitura e recusa INSERT e DELETE", async () => {
    expect(SOURCE_SQL_OPTIONS.connection.options).toMatch(
      /default_transaction_read_only=on/,
    );
    expect(DEST_SQL_OPTIONS.connection).not.toHaveProperty("options");
    expect(isReadOnlyError(readOnlyError())).toBe(true);
    expect(isReadOnlyError(new Error("duplicate key"))).toBe(false);

    const probes: string[] = [];
    const readOnlySql = {
      begin: async (
        fn: (tx: { unsafe: (text: string) => Promise<unknown> }) => unknown,
      ) =>
        fn({
          unsafe: async (text: string) => {
            probes.push(text);
            if (/^set transaction/i.test(text)) return [];
            throw readOnlyError();
          },
        }),
    };
    await assertSourceRejectsWrites(readOnlySql);
    expect(probes.some((text) => /set transaction read only/i.test(text))).toBe(true);
    expect(probes).toEqual(expect.arrayContaining(SOURCE_WRITE_PROBES));

    const writableSql = {
      begin: async (
        fn: (tx: { unsafe: (text: string) => Promise<unknown> }) => unknown,
      ) => fn({ unsafe: async () => [] }),
    };
    await expect(assertSourceRejectsWrites(writableSql)).rejects.toThrow(
      /aceitou escrita/,
    );

    const otherErrorSql = {
      begin: async (
        fn: (tx: { unsafe: (text: string) => Promise<unknown> }) => unknown,
      ) =>
        fn({
          unsafe: async (text: string) => {
            if (/^set transaction/i.test(text)) return [];
            throw new Error("duplicate key value");
          },
        }),
    };
    await expect(assertSourceRejectsWrites(otherErrorSql)).rejects.toThrow(
      /somente leitura/,
    );

    const statements: string[] = [];
    await readContentFromSource({
      begin: async (fn: (tx: unknown) => unknown) => {
        const tx = Object.assign(
          async (strings: TemplateStringsArray) => {
            statements.push(strings.join(""));
            return [];
          },
          {
            unsafe: async (text: string) => {
              statements.push(text);
              return [];
            },
          },
        );
        return fn(tx);
      },
    });
    expect(statements[0]).toMatch(/set transaction read only/i);
    expect(statements.some((text) => text.includes("content.site_settings"))).toBe(true);
  });

  it("substitui as quatro tabelas numa transação e aborta se pacientes mudarem", async () => {
    const empty = {
      site_settings: [],
      services: [],
      testimonials: [],
      faq: [],
    };
    const changed = createTxMock({ users: 1, patients: 2, patientsAfter: 9 });
    await expect(replaceContentInTransaction(changed.tx, empty)).rejects.toThrow(
      /pacientes|usuários/,
    );
    expect(changed.log.some((text) => text.includes("truncate content."))).toBe(true);

    const failed = createTxMock({ failOn: "insert" });
    let committed = false;
    await expect(
      writeContent(
        {
          begin: async (fn: (tx: unknown) => Promise<unknown>) => {
            await fn(failed.tx);
            committed = true;
          },
        },
        {
          ...empty,
          faq: [{ question: "Pergunta", answer: "Resposta" }],
        },
      ),
    ).rejects.toThrow(/falha em insert/);
    expect(committed).toBe(false);

    const ok = createTxMock({ users: 3, patients: 8 });
    const counts = await replaceContentInTransaction(ok.tx, empty);
    expect(counts).toEqual({ users: 3, patients: 8 });
    expect(ok.log.filter((text) => text.includes("identity.users")).length).toBe(2);
  });

  it("zera updated_by, copia só uuid.webp referenciado e não loga segredo", () => {
    const row = forStaging({
      quote: "Um relato",
      updated_by: "11111111-1111-4111-8111-111111111111",
      how_it_works: [{ title: "Contato", body: "" }],
    });
    expect(row.updated_by).toBeNull();
    expect(row.how_it_works).toBe('[{"title":"Contato","body":""}]');
    expect(
      imagePathsFromRows({
        services: [{ image_path: imagePath, title: "Avaliação" }],
        site_settings: [{ hero_image_path: null, contact_email: "a@b.c" }],
        testimonials: [{ quote: imagePath, image_path: null }],
      }),
    ).toEqual([imagePath]);
    expect(() =>
      imagePathsFromRows({
        services: [{ image_path: `clinic-private/${imagePath}` }],
      }),
    ).toThrow(/clinic-private/);
    expect(() =>
      imagePathsFromRows({
        services: [{ image_path: "nao-e-uuid.png" }],
      }),
    ).toThrow(/uuid\.webp/);
    expect(sitePublicImageUrl("https://prodref.supabase.co", imagePath)).toContain(
      `${SITE_PUBLIC_BUCKET}/${imagePath}`,
    );
    expect(sitePublicImageUrl("https://prodref.supabase.co", imagePath)).not.toContain(
      "clinic-private",
    );
    expect(() => sitePublicImageUrl("https://prodref.supabase.co", "../x.webp")).toThrow(
      /recusado/,
    );
    const line = countsLine({
      site_settings: [{}],
      services: [{}, {}],
      testimonials: [],
      faq: [{}],
    });
    expect(line).toBe("site_settings 1, services 2, testimonials 0, faq 1");
    expect(protectedCountsLine({ users: 3, patients: 8 })).toBe(
      "identity.users 3, clinic.patients 8",
    );
    expect(line).not.toContain("@");
    expect(IMAGE_COLUMNS).toEqual(["hero_image_path", "about_image_path", "image_path"]);
    expect(CONTENT_TABLES).toEqual(["site_settings", "services", "testimonials", "faq"]);
    const described = describeDatabaseUrl(sourceUrl);
    expect(described).toBe("host=aws-0-sa-east-1.pooler.supabase.com ref=prodref");
    expect(described).not.toContain("super-secret");
    expect(described).not.toContain("postgres.prodref");
  });

  it("copia a imagem no site-public e o script não escreve fora de content", async () => {
    const calls: {
      url: string;
      method: string;
      upsert?: string;
      authorization?: string;
    }[] = [];
    await copySiteImage(
      imagePath,
      { supabaseUrl: "https://prodref.supabase.co" },
      { supabaseUrl: "https://stageref.supabase.co", serviceRoleKey: "staging-key" },
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url);
        const headers = (init?.headers ?? {}) as Record<string, string>;
        calls.push({
          url: href,
          method: init?.method ?? "GET",
          upsert: headers["x-upsert"],
          authorization: headers.Authorization,
        });
        if (href.includes("/object/public/")) {
          return {
            ok: true,
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          };
        }
        expect(headers.Authorization).toBe("Bearer staging-key");
        return { ok: true };
      },
    );
    expect(calls[0]?.url).toContain("prodref.supabase.co");
    expect(calls[0]?.url).toContain("/object/public/");
    expect(calls[0]?.authorization).toBeUndefined();
    expect(calls[1]?.url).toContain(`${SITE_PUBLIC_BUCKET}/${imagePath}`);
    expect(calls[1]?.url).not.toContain("clinic-private");
    expect(calls[1]?.upsert).toBe("true");
    expect(calls[1]?.authorization).toBe("Bearer staging-key");

    const source = readFileSync("scripts/copy-content-prod-to-staging.mjs", "utf8");
    expect(source).toContain("truncate content.site_settings, content.services");
    expect(source).toContain("set transaction read only");
    expect(source).toContain("default_transaction_read_only=on");
    expect(source).toContain("assertSourceRejectsWrites");
    expect(source).toContain("replaceContentInTransaction");
    expect(source).toContain(SOURCE_URL_ENV);
    expect(source).toContain(TARGET_URL_ENV);
    expect(source).toContain(STAGING_REF_ENV);
    expect(source).not.toContain("loadEnvFile");
    expect(source).not.toContain(".env.local");
    expect(source).not.toContain("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toMatch(/truncate identity/i);
    expect(source).not.toMatch(/truncate clinic/i);
    expect(source).not.toMatch(/delete from identity/i);
    expect(source).not.toMatch(/delete from clinic/i);
    expect(source).not.toMatch(/insert into identity/i);
    expect(source).not.toMatch(/insert into clinic/i);
    expect(source).not.toMatch(/object\/clinic-private/);
    expect(source).toContain("updated_by: null");
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).toContain("content:copy-prod-to-staging");
    const dbReadme = readFileSync("src/db/README.md", "utf8");
    expect(dbReadme).toMatch(/sessão do terminal/i);
    expect(dbReadme).toMatch(/histórico/i);
    expect(dbReadme).not.toContain("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY");
    expect(dbReadme).toMatch(/workflow Staging/i);
    expect(dbReadme).toMatch(/use cache/);
  });
});
