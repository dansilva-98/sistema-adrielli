import { describe, expect, it } from "vitest";

import { decideStaffAccess } from "@/modules/identity/guard";
import { decideLogin } from "@/modules/identity/login";
import { ADMIN_ROLES, CONSULTORIO_ROLES } from "@/modules/identity/access";
import {
  staffMfaConfirmed,
  totpEnrollmentAllowed,
  totpFactorsAreTrusted,
} from "@/modules/identity/totp-factors";
import {
  EMAIL_MFA_MAX_ATTEMPTS,
  EMAIL_MFA_MAX_SENDS_PER_HOUR,
  EMAIL_MFA_MAX_SENDS_PER_IP_HOUR,
  EMAIL_MFA_RESEND_GAP_MS,
  EMAIL_MFA_TTL_MS,
  emailMfaHmac,
  emailMfaHmacsMatch,
  emailMfaSendAllowed,
  generateEmailMfaCode,
  maskStaffEmail,
  memoryTransportEnabled,
  memoryTransportForbidden,
  parseEmailMfaCode,
} from "@/modules/identity/email-mfa";

const now = 1_700_000_000_000;
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const cookie = { userId, sessionId, startedAt: now, lastActivity: now };
const admin = {
  id: userId,
  kind: "STAFF" as const,
  disabledAt: null,
  roles: ["SUPER_ADMIN" as const],
};

describe("código de MFA por e-mail", () => {
  it("gera sempre 6 dígitos, calcula HMAC e compara em tempo constante", () => {
    for (let index = 0; index < 40; index += 1) {
      const code = generateEmailMfaCode();
      expect(code).toMatch(/^\d{6}$/);
    }
    const secret = "local-staff-session-secret-32chars";
    const hmac = emailMfaHmac("123456", secret);
    expect(hmac).toHaveLength(64);
    expect(emailMfaHmacsMatch(hmac, emailMfaHmac("123456", secret))).toBe(true);
    expect(emailMfaHmacsMatch(hmac, emailMfaHmac("000000", secret))).toBe(false);
    expect(parseEmailMfaCode("12 34 56")).toBe("123456");
    expect(parseEmailMfaCode("12345")).toBeNull();
  });

  it("aplica validade de 10 minutos, 5 tentativas e limites de envio", () => {
    expect(EMAIL_MFA_TTL_MS).toBe(10 * 60 * 1000);
    expect(EMAIL_MFA_MAX_ATTEMPTS).toBe(5);
    expect(EMAIL_MFA_RESEND_GAP_MS).toBe(60_000);
    expect(EMAIL_MFA_MAX_SENDS_PER_HOUR).toBe(5);
    expect(EMAIL_MFA_MAX_SENDS_PER_IP_HOUR).toBe(20);
    expect(
      emailMfaSendAllowed({
        lastSentAt: now - EMAIL_MFA_RESEND_GAP_MS + 1,
        sendsLastHour: 1,
        ipSendsLastHour: 1,
        now,
      }),
    ).toBe("gap");
    expect(
      emailMfaSendAllowed({
        lastSentAt: now - EMAIL_MFA_RESEND_GAP_MS,
        sendsLastHour: EMAIL_MFA_MAX_SENDS_PER_HOUR,
        ipSendsLastHour: 0,
        now,
      }),
    ).toBe("limited");
    expect(
      emailMfaSendAllowed({
        lastSentAt: now - EMAIL_MFA_RESEND_GAP_MS,
        sendsLastHour: 0,
        ipSendsLastHour: EMAIL_MFA_MAX_SENDS_PER_IP_HOUR,
        now,
      }),
    ).toBe("limited");
    expect(
      emailMfaSendAllowed({
        lastSentAt: now - EMAIL_MFA_RESEND_GAP_MS,
        sendsLastHour: 1,
        ipSendsLastHour: 1,
        now,
      }),
    ).toBe("ok");
  });

  it("mascara o e-mail com a primeira letra, asteriscos e o domínio", () => {
    expect(maskStaffEmail("adrielli@gmail.com")).toBe("a***@gmail.com");
    expect(maskStaffEmail("a@example.com")).toBe("a***@example.com");
    expect(maskStaffEmail("invalido")).toBe("***");
  });

  it("decide acesso e login com aal1, e-mail e TOTP", () => {
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile: admin,
        aal: "aal1",
        hasVerifiedTotp: true,
        hasEmailVerification: false,
        roles: ADMIN_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "mfa-verify" });
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile: admin,
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
        profile: admin,
        aal: "aal1",
        hasVerifiedTotp: false,
        hasEmailVerification: true,
        roles: ADMIN_ROLES,
        now,
      }).ok,
    ).toBe(true);
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile: admin,
        aal: "aal2",
        hasVerifiedTotp: true,
        hasEmailVerification: false,
        roles: ADMIN_ROLES,
        now,
      }).ok,
    ).toBe(true);
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile: admin,
        aal: "aal2",
        hasVerifiedTotp: true,
        totpFactorsTrusted: false,
        hasEmailVerification: false,
        roles: ADMIN_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "mfa-verify" });
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie,
        profile: admin,
        aal: "aal2",
        hasVerifiedTotp: true,
        totpFactorsTrusted: false,
        hasEmailVerification: true,
        roles: ADMIN_ROLES,
        now,
      }).ok,
    ).toBe(true);
  });

  it("só confia em aal2 com fatores conhecidos e bloqueia o cadastro sem sessão confirmada", () => {
    expect(totpFactorsAreTrusted(["f1"], ["f1"])).toBe(true);
    expect(totpFactorsAreTrusted(["f1", "f2"], ["f1"])).toBe(false);
    expect(totpFactorsAreTrusted([], ["f1"])).toBe(true);
    expect(
      staffMfaConfirmed({
        aal: "aal2",
        totpFactorsTrusted: false,
        hasEmailVerification: false,
      }),
    ).toBe(false);
    expect(
      totpEnrollmentAllowed({
        emailMfaEnabled: true,
        aal: "aal1",
        hasEmailVerification: false,
      }),
    ).toBe(false);
    expect(
      totpEnrollmentAllowed({
        emailMfaEnabled: true,
        aal: "aal1",
        hasEmailVerification: true,
      }),
    ).toBe(true);
    expect(
      totpEnrollmentAllowed({
        emailMfaEnabled: false,
        aal: "aal1",
        hasEmailVerification: false,
      }),
    ).toBe(true);
  });

  it("recusa o transporte memory em produção e libera fora dela", () => {
    expect(
      memoryTransportForbidden({ APP_ENV: "production", MFA_EMAIL_TRANSPORT: "memory" }),
    ).toBe(true);
    expect(
      memoryTransportEnabled({ APP_ENV: "production", MFA_EMAIL_TRANSPORT: "memory" }),
    ).toBe(false);
    expect(
      memoryTransportEnabled({ APP_ENV: "staging", MFA_EMAIL_TRANSPORT: "memory" }),
    ).toBe(true);
    expect(memoryTransportEnabled({ APP_ENV: "development" })).toBe(false);
  });
});

describe("login com verificação por e-mail", () => {
  it("não manda para configurar o TOTP quando o papel exige segundo fator", async () => {
    const withoutTotp = await decideLogin({
      email: "admin@example.com",
      password: "correta",
      now,
      signIn: async () => ({
        userId,
        sessionId,
        aal: "aal1",
        hasVerifiedTotp: false,
      }),
      loadProfile: async () => admin,
      findActorByEmail: async () => null,
    });
    const withTotp = await decideLogin({
      email: "admin@example.com",
      password: "correta",
      now,
      signIn: async () => ({
        userId,
        sessionId,
        aal: "aal1",
        hasVerifiedTotp: true,
      }),
      loadProfile: async () => admin,
      findActorByEmail: async () => null,
    });
    expect(withoutTotp).toMatchObject({ ok: true, redirectTo: "/equipe/mfa/verificar" });
    expect(withTotp).toMatchObject({ ok: true, redirectTo: "/equipe/mfa/verificar" });
  });
});
