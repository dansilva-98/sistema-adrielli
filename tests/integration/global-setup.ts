import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { assertTestDatabaseUrl, TEST_DATABASE_NAME } from "../../src/db/seed";

export default async function setup(): Promise<void> {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("Recusado: TEST_DATABASE_URL ausente.");
  assertTestDatabaseUrl(process.env.APP_ENV, testUrl);

  await ensureTestDatabase(testUrl);

  const sql = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });

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

async function ensureTestDatabase(testUrl: string): Promise<void> {
  const admin = new URL(testUrl);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, prepare: false, connect_timeout: 5 });

  try {
    const rows = await sql<{ exists: boolean }[]>`
      select exists (
        select 1 from pg_database where datname = ${TEST_DATABASE_NAME}
      ) as exists
    `;
    if (!rows[0]?.exists) {
      await sql.unsafe(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
