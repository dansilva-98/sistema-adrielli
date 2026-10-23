import { spawnSync } from "node:child_process";

import { describeDatabaseUrl, normalizeDatabaseUrl } from "./h1-db-url.mjs";

const raw = process.env.MIGRATIONS_DATABASE_URL ?? "";
const normalized = normalizeDatabaseUrl(raw);
if (!normalized) {
  console.log(`MIGRATIONS_DATABASE_URL não é uma URL. ${describeDatabaseUrl(raw)}`);
  process.exit(1);
}

const result = spawnSync("pnpm", ["db:migrate"], {
  stdio: "inherit",
  env: { ...process.env, MIGRATIONS_DATABASE_URL: normalized },
});
process.exit(result.status ?? 1);
