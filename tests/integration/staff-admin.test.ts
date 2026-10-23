import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import {
  disableStaff,
  inviteStaffMember,
  replaceStaffRoles,
  StaffAdminError,
} from "@/modules/identity/staff-admin";

describe("último super admin", () => {
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  let owner: postgres.Sql;
  let sql: postgres.Sql;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    sql = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    for (const id of [firstId, secondId, actorId]) {
      await owner`insert into auth.users (id) values (${id}::uuid)`;
      await owner`
        insert into identity.users (id, kind, email, display_name)
        values (${id}::uuid, 'STAFF', ${`${id}@example.com`}, 'Equipe')
      `;
    }
    await owner`
      insert into identity.user_roles (user_id, role)
      values (${firstId}::uuid, 'SUPER_ADMIN'), (${secondId}::uuid, 'SUPER_ADMIN')
    `;
  });

  afterAll(async () => {
    const ids = [firstId, secondId, actorId];
    await owner`delete from identity.user_roles where user_id in ${owner(ids)}`;
    await owner`delete from identity.users where id in ${owner(ids)}`;
    await owner`delete from auth.users where id in ${owner(ids)}`;
    await owner.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("duas desativações simultâneas preservam um super admin ativo", async () => {
    const calls: string[] = [];
    const slow = async (id: string) => {
      calls.push(id);
      await new Promise((resolve) => setTimeout(resolve, 200));
    };
    const shared = {
      actorId,
      ip: null,
      unblockAuth: async () => undefined,
      report: () => undefined,
    };
    const other = postgres(String(process.env.TEST_DATABASE_URL), {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
    let results: PromiseSettledResult<void>[];
    try {
      results = await Promise.allSettled([
        disableStaff(sql, { ...shared, targetId: firstId, blockAuth: slow }),
        disableStaff(other, { ...shared, targetId: secondId, blockAuth: slow }),
      ]);
    } finally {
      await other.end({ timeout: 5 });
    }
    const refused = results.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof StaffAdminError &&
        result.reason.code === "last",
    );
    expect(refused).toHaveLength(1);
    const active = await sql<{ id: string }[]>`
      select u.id
      from identity.users u
      inner join identity.user_roles r on r.user_id = u.id
      where r.role = 'SUPER_ADMIN' and u.disabled_at is null and u.id in ${sql([firstId, secondId])}
    `;
    expect(active).toHaveLength(1);
    const audits = await sql<{ metadata: unknown }[]>`
      select metadata from audit.audit_log
      where action = 'user.disabled' and entity_id in ${sql([firstId, secondId])}
    `;
    expect(audits.length).toBeGreaterThan(0);
    for (const audit of audits) expect(audit.metadata).toEqual({});
    expect(calls.length).toBeGreaterThan(0);
  });

  it("não grava convite quando o Supabase recusa", async () => {
    const before = await sql<{ count: string }[]>`
      select count(*) from identity.users where id = ${actorId}::uuid
    `;
    await expect(
      inviteStaffMember(sql, {
        actorId,
        name: "Nova Pessoa",
        email: "nova@example.com",
        roles: ["CONTENT_ADMIN"],
        ip: null,
        invite: async () => {
          throw new Error("convite recusado");
        },
        cancelInvite: async () => undefined,
        report: () => undefined,
      }),
    ).rejects.toThrow("convite recusado");
    const after = await sql<{ count: string }[]>`
      select count(*) from identity.users where email = 'nova@example.com'
    `;
    expect(before[0]?.count).toBe("1");
    expect(after[0]?.count).toBe("0");
  });

  it("desfaz o convite quando a gravação falha", async () => {
    const cancelled: string[] = [];
    await expect(
      inviteStaffMember(sql, {
        actorId,
        name: "Sem Auth",
        email: "sem-auth@example.com",
        roles: ["CONTENT_ADMIN"],
        ip: null,
        invite: async () => ({ id: crypto.randomUUID() }),
        cancelInvite: async (userId) => {
          cancelled.push(userId);
        },
        report: () => undefined,
      }),
    ).rejects.toThrow();
    expect(cancelled).toHaveLength(1);
    const rows = await sql<{ count: string }[]>`
      select count(*) from identity.users where email = 'sem-auth@example.com'
    `;
    expect(rows[0]?.count).toBe("0");
  });

  it("não remove o papel do último super admin que sobrou", async () => {
    const active = await sql<{ id: string }[]>`
      select u.id
      from identity.users u
      inner join identity.user_roles r on r.user_id = u.id
      where r.role = 'SUPER_ADMIN' and u.disabled_at is null and u.id in ${sql([firstId, secondId])}
    `;
    const survivor = active[0]?.id;
    expect(survivor).toBeTruthy();
    await expect(
      replaceStaffRoles(sql, {
        actorId,
        targetId: survivor!,
        roles: ["CONTENT_ADMIN"],
        ip: null,
      }),
    ).rejects.toBeInstanceOf(StaffAdminError);
    const still = await sql<{ role: string }[]>`
      select role from identity.user_roles where user_id = ${survivor!}::uuid
    `;
    expect(still.map((row) => row.role)).toContain("SUPER_ADMIN");
  });
});
