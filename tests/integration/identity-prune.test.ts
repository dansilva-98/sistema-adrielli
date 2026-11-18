import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import { emailMfaHmac } from "@/modules/identity/email-mfa";
import { pruneEmailMfaChallenges, pruneLoginAttempts } from "@/modules/identity/prune";
import {
  LOGIN_EMAIL_LIMIT,
  LOGIN_WINDOW_MS,
  loginAttemptKey,
} from "@/modules/identity/staff-session";

describe("limpeza de login_attempts e desafios de MFA", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let loginIsLimited: (keys: {
    emailKey: string;
    ipKey: string | null;
  }) => Promise<boolean>;
  let recordLoginAttempt: (keys: {
    emailKey: string;
    ipKey: string | null;
  }) => Promise<void>;
  let confirmStaffEmailMfaCode: typeof import("@/modules/identity/server/email-mfa").confirmStaffEmailMfaCode;
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const oldLoginKey = `old-${crypto.randomUUID()}`;
  const newLoginKey = `new-${crypto.randomUUID()}`;
  const secret = () => {
    const value = process.env.STAFF_SESSION_SECRET;
    if (!value) throw new Error("STAFF_SESSION_SECRET ausente.");
    return value;
  };

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    process.env.DATABASE_URL = testUrl;
    const attempts = await import("@/modules/identity/server/login-attempts");
    loginIsLimited = attempts.loginIsLimited;
    recordLoginAttempt = attempts.recordLoginAttempt;
    confirmStaffEmailMfaCode = (await import("@/modules/identity/server/email-mfa"))
      .confirmStaffEmailMfaCode;
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${userId}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${userId}::uuid, 'STAFF', ${`${userId}@example.com`}, 'Equipe')
    `;
  });

  afterAll(async () => {
    await owner`delete from identity.staff_email_mfa_challenges where user_id = ${userId}::uuid`;
    await owner`delete from identity.users where id = ${userId}::uuid`;
    await owner`delete from auth.users where id = ${userId}::uuid`;
    await owner`
      delete from identity.login_attempts
      where key_hash in (${oldLoginKey}, ${newLoginKey})
    `;
    await runtime.end({ timeout: 5 });
    await owner.end({ timeout: 5 });
  });

  it("apaga tentativas antigas e recusa apagar as novas", async () => {
    await owner`
      insert into identity.login_attempts (key_hash, kind, attempted_at)
      values
        (${oldLoginKey}, 'EMAIL', now() - interval '31 days'),
        (${newLoginKey}, 'EMAIL', now() - interval '1 hour')
    `;
    const pruned = await pruneLoginAttempts(runtime);
    expect(pruned).toBeGreaterThanOrEqual(1);
    const remaining = await owner<{ key_hash: string }[]>`
      select key_hash from identity.login_attempts
      where key_hash in (${oldLoginKey}, ${newLoginKey})
      order by key_hash
    `;
    expect(remaining.map((row) => row.key_hash)).toEqual([newLoginKey]);

    const freshId = crypto.randomUUID();
    await owner`
      insert into identity.login_attempts (id, key_hash, kind, attempted_at)
      values (${freshId}::uuid, ${newLoginKey}, 'EMAIL', now())
    `;
    await runtime.begin(async (tx) => {
      await tx`set local role app_runtime`;
      const deleted = await tx<{ id: string }[]>`
        delete from identity.login_attempts where id = ${freshId}::uuid returning id
      `;
      expect(deleted).toEqual([]);
    });
    const kept = await owner<{ total: number }[]>`
      select count(*)::int as total from identity.login_attempts where id = ${freshId}::uuid
    `;
    expect(Number(kept[0]?.total ?? 0)).toBe(1);
    await owner`delete from identity.login_attempts where id = ${freshId}::uuid`;
  });

  it("apaga desafios antigos usados ou expirados e recusa apagar os novos", async () => {
    const oldUsed = crypto.randomUUID();
    const recent = crypto.randomUUID();
    const hmac = emailMfaHmac("123456", secret());
    await owner`
      insert into identity.staff_email_mfa_challenges (
        id, user_id, session_id, code_hmac, expires_at, consumed_at, created_at
      ) values
      (
        ${oldUsed}::uuid,
        ${userId}::uuid,
        ${sessionId}::uuid,
        ${hmac},
        now() - interval '2 days',
        now() - interval '2 days',
        now() - interval '2 days'
      ),
      (
        ${recent}::uuid,
        ${userId}::uuid,
        ${sessionId}::uuid,
        ${hmac},
        now() + interval '10 minutes',
        null,
        now()
      )
    `;
    const pruned = await pruneEmailMfaChallenges(runtime);
    expect(pruned).toBeGreaterThanOrEqual(1);
    const remaining = await owner<{ id: string }[]>`
      select id from identity.staff_email_mfa_challenges
      where id in (${oldUsed}::uuid, ${recent}::uuid)
    `;
    expect(remaining.map((row) => row.id)).toEqual([recent]);

    await runtime.begin(async (tx) => {
      await tx`set local role app_runtime`;
      const deleted = await tx<{ id: string }[]>`
        delete from identity.staff_email_mfa_challenges where id = ${recent}::uuid returning id
      `;
      expect(deleted).toEqual([]);
    });
  });

  it("o limite de tentativas e o código por e-mail continuam depois da limpeza", async () => {
    const email = `prune-${crypto.randomUUID()}@example.com`;
    const emailKey = loginAttemptKey(email, secret());
    await owner`
      insert into identity.login_attempts (key_hash, kind, attempted_at)
      values (${emailKey}, 'EMAIL', now() - interval '31 days')
    `;
    await pruneLoginAttempts(runtime);
    expect(await loginIsLimited({ emailKey, ipKey: null })).toBe(false);
    for (let attempt = 0; attempt < LOGIN_EMAIL_LIMIT; attempt += 1) {
      await recordLoginAttempt({ emailKey, ipKey: null });
    }
    expect(await loginIsLimited({ emailKey, ipKey: null })).toBe(true);
    expect(LOGIN_WINDOW_MS).toBeLessThan(30 * 24 * 60 * 60 * 1000);

    const code = "654321";
    await owner`
      insert into identity.staff_email_mfa_challenges (
        user_id, session_id, code_hmac, expires_at
      ) values (
        ${userId}::uuid,
        ${sessionId}::uuid,
        ${emailMfaHmac(code, secret())},
        now() + interval '10 minutes'
      )
    `;
    const confirmed = await confirmStaffEmailMfaCode({
      userId,
      sessionId,
      code,
      ip: null,
    });
    expect(confirmed.ok).toBe(true);
    await owner`delete from identity.login_attempts where key_hash = ${emailKey}`;
  });
});
