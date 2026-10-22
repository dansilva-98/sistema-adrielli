import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function readStatus() {
  const binary = join(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  const result =
    process.platform === "win32"
      ? spawnSync(`"${binary}" status -o env`, { encoding: "utf8", shell: true })
      : spawnSync(binary, ["status", "-o", "env"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error("supabase status falhou. Rode pnpm exec supabase start antes.");
    process.exit(1);
  }
  return result.stdout;
}

function valueOf(source, key) {
  const match = source.match(
    new RegExp(`^${key}=(?:"([^"]*)"|'([^']*)'|([^\\s]+))$`, "m"),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!value) {
    console.error(`supabase status não retornou ${key}`);
    process.exit(1);
  }
  return value;
}

if (existsSync(".env.local")) {
  console.log(".env.local já existe. Nada foi sobrescrito.");
  process.exit(0);
}

function withDatabase(connectionString, databaseName) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

const status = readStatus();
const databaseUrl = valueOf(status, "DB_URL");
const lines = [
  `DATABASE_URL=${databaseUrl}`,
  `TEST_DATABASE_URL=${withDatabase(databaseUrl, "ana_aprender_test")}`,
  `NEXT_PUBLIC_SUPABASE_URL=${valueOf(status, "API_URL")}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${valueOf(status, "ANON_KEY")}`,
  `SUPABASE_SERVICE_ROLE_KEY=${valueOf(status, "SERVICE_ROLE_KEY")}`,
  "SENTRY_DSN=https://public@o0.ingest.sentry.io/0",
  "NEXT_PUBLIC_SENTRY_DSN=https://public@o0.ingest.sentry.io/0",
  "APP_ENV=development",
  "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000",
  "",
];

writeFileSync(".env.local", lines.join("\n"), { encoding: "utf8" });
console.log(
  ".env.local escrito a partir do Supabase local. Os valores não foram impressos.",
);
