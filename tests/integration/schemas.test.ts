import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, pingDatabase } from "@/db/client";
import { parseServerEnv } from "@/lib/env";

const SCHEMAS = ["audit", "clinic", "commerce", "content", "identity"];

describe("schemas e papel anon", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    sql = postgres(parseServerEnv(process.env).DATABASE_URL, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await closeDatabase();
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

  it("responde ok quando o banco aceita a conexão", async () => {
    await expect(pingDatabase()).resolves.toBe(true);
  });
});
