import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/db/audit-actions";
import { recordAudit } from "@/modules/audit/record";
import { TEST_DATABASE_NAME } from "../../src/db/seed";

describe("auditoria", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  const created: string[] = [];

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
  });

  afterAll(async () => {
    if (created.length > 0) {
      await owner`delete from identity.user_roles where user_id in ${owner(created)}`;
      await owner`delete from identity.users where id in ${owner(created)}`;
      await owner`delete from auth.users where id in ${owner(created)}`;
    }
    await owner?.end({ timeout: 5 });
    await runtime?.end({ timeout: 5 });
  });

  it("grava cada evento do épico numa transação, sem dado pessoal", async () => {
    const id = crypto.randomUUID();
    const email = `auditoria-${id}@example.com`;
    const ip = `2001:db8::${id.replaceAll("-", "").slice(0, 4)}`;
    created.push(id);
    await owner`insert into auth.users (id) values (${id}::uuid)`;
    await runtime.begin(async (tx) => {
      await tx`
        insert into identity.users (id, kind, email, display_name)
        values (${id}::uuid, 'STAFF', ${email}, 'Auditoria')
      `;
      for (const action of AUDIT_ACTIONS) {
        await recordAudit(
          {
            action,
            actorUserId: action === "auth.login.failure" ? null : id,
            entityType: action === "auth.login.failure" ? null : "user",
            entityId: action === "auth.login.failure" ? null : id,
            ip,
            metadata: {},
          },
          tx,
        );
      }
    });

    const rows = await runtime<
      { action: string; actor: string | null; metadata: unknown; ip: string }[]
    >`
      select action, actor_user_id::text as actor, metadata, host(ip) as ip
      from audit.audit_log
      where ip = ${ip}::inet
    `;
    expect(rows.map((row) => row.action).sort()).toEqual([...AUDIT_ACTIONS].sort());
    for (const row of rows) {
      const metadata =
        typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
      expect(metadata).toEqual({});
      expect(JSON.stringify(row)).not.toContain(email);
      if (row.action === "auth.login.failure") expect(row.actor).toBeNull();
      else expect(row.actor).toBe(id);
    }
  });

  it("desfaz a operação inteira quando o metadado da auditoria é recusado", async () => {
    const id = crypto.randomUUID();
    const email = `recusa-${id}@example.com`;
    created.push(id);
    await owner`insert into auth.users (id) values (${id}::uuid)`;
    await expect(
      runtime.begin(async (tx) => {
        await tx`
          insert into identity.users (id, kind, email, display_name)
          values (${id}::uuid, 'STAFF', ${email}, 'Recusa')
        `;
        await recordAudit(
          {
            action: "user.disabled",
            actorUserId: id,
            entityType: "user",
            entityId: id,
            metadata: { email },
          },
          tx,
        );
      }),
    ).rejects.toThrow("Metadado de auditoria recusado.");

    const people = await runtime<{ id: string }[]>`
      select id from identity.users where id = ${id}::uuid
    `;
    const audits = await runtime<{ id: string }[]>`
      select id from audit.audit_log where entity_id = ${id}::uuid
    `;
    expect(people).toEqual([]);
    expect(audits).toEqual([]);
  });
});
