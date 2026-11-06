import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import { ADMIN_ROLES, CONSULTORIO_ROLES } from "@/modules/identity/access";
import {
  EMAIL_MFA_CLEANUP_MS,
  EMAIL_MFA_MAX_ATTEMPTS,
  emailMfaHmac,
} from "@/modules/identity/email-mfa";
import { decideStaffAccess } from "@/modules/identity/guard";

describe("desafios de MFA por e-mail", () => {
  const userId = crypto.randomUUID();
  const otherUser = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const otherSession = crypto.randomUUID();
  const secret = () => {
    const value = process.env.STAFF_SESSION_SECRET;
    if (!value) throw new Error("STAFF_SESSION_SECRET ausente.");
    return value;
  };
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let confirmStaffEmailMfaCode: typeof import("@/modules/identity/server/email-mfa").confirmStaffEmailMfaCode;
  let hasConsumedEmailMfa: typeof import("@/modules/identity/server/email-mfa").hasConsumedEmailMfa;
  let closeOpenSessionChallenges: typeof import("@/modules/identity/server/email-mfa").closeOpenSessionChallenges;
  let cleanupOldChallenges: typeof import("@/modules/identity/server/email-mfa").cleanupOldChallenges;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    process.env.DATABASE_URL = testUrl;
    const loaded = await import("@/modules/identity/server/email-mfa");
    confirmStaffEmailMfaCode = loaded.confirmStaffEmailMfaCode;
    hasConsumedEmailMfa = loaded.hasConsumedEmailMfa;
    closeOpenSessionChallenges = loaded.closeOpenSessionChallenges;
    cleanupOldChallenges = loaded.cleanupOldChallenges;
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${userId}::uuid), (${otherUser}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values
        (${userId}::uuid, 'STAFF', ${`${userId}@example.com`}, 'Equipe'),
        (${otherUser}::uuid, 'STAFF', ${`${otherUser}@example.com`}, 'Outro')
    `;
    await owner`
      insert into identity.user_roles (user_id, role)
      values (${userId}::uuid, 'CLINIC_ADMIN')
    `;
  });

  afterAll(async () => {
    await owner`delete from identity.staff_email_mfa_challenges where user_id in ${owner([userId, otherUser])}`;
    await owner`delete from identity.user_roles where user_id in ${owner([userId, otherUser])}`;
    await owner`delete from identity.users where id in ${owner([userId, otherUser])}`;
    await owner`delete from auth.users where id in ${owner([userId, otherUser])}`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
  });

  async function insertChallenge(input: {
    id?: string;
    userId: string;
    sessionId: string;
    code: string;
    attempts?: number;
    expiresAt?: Date;
    consumedAt?: Date | null;
    closedAt?: Date | null;
    createdAt?: Date;
  }): Promise<string> {
    const id = input.id ?? crypto.randomUUID();
    const hmac = emailMfaHmac(input.code, secret());
    await runtime`
      insert into identity.staff_email_mfa_challenges (
        id, user_id, session_id, code_hmac, attempts, expires_at, consumed_at, closed_at, created_at
      ) values (
        ${id}::uuid,
        ${input.userId}::uuid,
        ${input.sessionId}::uuid,
        ${hmac},
        ${input.attempts ?? 0},
        ${input.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000)},
        ${input.consumedAt ?? null},
        ${input.closedAt ?? null},
        ${input.createdAt ?? new Date()}
      )
    `;
    return id;
  }

  it("consome o código de forma atômica e só uma confirmação passa", async () => {
    const code = "123456";
    await insertChallenge({ userId, sessionId, code });
    const [first, second] = await Promise.all([
      confirmStaffEmailMfaCode({ userId, sessionId, code, ip: null }),
      confirmStaffEmailMfaCode({ userId, sessionId, code, ip: null }),
    ]);
    const wins = [first, second].filter((result) => result.ok);
    expect(wins).toHaveLength(1);
    expect(await hasConsumedEmailMfa(userId, sessionId)).toBe(true);
  });

  it("recusa código de outra sessão ou de outro usuário", async () => {
    const code = "654321";
    await insertChallenge({ userId, sessionId: otherSession, code });
    const other = await confirmStaffEmailMfaCode({
      userId,
      sessionId,
      code,
      ip: null,
    });
    expect(other.ok).toBe(false);
    await insertChallenge({ userId: otherUser, sessionId, code: "111111" });
    const stolen = await confirmStaffEmailMfaCode({
      userId,
      sessionId,
      code: "111111",
      ip: null,
    });
    expect(stolen.ok).toBe(false);
  });

  it("recusa código vencido, bloqueado ou já usado", async () => {
    const expiredId = await insertChallenge({
      userId,
      sessionId,
      code: "222222",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      (await confirmStaffEmailMfaCode({ userId, sessionId, code: "222222", ip: null }))
        .ok,
    ).toBe(false);
    await runtime`delete from identity.staff_email_mfa_challenges where id = ${expiredId}::uuid`;

    const lockedId = await insertChallenge({
      userId,
      sessionId,
      code: "333333",
      attempts: EMAIL_MFA_MAX_ATTEMPTS,
      closedAt: new Date(),
    });
    expect(
      (await confirmStaffEmailMfaCode({ userId, sessionId, code: "333333", ip: null }))
        .ok,
    ).toBe(false);
    await runtime`delete from identity.staff_email_mfa_challenges where id = ${lockedId}::uuid`;

    const usedId = await insertChallenge({
      userId,
      sessionId,
      code: "444444",
      consumedAt: new Date(),
    });
    expect(
      (await confirmStaffEmailMfaCode({ userId, sessionId, code: "444444", ip: null }))
        .ok,
    ).toBe(false);
    await runtime`delete from identity.staff_email_mfa_challenges where id = ${usedId}::uuid`;
  });

  it("encerra o desafio anterior ao enviar um novo e limpa os de 24 h", async () => {
    const oldId = await insertChallenge({
      userId,
      sessionId,
      code: "555555",
      createdAt: new Date(Date.now() - EMAIL_MFA_CLEANUP_MS - 1000),
    });
    const previous = await insertChallenge({ userId, sessionId, code: "666666" });
    await cleanupOldChallenges(userId, Date.now());
    await closeOpenSessionChallenges(userId, sessionId);
    const previousRow = await runtime<{ closed_at: Date | null }[]>`
      select closed_at from identity.staff_email_mfa_challenges where id = ${previous}::uuid
    `;
    expect(previousRow[0]?.closed_at).toBeTruthy();
    const leftover = await runtime<{ total: number }[]>`
      select count(*)::int as total from identity.staff_email_mfa_challenges where id = ${oldId}::uuid
    `;
    expect(leftover[0]?.total).toBe(0);
  });

  it("redireciona sessão aal1 sem e-mail e libera a confirmada", () => {
    const now = Date.now();
    const cookie = { userId, sessionId, startedAt: now, lastActivity: now };
    const profile = {
      id: userId,
      kind: "STAFF" as const,
      disabledAt: null,
      roles: ["CLINIC_ADMIN" as const],
    };
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile,
        aal: "aal1",
        hasVerifiedTotp: false,
        hasEmailVerification: false,
        roles: CONSULTORIO_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "mfa-verify" });
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile,
        aal: "aal1",
        hasVerifiedTotp: false,
        hasEmailVerification: true,
        roles: CONSULTORIO_ROLES,
        now,
      }).ok,
    ).toBe(true);
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile,
        aal: "aal1",
        hasVerifiedTotp: false,
        hasEmailVerification: true,
        roles: ADMIN_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "forbidden" });
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile: { ...profile, disabledAt: new Date(now) },
        aal: "aal1",
        hasVerifiedTotp: false,
        hasEmailVerification: true,
        roles: CONSULTORIO_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("não grava o código nem o e-mail em claro no desafio", async () => {
    const rows = await runtime<{ code_hmac: string; ip_hash: string | null }[]>`
      select code_hmac, ip_hash from identity.staff_email_mfa_challenges where user_id = ${userId}::uuid
    `;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => !row.code_hmac.includes("123456"))).toBe(true);
    expect(rows.every((row) => row.code_hmac.length === 64)).toBe(true);
  });
});
