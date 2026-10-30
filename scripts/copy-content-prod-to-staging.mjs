import { pathToFileURL } from "node:url";
import postgres from "postgres";

export const CONFIRM_TOKEN = "copy-content-production-to-staging";
export const CONTENT_TABLES = ["site_settings", "services", "testimonials", "faq"];
export const IMAGE_COLUMNS = ["hero_image_path", "about_image_path", "image_path"];
export const SITE_PUBLIC_BUCKET = "site-public";
export const SOURCE_URL_ENV = "SOURCE_PRODUCTION_DATABASE_URL";
export const TARGET_URL_ENV = "TARGET_STAGING_DATABASE_URL";
export const PRODUCTION_REF_ENV = "PRODUCTION_PROJECT_REF";
export const STAGING_REF_ENV = "STAGING_PROJECT_REF";
export const PROTECTED_COUNTS = [
  { id: "users", sql: "select count(*)::int as n from identity.users" },
  { id: "patients", sql: "select count(*)::int as n from clinic.patients" },
];
export const SOURCE_WRITE_PROBES = [
  "insert into content.faq (question, answer) values ('readonly-probe', 'readonly-probe')",
  "delete from content.faq where false",
];
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const SITE_IMAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export const SOURCE_SQL_OPTIONS = {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  ssl: "require",
  connection: {
    application_name: "copy-content-source",
    options: "-c default_transaction_read_only=on",
  },
};

export const DEST_SQL_OPTIONS = {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  ssl: "require",
  connection: {
    application_name: "copy-content-target",
  },
};

export function parseCopyArgs(argv) {
  return {
    confirm: argv.includes(`--confirm=${CONFIRM_TOKEN}`),
    dryRun: argv.includes("--dry-run"),
  };
}

export function assertCopyRequested(args) {
  if (args.dryRun) return;
  if (!args.confirm) {
    throw new Error(
      `Recusado: falta --confirm=${CONFIRM_TOKEN}. Use --dry-run para só contar.`,
    );
  }
}

export function requiredEnv(env, name) {
  const value = typeof env[name] === "string" ? env[name].trim() : "";
  if (!value) throw new Error(`Recusado: ${name} ausente.`);
  return value;
}

export function readCopyEnv(env, options = {}) {
  const copied = {
    sourceUrl: requiredEnv(env, SOURCE_URL_ENV),
    destUrl: requiredEnv(env, TARGET_URL_ENV),
    productionRef: requiredEnv(env, PRODUCTION_REF_ENV),
    stagingRef: requiredEnv(env, STAGING_REF_ENV),
    sourceStorage: {
      supabaseUrl: "",
      serviceRoleKey: "",
    },
    destStorage: {
      supabaseUrl: "",
      serviceRoleKey: "",
    },
  };
  if (options.needStorage !== false) {
    copied.sourceStorage = {
      supabaseUrl: requiredEnv(env, "PRODUCTION_NEXT_PUBLIC_SUPABASE_URL"),
      serviceRoleKey: requiredEnv(env, "PRODUCTION_SUPABASE_SERVICE_ROLE_KEY"),
    };
    copied.destStorage = {
      supabaseUrl: requiredEnv(env, "STAGING_NEXT_PUBLIC_SUPABASE_URL"),
      serviceRoleKey: requiredEnv(env, "STAGING_SUPABASE_SERVICE_ROLE_KEY"),
    };
  }
  return copied;
}

export function poolerRef(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Recusado: URL de banco inválida.");
  }
  const host = parsed.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) {
    throw new Error("Recusado: a cópia não usa banco local.");
  }
  const user = decodeURIComponent(parsed.username);
  const [role, ...refParts] = user.split(".");
  const ref = refParts.join(".");
  if (role !== "postgres" || !ref) {
    throw new Error(
      "Recusado: a URL precisa usar o usuário postgres.<ref> das migrations.",
    );
  }
  return ref;
}

export function describeDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return `host=${parsed.hostname} ref=${poolerRef(databaseUrl)}`;
}

export function supabaseProjectRef(supabaseUrl) {
  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("Recusado: URL do Storage inválida.");
  }
  const host = parsed.hostname.toLowerCase();
  const [ref, ...rest] = host.split(".");
  if (!ref || rest.join(".") !== "supabase.co") {
    throw new Error("Recusado: a URL do Storage precisa ser https://<ref>.supabase.co.");
  }
  return ref;
}

export function assertCopyProjects(sourceUrl, destUrl, expected) {
  const source = poolerRef(sourceUrl);
  const dest = poolerRef(destUrl);
  if (expected.production === expected.staging) {
    throw new Error(
      "Recusado: os project-refs de produção e staging não podem ser iguais.",
    );
  }
  if (source === dest) {
    throw new Error("Recusado: origem e destino não podem ser o mesmo projeto.");
  }
  if (source === expected.staging || dest === expected.production) {
    throw new Error("Recusado: os project-refs de produção e staging estão trocados.");
  }
  if (source !== expected.production) {
    throw new Error("Recusado: a origem não corresponde ao project-ref da produção.");
  }
  if (dest !== expected.staging) {
    throw new Error("Recusado: o destino não corresponde ao project-ref do staging.");
  }
}

export function assertDistinctStorage(sourceOrigin, destOrigin) {
  let source;
  let dest;
  try {
    source = new URL(sourceOrigin).origin;
    dest = new URL(destOrigin).origin;
  } catch {
    throw new Error("Recusado: URL do Storage inválida.");
  }
  if (source === dest) {
    throw new Error("Recusado: o Storage de origem e destino não podem ser o mesmo.");
  }
}

export function assertStorageMatchesProjects(env) {
  const sourceRef = supabaseProjectRef(env.sourceStorage.supabaseUrl);
  const destRef = supabaseProjectRef(env.destStorage.supabaseUrl);
  if (sourceRef !== env.productionRef) {
    throw new Error("Recusado: o Storage de origem não é o projeto de produção.");
  }
  if (destRef !== env.stagingRef) {
    throw new Error("Recusado: o Storage de destino não é o projeto de staging.");
  }
}

export function forStaging(row) {
  const next = { ...row, updated_by: null };
  if (next.how_it_works && typeof next.how_it_works !== "string") {
    next.how_it_works = JSON.stringify(next.how_it_works);
  }
  return next;
}

export function imagePathsFromRows(tables) {
  const paths = new Set();
  for (const rows of Object.values(tables)) {
    for (const row of rows) {
      for (const column of IMAGE_COLUMNS) {
        const value = row[column];
        if (typeof value !== "string" || value.length === 0) continue;
        if (value.includes("clinic-private")) {
          throw new Error("Recusado: caminho clinic-private.");
        }
        if (!SITE_IMAGE_PATH.test(value)) {
          throw new Error("Recusado: imagem fora do padrão uuid.webp.");
        }
        paths.add(value);
      }
    }
  }
  return [...paths];
}

export function sitePublicImageUrl(origin, path) {
  if (path.includes("clinic-private") || !SITE_IMAGE_PATH.test(path)) {
    throw new Error("Caminho de imagem recusado.");
  }
  return new URL(`/storage/v1/object/public/${SITE_PUBLIC_BUCKET}/${path}`, origin).href;
}

export function countsLine(tables) {
  return CONTENT_TABLES.map((table) => `${table} ${tables[table]?.length ?? 0}`).join(
    ", ",
  );
}

export function protectedCountsLine(counts) {
  return `identity.users ${counts.users}, clinic.patients ${counts.patients}`;
}

export function isReadOnlyError(error) {
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "25006" || /read-?only transaction/i.test(message);
}

function openSql(url, options) {
  return postgres(url, options);
}

export async function readProtectedCounts(sql) {
  const users = await sql.unsafe(PROTECTED_COUNTS[0].sql);
  const patients = await sql.unsafe(PROTECTED_COUNTS[1].sql);
  return { users: users[0]?.n ?? 0, patients: patients[0]?.n ?? 0 };
}

export async function readContent(sql) {
  return {
    site_settings: await sql`select * from content.site_settings order by id`,
    services: await sql`select * from content.services order by sort_order, id`,
    testimonials: await sql`select * from content.testimonials order by sort_order, id`,
    faq: await sql`select * from content.faq order by sort_order, id`,
  };
}

export async function readContentFromSource(sql) {
  return sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return readContent(tx);
  });
}

export async function assertSourceRejectsWrites(sql) {
  await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    for (const statement of SOURCE_WRITE_PROBES) {
      try {
        await tx.unsafe(statement);
        throw new Error("Recusado: a origem aceitou escrita.");
      } catch (error) {
        if (error instanceof Error && /aceitou escrita/.test(error.message)) {
          throw error;
        }
        if (!isReadOnlyError(error)) {
          throw new Error("Recusado: a origem não está em modo somente leitura.");
        }
      }
    }
  });
}

async function insertTable(tx, table, rows) {
  if (rows.length === 0) return;
  const payload = rows.map(forStaging);
  if (table === "site_settings") {
    await tx`insert into content.site_settings ${tx(payload)}`;
    return;
  }
  if (table === "services") {
    await tx`insert into content.services ${tx(payload)}`;
    return;
  }
  if (table === "testimonials") {
    await tx`insert into content.testimonials ${tx(payload)}`;
    return;
  }
  if (table === "faq") {
    await tx`insert into content.faq ${tx(payload)}`;
    return;
  }
  throw new Error("Tabela recusada.");
}

export async function replaceContentInTransaction(tx, tables) {
  const before = await readProtectedCounts(tx);
  await tx`truncate content.site_settings, content.services, content.testimonials, content.faq`;
  for (const table of CONTENT_TABLES) {
    await insertTable(tx, table, tables[table] ?? []);
  }
  const after = await readProtectedCounts(tx);
  if (after.users !== before.users || after.patients !== before.patients) {
    throw new Error("Recusado: usuários ou pacientes do staging mudaram.");
  }
  return after;
}

export async function writeContent(sql, tables) {
  return sql.begin(async (tx) => replaceContentInTransaction(tx, tables));
}

export async function copySiteImage(path, source, dest, fetchImpl) {
  const download = await fetchImpl(sitePublicImageUrl(source.supabaseUrl, path));
  if (!download.ok) {
    throw new Error(`Falha ao ler a imagem (${download.status}).`);
  }
  const body = Buffer.from(await download.arrayBuffer());
  const uploadUrl = new URL(
    `/storage/v1/object/${SITE_PUBLIC_BUCKET}/${path}`,
    dest.supabaseUrl,
  );
  if (uploadUrl.pathname.includes("clinic-private")) {
    throw new Error("Recusado: caminho clinic-private.");
  }
  const upload = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dest.serviceRoleKey}`,
      apikey: dest.serviceRoleKey,
      "Content-Type": "image/webp",
      "x-upsert": "true",
    },
    body,
  });
  if (!upload.ok) {
    throw new Error(`Falha ao gravar a imagem (${upload.status}).`);
  }
}

export async function copyContent(env, args, fetchImpl = globalThis.fetch) {
  assertCopyRequested(args);
  assertCopyProjects(env.sourceUrl, env.destUrl, {
    production: env.productionRef,
    staging: env.stagingRef,
  });
  if (!args.dryRun) {
    assertDistinctStorage(env.sourceStorage.supabaseUrl, env.destStorage.supabaseUrl);
    assertStorageMatchesProjects(env);
  }

  const source = openSql(env.sourceUrl, SOURCE_SQL_OPTIONS);
  const dest = openSql(env.destUrl, args.dryRun ? SOURCE_SQL_OPTIONS : DEST_SQL_OPTIONS);
  try {
    await source.unsafe("set default_transaction_read_only = on");
    await assertSourceRejectsWrites(source);
    const tables = await readContentFromSource(source);
    const images = imagePathsFromRows(tables);
    if (args.dryRun) {
      const protectedCounts = await readProtectedCounts(dest);
      return {
        dryRun: true,
        tables,
        images: images.length,
        protected: protectedCounts,
      };
    }
    for (const path of images) {
      await copySiteImage(path, env.sourceStorage, env.destStorage, fetchImpl);
    }
    const protectedCounts = await writeContent(dest, tables);
    return {
      dryRun: false,
      tables,
      images: images.length,
      protected: protectedCounts,
    };
  } finally {
    await source.end({ timeout: 5 });
    await dest.end({ timeout: 5 });
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  try {
    const args = parseCopyArgs(process.argv.slice(2));
    const env = readCopyEnv(process.env, { needStorage: !args.dryRun });
    console.log(`Origem: ${describeDatabaseUrl(env.sourceUrl)}`);
    console.log(`Destino: ${describeDatabaseUrl(env.destUrl)}`);
    const result = await copyContent(env, args);
    const prefix = result.dryRun ? "Leitura" : "Cópia";
    console.log(`${prefix}: ${countsLine(result.tables)}. Imagens ${result.images}.`);
    console.log(`Preservado: ${protectedCountsLine(result.protected)}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "A cópia falhou.";
    console.error(message);
    process.exit(1);
  }
}
