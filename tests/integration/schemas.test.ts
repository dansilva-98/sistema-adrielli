import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertTestDatabaseUrl } from "../../src/db/seed";

const SCHEMAS = ["audit", "clinic", "commerce", "content", "identity"];

describe("schemas e papel anon", () => {
  let sql: ReturnType<typeof postgres>;
  let closeDatabase: () => Promise<void>;
  let pingDatabase: () => Promise<boolean>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error("Recusado: TEST_DATABASE_URL ausente.");
    assertTestDatabaseUrl(process.env.APP_ENV, testUrl);
    process.env.DATABASE_URL = testUrl;
    sql = postgres(testUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
    const client = await import("@/db/client");
    closeDatabase = client.closeDatabase;
    pingDatabase = client.pingDatabase;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDatabase?.();
  });

  it("cria os cinco schemas", async () => {
    const rows = await sql<{ nspname: string }[]>`
      select nspname
      from pg_namespace
      where nspname in ('identity', 'content', 'commerce', 'clinic', 'audit')
      order by nspname
    `;
    expect(rows.map((row) => row.nspname)).toEqual(SCHEMAS);
  });

  it("nega consulta do papel anon e authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(
        sql.begin(async (transaction) => {
          await transaction.unsafe(`SET LOCAL ROLE ${role}`);
          await transaction.unsafe("SELECT 1 FROM identity.__denied");
        }),
      ).rejects.toThrow(/permission denied|permissão negada/i);
    }
  });

  it("responde ok em adrielli_flores_test quando pingDatabase conecta", async () => {
    const rows = await sql<{ name: string }[]>`select current_database() as name`;
    expect(rows[0]?.name).toBe("adrielli_flores_test");
    await expect(pingDatabase()).resolves.toBe(true);
  });
});
