import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertTestDatabaseUrl, TEST_DATABASE_NAME } from "../../src/db/seed";

const SCHEMAS = ["audit", "clinic", "commerce", "content", "identity"];

describe("schemas e papel anon", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let closeDatabase: () => Promise<void>;
  let pingDatabase: () => Promise<boolean>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl) throw new Error("Recusado: TEST_DATABASE_URL ausente.");
    if (!migrationsUrl) throw new Error("Recusado: MIGRATIONS_DATABASE_URL ausente.");
    assertTestDatabaseUrl(process.env.APP_ENV, testUrl);
    process.env.DATABASE_URL = testUrl;
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
    runtime = postgres(testUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
    const client = await import("@/db/client");
    closeDatabase = client.closeDatabase;
    pingDatabase = client.pingDatabase;
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
    await runtime?.end({ timeout: 5 });
    await closeDatabase?.();
  });

  it("cria os cinco schemas", async () => {
    const rows = await owner<{ nspname: string }[]>`
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
        owner.begin(async (transaction) => {
          await transaction.unsafe(`SET LOCAL ROLE ${role}`);
          await transaction.unsafe("SELECT 1 FROM identity.__denied");
        }),
      ).rejects.toThrow(/permission denied|permissão negada/i);
    }
  });

  it("dá ao app_runtime login e só USAGE nos cinco schemas", async () => {
    const role = await owner<
      {
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
      }[]
    >`
      select rolcanlogin, rolsuper, rolcreatedb
      from pg_roles
      where rolname = 'app_runtime'
    `;
    expect(role[0]?.rolcanlogin).toBe(true);
    expect(role[0]?.rolsuper).toBe(false);
    expect(role[0]?.rolcreatedb).toBe(false);

    for (const schema of SCHEMAS) {
      const privileges = await owner<{ usage: boolean; create: boolean }[]>`
        select has_schema_privilege('app_runtime', ${schema}, 'USAGE') as usage,
               has_schema_privilege('app_runtime', ${schema}, 'CREATE') as create
      `;
      expect(privileges[0]?.usage).toBe(true);
      expect(privileges[0]?.create).toBe(false);
    }
  });

  it("responde ok em adrielli_flores_test quando pingDatabase conecta", async () => {
    const rows = await runtime<{ current_user: string; name: string }[]>`
      select current_user, current_database() as name
    `;
    expect(rows[0]?.current_user).toBe("app_runtime");
    expect(rows[0]?.name).toBe("adrielli_flores_test");
    await expect(pingDatabase()).resolves.toBe(true);
  });
});
