import { createHmac, timingSafeEqual } from "node:crypto";

export const STAFF_IDLE_MS = 30 * 60 * 1000;
export const STAFF_MAX_MS = 12 * 60 * 60 * 1000;
export const STAFF_SESSION_COOKIE = "staff_session";
export const SESSION_EXPIRED_MESSAGE =
  "Sua sessão expirou por segurança. Entre novamente.";
export const LOGIN_ERROR_MESSAGE = "E-mail ou senha incorretos.";

export type StaffSession = {
  userId: string;
  sessionId: string;
  startedAt: number;
  lastActivity: number;
};

export const LOGIN_EMAIL_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function evaluateStaffSession(
  session: StaffSession,
  now: number,
): "ok" | "expired" {
  if (now - session.startedAt >= STAFF_MAX_MS) return "expired";
  if (now - session.lastActivity >= STAFF_IDLE_MS) return "expired";
  return "ok";
}

export function isStaffSessionExpired(session: StaffSession): boolean {
  return evaluateStaffSession(session, Date.now()) === "expired";
}

export function touchStaffSession(session: StaffSession, now: number): StaffSession {
  return {
    userId: session.userId,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    lastActivity: now,
  };
}

export function staffSessionMatches(
  session: StaffSession,
  current: { userId: string; sessionId: string },
): boolean {
  return session.userId === current.userId && session.sessionId === current.sessionId;
}

export function loginAttemptKey(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function signStaffSession(session: StaffSession, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 2,
      userId: session.userId,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      lastActivity: session.lastActivity,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readStaffSession(token: string, secret: string): StaffSession | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("v" in parsed) ||
      parsed.v !== 2 ||
      !("userId" in parsed) ||
      !("sessionId" in parsed) ||
      !("startedAt" in parsed) ||
      !("lastActivity" in parsed)
    ) {
      return null;
    }
    const userId = parsed.userId;
    const sessionId = parsed.sessionId;
    const startedAt = parsed.startedAt;
    const lastActivity = parsed.lastActivity;
    if (typeof userId !== "string" || typeof sessionId !== "string") return null;
    if (!userId || !sessionId) return null;
    if (typeof startedAt !== "number" || typeof lastActivity !== "number") return null;
    return { userId, sessionId, startedAt, lastActivity };
  } catch {
    return null;
  }
}

export async function endStaffAccess(input: {
  signOut: () => Promise<void>;
  clearCookie: () => Promise<void>;
  audit: () => Promise<void>;
  report: (error: unknown) => void;
}): Promise<void> {
  await input.signOut();
  await input.clearCookie();
  try {
    await input.audit();
  } catch (error) {
    input.report(error);
  }
}

export function clientIp(header: string | null): string | null {
  const first = header?.split(",")[0]?.trim() ?? "";
  if (!first || first.length > 45) return null;
  if (/^[\da-fA-F:.]+$/.test(first)) return first;
  return null;
}
