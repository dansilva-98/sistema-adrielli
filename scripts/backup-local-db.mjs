import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { join } from "node:path";

function loadLocalEnv() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function dump(extraArgs, file) {
  const binary = join(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  const args = ["db", "dump", "--local", ...extraArgs, "--file", file];
  const result =
    process.platform === "win32"
      ? spawnSync(`"${binary}" ${args.join(" ")}`, { encoding: "utf8", shell: true })
      : spawnSync(binary, args, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error("supabase db dump falhou. O backup não foi gravado.");
    process.exit(1);
  }
}

loadLocalEnv();
if (process.env.APP_ENV !== "development") {
  console.error("db:backup recusado: só executa quando APP_ENV=development.");
  process.exit(1);
}

const AUTH_DATA_TABLES = ["users", "identities", "mfa_factors"];
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
const excludedAuthTables = AUTH_TABLES.filter(
  (table) => !AUTH_DATA_TABLES.includes(table),
)
  .map((table) => `auth.${table}`)
  .join(",");

const directory = "backups";
mkdirSync(directory, { recursive: true });
const target = join(directory, `local-${stamp()}.sql`);
const schemaFile = join(directory, ".schema.sql");
const authSchemaFile = join(directory, ".auth-schema.sql");
const authDataFile = join(directory, ".auth-data.sql");
const dataFile = join(directory, ".data.sql");

try {
  dump([], schemaFile);
  dump(["--schema", "auth"], authSchemaFile);
  dump(
    ["--data-only", "--schema", "auth", "--exclude", excludedAuthTables],
    authDataFile,
  );
  dump(["--data-only"], dataFile);
  const authData = readFileSync(authDataFile, "utf8");
  for (const table of AUTH_DATA_TABLES) {
    const header = `Name: ${table}; Type: TABLE DATA; Schema: auth`;
    if (!authData.includes(header) && !authData.includes(`"auth"."${table}"`)) {
      throw new Error(`db:backup recusado: o dump não inclui auth.${table}.`);
    }
  }
  writeFileSync(
    target,
    [
      "-- schema",
      readFileSync(schemaFile, "utf8"),
      "-- auth schema",
      readFileSync(authSchemaFile, "utf8"),
      "-- auth data",
      authData,
      "-- data",
      readFileSync(dataFile, "utf8"),
    ].join("\n"),
    { encoding: "utf8" },
  );
} finally {
  rmSync(schemaFile, { force: true });
  rmSync(authSchemaFile, { force: true });
  rmSync(authDataFile, { force: true });
  rmSync(dataFile, { force: true });
}

console.log(`Backup local gravado em ${target}`);
