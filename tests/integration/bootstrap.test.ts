import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BootstrapRefusedError,
  bootstrapSuperAdmin,
} from "@/modules/identity/bootstrap-super-admin";
import { TEST_DATABASE_NAME } from "../../src/db/seed";

describe("bootstrap do primeiro SUPER_ADMIN", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`delete from identity.user_roles where role = 'SUPER_ADMIN'`;
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
    await runtime?.end({ timeout: 5 });
  });

  it("cria o primeiro SUPER_ADMIN e recusa o segundo", async () => {
    let invites = 0;
    const invite = async () => {
      invites += 1;
      const id = crypto.randomUUID();
      await owner`insert into auth.users (id) values (${id}::uuid)`;
      return { id };
    };

    const first = await bootstrapSuperAdmin({
      sql: runtime,
      email: "primeiro@example.com",
      invite,
    });

    const role = await runtime<{ role: string; kind: string }[]>`
      select user_roles.role::text as role, users.kind::text as kind
      from identity.user_roles
      join identity.users on users.id = user_roles.user_id
      where user_roles.user_id = ${first.userId}::uuid
    `;
    expect(role).toEqual([{ role: "SUPER_ADMIN", kind: "STAFF" }]);

    const audit = await runtime<{ metadata: unknown; actor: string | null; type: string }[]>`
      select metadata, pg_typeof(metadata) as type, actor_user_id::text as actor
      from audit.audit_log
      where action = 'user.bootstrap' and entity_id = ${first.userId}::uuid
    `;
    const metadata = audit[0]?.metadata;
    const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    expect(audit[0]?.type).toBe("jsonb");
    expect(audit[0]?.actor).toBeNull();
    expect(parsed).toEqual({});
    expect(JSON.stringify(parsed)).not.toContain("primeiro@example.com");

    await expect(
      bootstrapSuperAdmin({
        sql: runtime,
        email: "segundo@example.com",
        invite,
      }),
    ).rejects.toBeInstanceOf(BootstrapRefusedError);
    expect(invites).toBe(1);

    const count = await runtime<{ total: number }[]>`
      select count(*)::int as total from identity.user_roles where role = 'SUPER_ADMIN'
    `;
    expect(count[0]?.total).toBe(1);
  });
});
