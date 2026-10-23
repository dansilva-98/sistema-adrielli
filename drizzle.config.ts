import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

import { parseMigrationsEnv } from "./src/lib/env";

if (!process.env.MIGRATIONS_DATABASE_URL) {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

const env = parseMigrationsEnv(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: env.MIGRATIONS_DATABASE_URL,
  },
  strict: true,
});
