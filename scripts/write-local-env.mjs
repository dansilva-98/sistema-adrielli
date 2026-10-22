import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

function readStatus() {
  const result = spawnSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    encoding: "utf8",
    shell: true,
  });
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

const status = readStatus();
const lines = [
  `DATABASE_URL=${valueOf(status, "DB_URL")}`,
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
