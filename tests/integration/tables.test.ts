import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";

describe("tabelas de identidade e auditoria", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) {
      throw new Error("Recusado: URLs de teste ausentes.");
    }
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });

    await owner`insert into auth.users (id) values (${STAFF_ID}::uuid), (${CUSTOMER_ID}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values
        (${STAFF_ID}::uuid, 'STAFF', 'staff@example.com', 'Staff'),
        (${CUSTOMER_ID}::uuid, 'CUSTOMER', 'customer@example.com', 'Customer')
    `;
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
    await runtime?.end({ timeout: 5 });
  });

  it("nega leitura de identity e audit ao papel anon", async () => {
    for (const statement of [
      "SELECT 1 FROM identity.users",
      "SELECT 1 FROM audit.audit_log",
    ]) {
      await expect(
        owner.begin(async (transaction) => {
          await transaction.unsafe("SET LOCAL ROLE anon");
          await transaction.unsafe(statement);
        }),
      ).rejects.toThrow(/permission denied|permissão negada/i);
    }
  });

  it("só deixa papel em usuário STAFF e referencia auth.users sem cascata", async () => {
    const fk = await owner<{ confdeltype: string }[]>`
      select confdeltype
      from pg_constraint
      where conname = 'users_id_auth_users_id_fk'
    `;
    expect(fk[0]?.confdeltype).toBe("a");

    await expect(
      owner`
        insert into identity.user_roles (user_id, role)
        values (${CUSTOMER_ID}::uuid, 'CONTENT_ADMIN')
      `,
    ).rejects.toThrow(/only STAFF/);

    await owner`
      insert into identity.user_roles (user_id, role)
      values (${STAFF_ID}::uuid, 'SUPER_ADMIN')
    `;
    const roles = await runtime<{ role: string }[]>`
      select role::text as role from identity.user_roles where user_id = ${STAFF_ID}::uuid
    `;
    expect(roles.map((row) => row.role)).toEqual(["SUPER_ADMIN"]);
  });

  it("impede update e delete em audit_log pelo privilégio e pelo trigger", async () => {
    const inserted = await owner<{ id: string }[]>`
      insert into audit.audit_log (action)
      values ('user.bootstrap')
      returning id
    `;
    const id = inserted[0]?.id;
    expect(id).toBeTruthy();

    await expect(
      runtime`update audit.audit_log set action = 'auth.logout' where id = ${id}::uuid`,
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await expect(
      runtime`delete from audit.audit_log where id = ${id}::uuid`,
    ).rejects.toThrow(/permission denied|permissão negada/i);

    await expect(
      owner`update audit.audit_log set action = 'auth.logout' where id = ${id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      owner`delete from audit.audit_log where id = ${id}::uuid`,
    ).rejects.toThrow(/immutable/);
  });
});
