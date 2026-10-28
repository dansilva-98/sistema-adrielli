export const PRIVATE_BUCKET = "clinic-private";
export const PUBLIC_BUCKET = "site-public";
export const RETENTION_COUNT = 30;
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const BACKUP_FOLDER_NAME = "adrielli-flores-backups";
export const AGE_HEADER = "age-encryption.org/v1\n";
export const AGE_VERSION = "1.3.2";
export const AGE_SHA256 =
  "cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10";
export const APP_SCHEMAS = "identity,content,commerce,clinic,audit,drizzle";
export const AUTH_DATA_TABLES = ["users", "identities", "mfa_factors"];

const AUTH_TABLES = [
  "audit_log_entries",
  "custom_oauth_providers",
  "flow_state",
  "identities",
  "instances",
  "mfa_amr_claims",
  "mfa_challenges",
  "mfa_factors",
  "mfa_recovery_code_sets",
  "mfa_recovery_codes",
  "oauth_authorizations",
  "oauth_client_states",
  "oauth_clients",
  "oauth_consents",
  "one_time_tokens",
  "refresh_tokens",
  "saml_providers",
  "saml_relay_states",
  "schema_migrations",
  "scim_tokens",
  "scim_users",
  "sessions",
  "sso_domains",
  "sso_providers",
  "users",
  "webauthn_challenges",
  "webauthn_credentials",
];

const AGE_RECIPIENT = /^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,}$/;
const FOLDER_ID = /^[a-zA-Z0-9_-]{10,}$/;
const BACKUP_NAME = /^adrielli-flores-backup-\d{8}\.age$/;
const FORBIDDEN_AUTH_DATA = [
  "refresh_tokens",
  "sessions",
  "one_time_tokens",
  "mfa_challenges",
];

export const REQUIRED_ENV = [
  "BACKUP_DATABASE_URL",
  "BACKUP_SUPABASE_URL",
  "BACKUP_SUPABASE_SERVICE_ROLE_KEY",
  "BACKUP_DRIVE_CLIENT_ID",
  "BACKUP_DRIVE_CLIENT_SECRET",
  "BACKUP_DRIVE_REFRESH_TOKEN",
  "BACKUP_DRIVE_FOLDER_ID",
];

export function excludedAuthTables() {
  return AUTH_TABLES.filter((table) => !AUTH_DATA_TABLES.includes(table))
    .map((table) => `auth.${table}`)
    .join(",");
}

export function dumpPlan() {
  const excluded = excludedAuthTables();
  return [
    { label: "auth-schema", args: ["--schema", "auth"], file: "auth-schema.sql" },
    {
      label: "auth-data",
      args: ["--data-only", "--schema", "auth", "--exclude", excluded],
      file: "auth-data.sql",
    },
    {
      label: "app-schema",
      args: ["--schema", APP_SCHEMAS],
      file: "app-schema.sql",
    },
    {
      label: "app-data",
      args: ["--data-only", "--schema", APP_SCHEMAS],
      file: "app-data.sql",
    },
  ];
}

export function supabaseDumpArgs(databaseUrl, planItem, filePath) {
  assertBackupDatabaseUrl(databaseUrl);
  return [
    "--yes",
    "--log-level",
    "error",
    "db",
    "dump",
    "--db-url",
    databaseUrl,
    ...planItem.args,
    "--file",
    filePath,
  ];
}

export function parseAgeRecipient(text) {
  if (text.includes("AGE-SECRET-KEY")) {
    throw new Error(
      "ops/backup/age-recipient.txt contém chave privada. O backup foi recusado.",
    );
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length !== 1 || !AGE_RECIPIENT.test(lines[0])) {
    throw new Error("Chave pública age ausente em ops/backup/age-recipient.txt.");
  }
  return lines[0];
}

export function assertAgeCiphertext(bytes) {
  const header = Buffer.from(bytes)
    .subarray(0, Buffer.byteLength(AGE_HEADER))
    .toString("utf8");
  if (header !== AGE_HEADER) {
    throw new Error("O arquivo não está criptografado com age. O envio foi recusado.");
  }
}

export function assertBackupDatabaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("BACKUP_DATABASE_URL inválida.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("BACKUP_DATABASE_URL inválida.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    throw new Error("BACKUP_DATABASE_URL recusada: host local.");
  }
  if (parsed.port === "6543") {
    throw new Error(
      "BACKUP_DATABASE_URL recusada: use o pooler de sessão na porta 5432.",
    );
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database === "adrielli_flores_test") {
    throw new Error("BACKUP_DATABASE_URL recusada: banco de teste.");
  }
  if (!parsed.username || !parsed.password || !database) {
    throw new Error("BACKUP_DATABASE_URL incompleta.");
  }
}

export function assertHttpsSupabaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("BACKUP_SUPABASE_URL inválida.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.includes(".")) {
    throw new Error("BACKUP_SUPABASE_URL inválida.");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    throw new Error("BACKUP_SUPABASE_URL recusada: host local.");
  }
}

export function assertFolderId(folderId) {
  if (!FOLDER_ID.test(folderId ?? "")) {
    throw new Error("BACKUP_DRIVE_FOLDER_ID inválido.");
  }
}

export function assertDriveScope(scope) {
  const parts = String(scope ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length !== 1 || parts[0] !== DRIVE_FILE_SCOPE) {
    throw new Error("O acesso ao Drive não é só drive.file. Token recusado.");
  }
}

export function assertConfigured(env) {
  if (env.BACKUP_CONFIRM !== "production") {
    throw new Error("Backup de produção recusado.");
  }
  for (const name of REQUIRED_ENV) {
    if (typeof env[name] !== "string" || env[name].trim() === "") {
      throw new Error(`Configuração ausente: ${name}.`);
    }
  }
  assertBackupDatabaseUrl(env.BACKUP_DATABASE_URL);
  assertHttpsSupabaseUrl(env.BACKUP_SUPABASE_URL);
  assertFolderId(env.BACKUP_DRIVE_FOLDER_ID.trim());
  if (env.BACKUP_SUPABASE_SERVICE_ROLE_KEY.trim().length < 20) {
    throw new Error("Configuração ausente: BACKUP_SUPABASE_SERVICE_ROLE_KEY.");
  }
}

export function backupDay(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Data do backup inválida.");
  }
  return `${year}${month}${day}`;
}

export function backupFileName(date) {
  return `adrielli-flores-backup-${backupDay(date)}.age`;
}

export function driveFileMetadata(name, folderId) {
  if (!BACKUP_NAME.test(name)) {
    throw new Error("Nome de backup recusado.");
  }
  assertFolderId(folderId);
  return { name, parents: [folderId] };
}

export function backupFolderMetadata() {
  return {
    name: BACKUP_FOLDER_NAME,
    mimeType: "application/vnd.google-apps.folder",
  };
}

export function buildConsentUrl({ clientId, redirectUri, state, codeChallenge }) {
  if (!clientId || !redirectUri || !state || !codeChallenge) {
    throw new Error("Autorização do Drive incompleta.");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_FILE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url;
}

export function backupListQuery(folderId) {
  assertFolderId(folderId);
  return [
    "name contains 'adrielli-flores-backup-'",
    `'${folderId}' in parents`,
    "trashed = false",
  ].join(" and ");
}

export function assertUploadLocation(location) {
  let url;
  try {
    url = new URL(location);
  } catch {
    throw new Error("Endereço de envio do Drive recusado.");
  }
  if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com") {
    throw new Error("Endereço de envio do Drive recusado.");
  }
  if (!url.pathname.startsWith("/upload/drive/")) {
    throw new Error("Endereço de envio do Drive recusado.");
  }
}

export function selectDeletions(files, { folderId, keep = RETENTION_COUNT, protectId }) {
  assertFolderId(folderId);
  if (!protectId) {
    throw new Error("Backup recém-enviado ausente.");
  }
  const candidates = [];
  for (const file of files) {
    if (!file || typeof file.id !== "string" || typeof file.name !== "string") {
      throw new Error("Lista do Drive inválida.");
    }
    if (!BACKUP_NAME.test(file.name)) continue;
    const parents = Array.isArray(file.parents) ? file.parents : [];
    if (!parents.includes(folderId)) {
      throw new Error("Arquivo de backup fora da pasta configurada. Nada foi apagado.");
    }
    candidates.push(file);
  }
  if (!candidates.some((file) => file.id === protectId)) {
    throw new Error("O backup recém-enviado não está na pasta configurada.");
  }
  const protectedFile = candidates.find((file) => file.id === protectId);
  const removed = [];
  for (const file of candidates) {
    if (file.id !== protectId && file.name === protectedFile.name) {
      removed.push(file);
    }
  }
  const removedIds = new Set(removed.map((file) => file.id));
  const remaining = candidates
    .filter((file) => !removedIds.has(file.id))
    .sort((left, right) => {
      if (left.name !== right.name) return left.name < right.name ? 1 : -1;
      const leftTime = left.createdTime ?? "";
      const rightTime = right.createdTime ?? "";
      if (leftTime !== rightTime) return leftTime < rightTime ? 1 : -1;
      return left.id < right.id ? 1 : -1;
    });
  let kept = 0;
  for (const file of remaining) {
    if (file.id === protectId) {
      kept += 1;
      continue;
    }
    if (kept < keep) {
      kept += 1;
      continue;
    }
    removed.push(file);
  }
  if (removed.some((file) => file.id === protectId)) {
    throw new Error("A retenção tentaria apagar o backup recém-enviado.");
  }
  return removed;
}

export function assertAuthDataDump(sql) {
  for (const table of AUTH_DATA_TABLES) {
    const header = `Name: ${table}; Type: TABLE DATA; Schema: auth`;
    if (!sql.includes(header) && !sql.includes(`"auth"."${table}"`)) {
      throw new Error(`O dump não inclui auth.${table}. O envio foi recusado.`);
    }
  }
  for (const table of FORBIDDEN_AUTH_DATA) {
    const header = `Name: ${table}; Type: TABLE DATA; Schema: auth`;
    if (sql.includes(header) || sql.includes(`"auth"."${table}"`)) {
      throw new Error(`O dump inclui auth.${table}. O envio foi recusado.`);
    }
  }
}

export function assembleDatabaseSql({ authSchema, authData, appSchema, appData }) {
  assertAuthDataDump(authData);
  return [
    "-- auth schema",
    authSchema,
    "-- auth data",
    authData,
    "-- schema",
    appSchema,
    "-- data",
    appData,
  ].join("\n");
}

export function clinicPrivateBucketRequired(databaseSql) {
  const sql = String(databaseSql ?? "");
  return (
    sql.includes("clinic.patient_attachments") ||
    sql.includes('"clinic"."patient_attachments"')
  );
}

export function classifyBucketResponse(status, bodyText) {
  if (status === 200) return "ok";
  if (status === 404 || (status === 400 && /bucket not found/i.test(bodyText ?? ""))) {
    return "absent";
  }
  return "error";
}

export function safeObjectPath(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 1024) {
    throw new Error("Caminho de anexo recusado.");
  }
  if (name.startsWith("/") || name.includes("\\") || name.includes("\0")) {
    throw new Error("Caminho de anexo recusado.");
  }
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Caminho de anexo recusado.");
  }
  return parts;
}

export function scrubSecrets(text, secrets) {
  let output = String(text ?? "");
  const values = [...secrets].filter(
    (secret) => typeof secret === "string" && secret.length >= 4,
  );
  values.sort((left, right) => right.length - left.length);
  for (const secret of values) {
    output = output.split(secret).join("[redigido]");
  }
  output = output.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redigido]");
  output = output.replace(/AGE-SECRET-KEY-1[A-Z0-9]+/g, "[redigido]");
  output = output.replace(/Bearer\s+\S+/gi, "Bearer [redigido]");
  return output;
}

export function manifestDocument(storage, date) {
  if (storage.publicStatus !== "included" && storage.publicStatus !== "empty") {
    throw new Error("O manifesto não registra o bucket site-public.");
  }
  return {
    product: "adrielli-flores",
    kind: "production-backup",
    created_on: backupDay(date),
    database: "included",
    auth_schema: true,
    private_bucket: PRIVATE_BUCKET,
    private_bucket_status: storage.status,
    object_count: storage.objectCount,
    object_bytes: storage.objectBytes,
    public_bucket: PUBLIC_BUCKET,
    public_bucket_status: storage.publicStatus,
    public_object_count: storage.publicObjectCount,
    public_object_bytes: storage.publicObjectBytes,
  };
}

export const ORPHAN_PATIENT_OBJECT_MS = 24 * 60 * 60 * 1000;

const PATIENT_OBJECT =
  /patients\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|jpe?g|png|webp)/gi;

export function storagePathsInDump(sql) {
  return new Set(
    [...String(sql ?? "").matchAll(PATIENT_OBJECT)].map((match) =>
      match[0].toLowerCase(),
    ),
  );
}

export function selectOrphanPatientObjects(objects, registeredPaths, nowMs) {
  const registered =
    registeredPaths instanceof Set
      ? registeredPaths
      : new Set([...(registeredPaths ?? [])].map((path) => String(path).toLowerCase()));
  const now = Number(nowMs);
  if (!Number.isFinite(now)) throw new Error("Relógio do backup inválido.");
  const selected = [];
  for (const object of objects ?? []) {
    const name = object?.name;
    if (typeof name !== "string" || !name.startsWith("patients/")) continue;
    if (registered.has(name.toLowerCase())) continue;
    const created = Date.parse(object.createdAt);
    if (!Number.isFinite(created)) continue;
    if (now - created <= ORPHAN_PATIENT_OBJECT_MS) continue;
    selected.push(name);
  }
  return selected;
}
