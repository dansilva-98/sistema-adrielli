import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decideLogin } from "@/modules/identity/login";
import {
  endStaffAccess,
  evaluateStaffSession,
  LOGIN_ERROR_MESSAGE,
  readStaffSession,
  signStaffSession,
  STAFF_IDLE_MS,
  STAFF_MAX_MS,
  staffCookieSecure,
  staffSessionMatches,
  touchStaffSession,
} from "@/modules/identity/staff-session";

const secret = "local-staff-session-secret-32chars";
const staff = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "STAFF" as const,
  disabledAt: null,
  roles: ["CONTENT_ADMIN" as const],
};

describe("sessão da equipe", () => {
  it("só tira o Secure quando o teste pede", () => {
    const previous = process.env.E2E_INSECURE_COOKIE;
    delete process.env.E2E_INSECURE_COOKIE;
    expect(staffCookieSecure()).toBe(true);
    process.env.E2E_INSECURE_COOKIE = "1";
    expect(staffCookieSecure()).toBe(false);
    if (previous === undefined) delete process.env.E2E_INSECURE_COOKIE;
    else process.env.E2E_INSECURE_COOKIE = previous;
  });

  it("expira aos 30 minutos sem atividade e às 12 horas desde o login", () => {
    const startedAt = 1_000;
    const active = {
      userId: staff.id,
      sessionId: "session-1",
      startedAt,
      lastActivity: startedAt,
    };
    expect(evaluateStaffSession(active, startedAt + STAFF_IDLE_MS - 1)).toBe("ok");
    expect(evaluateStaffSession(active, startedAt + STAFF_IDLE_MS)).toBe("expired");

    const nearEnd = startedAt + STAFF_MAX_MS - 1;
    const touched = touchStaffSession(active, nearEnd - 1000);
    expect(evaluateStaffSession(touched, nearEnd)).toBe("ok");
    expect(evaluateStaffSession(touched, startedAt + STAFF_MAX_MS)).toBe("expired");
  });

  it("recusa um cookie com assinatura alterada", () => {
    const token = signStaffSession(
      { userId: staff.id, sessionId: "session-1", startedAt: 10, lastActivity: 10 },
      secret,
    );
    const [payload, signature] = token.split(".");
    const flipped = signature?.startsWith("a")
      ? `b${signature.slice(1)}`
      : `a${signature}`;
    expect(readStaffSession(`${payload}.${flipped}`, secret)).toBeNull();
    expect(readStaffSession(token, secret)).toEqual({
      userId: staff.id,
      sessionId: "session-1",
      startedAt: 10,
      lastActivity: 10,
    });
  });

  it("rejeita cookie de outro usuário ou de outra sessão", () => {
    const token = signStaffSession(
      { userId: staff.id, sessionId: "session-1", startedAt: 10, lastActivity: 10 },
      secret,
    );
    const session = readStaffSession(token, secret);
    expect(session).not.toBeNull();
    if (!session) return;
    expect(
      staffSessionMatches(session, { userId: staff.id, sessionId: "session-1" }),
    ).toBe(true);
    expect(
      staffSessionMatches(session, {
        userId: "22222222-2222-2222-2222-222222222222",
        sessionId: "session-1",
      }),
    ).toBe(false);
    expect(
      staffSessionMatches(session, { userId: staff.id, sessionId: "session-2" }),
    ).toBe(false);
  });

  it("rejeita o payload antigo sem usuário e sem sessão", () => {
    const payload = Buffer.from(
      JSON.stringify({ v: 1, startedAt: 10, lastActivity: 10 }),
    ).toString("base64url");
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    expect(readStaffSession(`${payload}.${signature}`, secret)).toBeNull();
  });
});

describe("logout da equipe", () => {
  it("encerra a sessão mesmo quando a auditoria falha", async () => {
    const calls: string[] = [];
    await endStaffAccess({
      signOut: async () => {
        calls.push("signOut");
      },
      clearCookie: async () => {
        calls.push("clear");
      },
      audit: async () => {
        calls.push("audit");
        throw new Error("auditoria indisponível");
      },
      report: () => {
        calls.push("report");
      },
    });
    expect(calls).toEqual(["signOut", "clear", "audit", "report"]);
  });
});

describe("login da equipe", () => {
  it("responde igual para e-mail inexistente e senha incorreta", async () => {
    const signIn = async () => null;
    const missing = await decideLogin({
      email: "ausente@example.com",
      password: "errada",
      now: 50,
      signIn,
      loadProfile: async () => null,
      findActorByEmail: async () => null,
    });
    const wrong = await decideLogin({
      email: "existente@example.com",
      password: "errada",
      now: 50,
      signIn,
      loadProfile: async () => staff,
      findActorByEmail: async () => staff.id,
    });

    expect(missing.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (missing.ok || wrong.ok) return;
    expect(missing.message).toBe(LOGIN_ERROR_MESSAGE);
    expect(wrong.message).toBe(missing.message);
    expect(JSON.stringify(missing)).not.toContain("ausente@example.com");
    expect(JSON.stringify(wrong)).not.toContain("existente@example.com");
    expect(wrong.actorUserId).toBe(staff.id);
    expect(missing.actorUserId).toBeNull();
  });

  it("manda administrador sem TOTP para a configuração e conteúdo direto para a área", async () => {
    const now = 80;
    const admin = await decideLogin({
      email: "admin@example.com",
      password: "correta",
      now,
      signIn: async () => ({
        userId: staff.id,
        sessionId: "session-1",
        aal: "aal1",
        hasVerifiedTotp: false,
      }),
      loadProfile: async () => ({ ...staff, roles: ["SUPER_ADMIN"] }),
      findActorByEmail: async () => null,
    });
    const content = await decideLogin({
      email: "conteudo@example.com",
      password: "correta",
      now,
      signIn: async () => ({
        userId: staff.id,
        sessionId: "session-1",
        aal: "aal1",
        hasVerifiedTotp: false,
      }),
      loadProfile: async () => staff,
      findActorByEmail: async () => null,
    });

    expect(admin).toMatchObject({ ok: true, redirectTo: "/equipe/mfa/configurar" });
    expect(content).toMatchObject({ ok: true, redirectTo: "/admin" });
    expect(JSON.stringify(admin)).not.toContain("admin@example.com");
  });

  it("recusa cliente e conta desativada com a mesma mensagem", async () => {
    const customer = await decideLogin({
      email: "cliente@example.com",
      password: "correta",
      now: 90,
      signIn: async () => ({
        userId: staff.id,
        sessionId: "session-1",
        aal: "aal2",
        hasVerifiedTotp: true,
      }),
      loadProfile: async () => ({ ...staff, kind: "CUSTOMER" }),
      findActorByEmail: async () => null,
    });
    const disabled = await decideLogin({
      email: "inativa@example.com",
      password: "correta",
      now: 90,
      signIn: async () => ({
        userId: staff.id,
        sessionId: "session-1",
        aal: "aal2",
        hasVerifiedTotp: true,
      }),
      loadProfile: async () => ({ ...staff, disabledAt: new Date() }),
      findActorByEmail: async () => null,
    });

    expect(customer).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      endAuthSession: true,
    });
    expect(disabled).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      endAuthSession: true,
    });
  });
});
