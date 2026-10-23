import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADMIN_ROLES,
  CONSULTORIO_ROLES,
  USER_ADMIN_ROLES,
} from "@/modules/identity/access";
import { decideStaffAccess } from "@/modules/identity/guard";
import { MFA_ATTEMPT_LIMIT, loginAttemptKey } from "@/modules/identity/staff-session";
import { TEST_DATABASE_NAME } from "../../src/db/seed";

describe("guardas no banco de testes", () => {
  const contentId = crypto.randomUUID();
  const clinicId = crypto.randomUUID();
  const superId = crypto.randomUUID();
  const disabledId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const mfaUserId = crypto.randomUUID();
  let owner: ReturnType<typeof postgres>;
  let loadStaffProfile: typeof import("@/modules/identity/server/directory").loadStaffProfile;
  let writeStaffAudit: typeof import("@/modules/identity/server/directory").writeStaffAudit;
  let mfaIsLimited: typeof import("@/modules/identity/server/login-attempts").mfaIsLimited;
  let recordMfaFailure: typeof import("@/modules/identity/server/login-attempts").recordMfaFailure;
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
    loadStaffProfile = (await import("@/modules/identity/server/directory"))
      .loadStaffProfile;
    writeStaffAudit = (await import("@/modules/identity/server/directory"))
      .writeStaffAudit;
    const attempts = await import("@/modules/identity/server/login-attempts");
    mfaIsLimited = attempts.mfaIsLimited;
    recordMfaFailure = attempts.recordMfaFailure;
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    const people = [
      [contentId, "STAFF", "CONTENT_ADMIN"],
      [clinicId, "STAFF", "CLINIC_ADMIN"],
      [superId, "STAFF", "SUPER_ADMIN"],
      [disabledId, "STAFF", "CONTENT_ADMIN"],
      [customerId, "CUSTOMER", null],
      [mfaUserId, "STAFF", "SUPER_ADMIN"],
    ] as const;
    for (const [id] of people) {
      await owner`insert into auth.users (id) values (${id}::uuid)`;
    }
    for (const [id, kind] of people) {
      await owner`
        insert into identity.users (id, kind, email, display_name)
        values (${id}::uuid, ${kind}::identity.user_kind, ${`${id}@example.com`}, 'Equipe')
      `;
    }
    await owner`update identity.users set disabled_at = now() where id = ${disabledId}::uuid`;
    for (const [id, , role] of people) {
      if (!role) continue;
      await owner`
        insert into identity.user_roles (user_id, role)
        values (${id}::uuid, ${role}::identity.staff_role)
      `;
    }
  });

  afterAll(async () => {
    const ids = [contentId, clinicId, superId, disabledId, customerId, mfaUserId];
    await owner`delete from identity.user_roles where user_id in ${owner(ids)}`;
    await owner`delete from identity.users where id in ${owner(ids)}`;
    await owner`delete from auth.users where id in ${owner(ids)}`;
    const hashes = ids.map((id) => loginAttemptKey(id, secret()));
    await owner`delete from identity.login_attempts where key_hash in ${owner(hashes)}`;
    await owner.end({ timeout: 5 });
  });

  it("carrega cada papel e recusa cliente e desativado", async () => {
    const now = Date.now();
    const cases = [
      { id: contentId, roles: ADMIN_ROLES, ok: true },
      { id: contentId, roles: CONSULTORIO_ROLES, ok: false },
      { id: clinicId, roles: CONSULTORIO_ROLES, ok: true },
      { id: clinicId, roles: USER_ADMIN_ROLES, ok: false },
      { id: superId, roles: USER_ADMIN_ROLES, ok: true },
    ];
    for (const item of cases) {
      const profile = await loadStaffProfile(item.id);
      const decision = decideStaffAccess({
        userId: item.id,
        sessionId: "sessao",
        cookie: {
          userId: item.id,
          sessionId: "sessao",
          startedAt: now,
          lastActivity: now,
        },
        profile,
        aal: "aal2",
        hasVerifiedTotp: true,
        roles: item.roles,
        now,
      });
      expect(decision.ok).toBe(item.ok);
    }
    const customer = await loadStaffProfile(customerId);
    const disabled = await loadStaffProfile(disabledId);
    expect(customer?.kind).toBe("CUSTOMER");
    expect(disabled?.disabledAt).toBeTruthy();
    expect(
      decideStaffAccess({
        userId: disabledId,
        sessionId: "sessao",
        cookie: {
          userId: disabledId,
          sessionId: "sessao",
          startedAt: now,
          lastActivity: now,
        },
        profile: disabled,
        aal: "aal2",
        hasVerifiedTotp: true,
        roles: ADMIN_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("encerra o acesso ao TOTP depois de cinco falhas e não grava o usuário em claro", async () => {
    expect(await mfaIsLimited(mfaUserId)).toBe(false);
    for (let attempt = 0; attempt < MFA_ATTEMPT_LIMIT; attempt += 1) {
      await recordMfaFailure(mfaUserId);
    }
    expect(await mfaIsLimited(mfaUserId)).toBe(true);
    const keyHash = loginAttemptKey(mfaUserId, secret());
    const stored = await owner<{ key_hash: string; kind: string }[]>`
      select key_hash, kind::text as kind
      from identity.login_attempts
      where key_hash = ${keyHash}
    `;
    expect(stored).toHaveLength(MFA_ATTEMPT_LIMIT);
    expect(stored.every((row) => row.kind === "MFA" && row.key_hash !== mfaUserId)).toBe(
      true,
    );
  });

  it("registra acesso negado e sessão expirada sem impedir o fluxo", async () => {
    await expect(
      writeStaffAudit({
        action: "access.denied",
        actorUserId: contentId,
        entityType: "user",
        entityId: contentId,
        metadata: {},
      }),
    ).resolves.toBeUndefined();
    await expect(
      writeStaffAudit({
        action: "auth.session.expired",
        actorUserId: contentId,
        entityType: "user",
        entityId: contentId,
        metadata: {},
      }),
    ).resolves.toBeUndefined();
  });
});
