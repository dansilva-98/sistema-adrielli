import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decideLogin } from "@/modules/identity/login";
import { LOGIN_ERROR_MESSAGE } from "@/modules/identity/staff-session";
import { TEST_DATABASE_NAME } from "../../src/db/seed";

describe("auditoria do login", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  const userId = crypto.randomUUID();
  const email = `equipe-${userId}@example.com`;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${userId}::uuid)`;
    await runtime`
      insert into identity.users (id, kind, email, display_name)
      values (${userId}::uuid, 'STAFF', ${email}, 'Equipe')
    `;
  });

  afterAll(async () => {
    await runtime?.end({ timeout: 5 });
    await owner?.end({ timeout: 5 });
  });

  it("grava a falha sem o e-mail e com a mesma mensagem nos dois casos", async () => {
    const findActorByEmail = async (value: string) => {
      const rows = await runtime<{ id: string }[]>`
        select id::text as id from identity.users where email = ${value}
      `;
      return rows[0]?.id ?? null;
    };
    const missing = await decideLogin({
      email: `ausente-${userId}@example.com`,
      password: "errada",
      now: 1,
      signIn: async () => null,
      loadProfile: async () => null,
      findActorByEmail,
    });
    const wrong = await decideLogin({
      email,
      password: "errada",
      now: 1,
      signIn: async () => null,
      loadProfile: async () => null,
      findActorByEmail,
    });

    expect(missing).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      actorUserId: null,
    });
    expect(wrong).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      actorUserId: userId,
    });

    await runtime`
      insert into audit.audit_log (action, actor_user_id, ip, metadata)
      values ('auth.login.failure', ${userId}::uuid, '127.0.0.1', '{}'::jsonb)
    `;
    const rows = await runtime<{ metadata: unknown }[]>`
      select metadata from audit.audit_log
      where action = 'auth.login.failure' and actor_user_id = ${userId}::uuid
    `;
    const metadata = rows[0]?.metadata;
    const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    expect(parsed).toEqual({});
    expect(JSON.stringify(parsed)).not.toContain(email);
  });
});
