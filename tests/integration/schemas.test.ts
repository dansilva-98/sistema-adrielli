import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertTestDatabaseUrl } from "../../src/db/seed";

const SCHEMAS = ["audit", "clinic", "commerce", "content", "identity"];

describe("schemas e papel anon", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error("Recusado: TEST_DATABASE_URL ausente.");
    assertTestDatabaseUrl(process.env.APP_ENV, testUrl);
    sql = postgres(testUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
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

  it("responde ok quando o banco de testes aceita a conexão", async () => {
    const rows = await sql<{ ok: number }[]>`select 1 as ok`;
    expect(Number(rows[0]?.ok)).toBe(1);
  });
});
