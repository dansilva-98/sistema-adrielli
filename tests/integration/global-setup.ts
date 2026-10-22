import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { assertLocalDatabaseAllowed } from "../../src/db/seed";
import { parseServerEnv } from "../../src/lib/env";

export default async function setup(): Promise<void> {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");

  const env = parseServerEnv(process.env);
  assertLocalDatabaseAllowed(env.APP_ENV, env.DATABASE_URL);

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 5 });

  try {
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN NOINHERIT;
        END IF;
      END
      $$;
    `);
    await sql.unsafe(
      "DROP SCHEMA IF EXISTS identity, content, commerce, clinic, audit, drizzle CASCADE",
    );
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: "src/db/migrations" });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
