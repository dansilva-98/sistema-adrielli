import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { staffEmailMfaChallenges, users } from "@/db/schema";
import { serverEnv } from "@/lib/env.server";
import {
  EMAIL_MFA_CLEANUP_MS,
  EMAIL_MFA_DEFAULT_FROM,
  EMAIL_MFA_INVALID_MESSAGE,
  EMAIL_MFA_MAX_ATTEMPTS,
  EMAIL_MFA_RATE_LIMIT_MESSAGE,
  EMAIL_MFA_RESEND_GAP_MS,
  EMAIL_MFA_SEND_FAILURE_MESSAGE,
  EMAIL_MFA_TTL_MS,
  emailMfaHmac,
  emailMfaHmacsMatch,
  emailMfaHtml,
  emailMfaSendAllowed,
  emailMfaSubject,
  emailMfaText,
  generateEmailMfaCode,
  maskStaffEmail,
  memoryTransportEnabled,
  parseEmailMfaCode,
  staffEmailAvailable,
} from "@/modules/identity/email-mfa";
import { sendStaffEmail } from "@/modules/identity/email-transport";
import { loginAttemptKey } from "@/modules/identity/staff-session";

import { writeStaffAudit } from "./directory";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function staffEmailMfaEnabled(): boolean {
  return staffEmailAvailable({
    APP_ENV: serverEnv.APP_ENV,
    MFA_EMAIL_TRANSPORT: serverEnv.MFA_EMAIL_TRANSPORT,
    RESEND_API_KEY: serverEnv.RESEND_API_KEY,
  });
}

export async function hasConsumedEmailMfa(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  if (!isUuid(userId) || !isUuid(sessionId)) return false;
  const rows = await db
    .select({ id: staffEmailMfaChallenges.id })
    .from(staffEmailMfaChallenges)
    .where(
      and(
        eq(staffEmailMfaChallenges.userId, userId),
        eq(staffEmailMfaChallenges.sessionId, sessionId),
        sql`${staffEmailMfaChallenges.consumedAt} is not null`,
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function loadStaffEmail(userId: string): Promise<string | null> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.email ?? null;
}

type ChallengeRow = {
  id: string;
  codeHmac: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
};

function hmacSecret(): string {
  return serverEnv.STAFF_SESSION_SECRET;
}

function ipHash(ip: string | null): string | null {
  return ip ? loginAttemptKey(ip, hmacSecret()) : null;
}

export async function cleanupOldChallenges(userId: string, now: number): Promise<void> {
  await db
    .delete(staffEmailMfaChallenges)
    .where(
      and(
        eq(staffEmailMfaChallenges.userId, userId),
        lt(staffEmailMfaChallenges.createdAt, new Date(now - EMAIL_MFA_CLEANUP_MS)),
      ),
    );
}

export async function closeOpenSessionChallenges(
  userId: string,
  sessionId: string,
): Promise<void> {
  await db
    .update(staffEmailMfaChallenges)
    .set({ closedAt: new Date() })
    .where(
      and(
        eq(staffEmailMfaChallenges.userId, userId),
        eq(staffEmailMfaChallenges.sessionId, sessionId),
        isNull(staffEmailMfaChallenges.consumedAt),
        isNull(staffEmailMfaChallenges.closedAt),
      ),
    );
}

async function sendCounts(input: {
  userId: string;
  sessionId: string;
  ipHash: string | null;
  now: number;
}): Promise<{
  lastSentAt: number | null;
  sendsLastHour: number;
  ipSendsLastHour: number;
}> {
  const hourAgo = new Date(input.now - 60 * 60 * 1000);
  const userRows = await db
    .select({
      createdAt: staffEmailMfaChallenges.createdAt,
    })
    .from(staffEmailMfaChallenges)
    .where(
      and(
        eq(staffEmailMfaChallenges.userId, input.userId),
        gt(staffEmailMfaChallenges.createdAt, hourAgo),
      ),
    );
  const sessionRows = await db
    .select({ createdAt: staffEmailMfaChallenges.createdAt })
    .from(staffEmailMfaChallenges)
    .where(
      and(
        eq(staffEmailMfaChallenges.userId, input.userId),
        eq(staffEmailMfaChallenges.sessionId, input.sessionId),
      ),
    )
    .orderBy(sql`${staffEmailMfaChallenges.createdAt} desc`)
    .limit(1);
  let ipSendsLastHour = 0;
  if (input.ipHash) {
    const ipRows = await db
      .select({ id: staffEmailMfaChallenges.id })
      .from(staffEmailMfaChallenges)
      .where(
        and(
          eq(staffEmailMfaChallenges.ipHash, input.ipHash),
          gt(staffEmailMfaChallenges.createdAt, hourAgo),
        ),
      );
    ipSendsLastHour = ipRows.length;
  }
  return {
    lastSentAt: sessionRows[0]?.createdAt.getTime() ?? null,
    sendsLastHour: userRows.length,
    ipSendsLastHour,
  };
}

export type EmailMfaSendResult =
  | { ok: true; maskedEmail: string; retryAt: number }
  | {
      ok: false;
      message: string;
      maskedEmail?: string;
      retryAt?: number;
      reason: "rate_limited" | "send_failed" | "unavailable" | "unauthenticated";
    };

export async function sendStaffEmailMfaCode(input: {
  userId: string;
  sessionId: string;
  ip: string | null;
  now?: number;
}): Promise<EmailMfaSendResult> {
  if (!staffEmailMfaEnabled()) {
    return { ok: false, message: EMAIL_MFA_SEND_FAILURE_MESSAGE, reason: "unavailable" };
  }
  if (!isUuid(input.userId) || !isUuid(input.sessionId)) {
    return { ok: false, message: EMAIL_MFA_INVALID_MESSAGE, reason: "unauthenticated" };
  }
  const now = input.now ?? Date.now();
  const email = await loadStaffEmail(input.userId);
  if (!email) {
    return { ok: false, message: EMAIL_MFA_SEND_FAILURE_MESSAGE, reason: "unavailable" };
  }
  const maskedEmail = maskStaffEmail(email);
  await cleanupOldChallenges(input.userId, now);
  const hashedIp = ipHash(input.ip);
  const counts = await sendCounts({
    userId: input.userId,
    sessionId: input.sessionId,
    ipHash: hashedIp,
    now,
  });
  const allowed = emailMfaSendAllowed({ ...counts, now });
  if (allowed === "gap") {
    const retryAt = (counts.lastSentAt ?? now) + EMAIL_MFA_RESEND_GAP_MS;
    return { ok: true, maskedEmail, retryAt };
  }
  if (allowed === "limited") {
    await writeStaffAudit({
      action: "mfa.email.rate_limited",
      actorUserId: input.userId,
      entityType: "user",
      entityId: input.userId,
      ip: input.ip,
      metadata: {},
    });
    return {
      ok: false,
      message: EMAIL_MFA_RATE_LIMIT_MESSAGE,
      maskedEmail,
      reason: "rate_limited",
    };
  }

  const code = generateEmailMfaCode();
  const codeHmac = emailMfaHmac(code, hmacSecret());
  await closeOpenSessionChallenges(input.userId, input.sessionId);
  await db.insert(staffEmailMfaChallenges).values({
    userId: input.userId,
    sessionId: input.sessionId,
    codeHmac,
    expiresAt: new Date(now + EMAIL_MFA_TTL_MS),
    ipHash: hashedIp,
  });

  const message = {
    to: email,
    subject: emailMfaSubject(code),
    text: emailMfaText(code),
    html: emailMfaHtml(code),
  };
  try {
    await sendStaffEmail({
      message,
      from: serverEnv.MFA_EMAIL_FROM ?? EMAIL_MFA_DEFAULT_FROM,
      transport: memoryTransportEnabled({
        APP_ENV: serverEnv.APP_ENV,
        MFA_EMAIL_TRANSPORT: serverEnv.MFA_EMAIL_TRANSPORT,
      })
        ? "memory"
        : "resend",
      apiKey: serverEnv.RESEND_API_KEY,
    });
  } catch (error) {
    Sentry.captureException(new Error("Falha ao enviar e-mail de MFA"));
    void error;
    return {
      ok: false,
      message: EMAIL_MFA_SEND_FAILURE_MESSAGE,
      maskedEmail,
      reason: "send_failed",
    };
  }

  await writeStaffAudit({
    action: "mfa.email.sent",
    actorUserId: input.userId,
    entityType: "user",
    entityId: input.userId,
    ip: input.ip,
    metadata: {},
  });
  return { ok: true, maskedEmail, retryAt: now + EMAIL_MFA_RESEND_GAP_MS };
}

export type EmailMfaConfirmResult =
  { ok: true } | { ok: false; message: string; locked: boolean };

async function openChallenge(
  userId: string,
  sessionId: string,
): Promise<ChallengeRow | null> {
  const rows = await db
    .select({
      id: staffEmailMfaChallenges.id,
      codeHmac: staffEmailMfaChallenges.codeHmac,
      attempts: staffEmailMfaChallenges.attempts,
      expiresAt: staffEmailMfaChallenges.expiresAt,
      consumedAt: staffEmailMfaChallenges.consumedAt,
      closedAt: staffEmailMfaChallenges.closedAt,
      createdAt: staffEmailMfaChallenges.createdAt,
    })
    .from(staffEmailMfaChallenges)
    .where(
      and(
        eq(staffEmailMfaChallenges.userId, userId),
        eq(staffEmailMfaChallenges.sessionId, sessionId),
        isNull(staffEmailMfaChallenges.consumedAt),
        isNull(staffEmailMfaChallenges.closedAt),
      ),
    )
    .orderBy(sql`${staffEmailMfaChallenges.createdAt} desc`)
    .limit(1);
  return rows[0] ?? null;
}

function firstExecuteRow(
  result: unknown,
): { id?: string; attempts?: number; code_hmac?: string } | undefined {
  if (Array.isArray(result)) {
    return result[0] as
      { id?: string; attempts?: number; code_hmac?: string } | undefined;
  }
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: { id?: string; attempts?: number; code_hmac?: string }[] })
      .rows[0];
  }
  return undefined;
}

function returnedId(result: unknown): string | null {
  return firstExecuteRow(result)?.id ?? null;
}

export async function confirmStaffEmailMfaCode(input: {
  userId: string;
  sessionId: string;
  code: string;
  ip: string | null;
  now?: number;
}): Promise<EmailMfaConfirmResult> {
  const code = parseEmailMfaCode(input.code);
  if (!code || !isUuid(input.userId) || !isUuid(input.sessionId)) {
    return { ok: false, message: EMAIL_MFA_INVALID_MESSAGE, locked: false };
  }
  void input.now;
  const challenge = await openChallenge(input.userId, input.sessionId);
  if (!challenge) {
    return { ok: false, message: EMAIL_MFA_INVALID_MESSAGE, locked: false };
  }

  const incremented = await db.execute(sql`
    update identity.staff_email_mfa_challenges
    set attempts = attempts + 1
    where id = ${challenge.id}::uuid
      and user_id = ${input.userId}::uuid
      and session_id = ${input.sessionId}::uuid
      and consumed_at is null
      and closed_at is null
      and attempts < ${EMAIL_MFA_MAX_ATTEMPTS}
      and expires_at > now()
    returning id, attempts, code_hmac
  `);
  const row = firstExecuteRow(incremented);
  if (!row?.id || typeof row.code_hmac !== "string") {
    return { ok: false, message: EMAIL_MFA_INVALID_MESSAGE, locked: false };
  }
  const attempts = Number(row.attempts);
  const submitted = emailMfaHmac(code, hmacSecret());
  if (!emailMfaHmacsMatch(submitted, row.code_hmac)) {
    await writeStaffAudit({
      action: "mfa.email.failed",
      actorUserId: input.userId,
      entityType: "user",
      entityId: input.userId,
      ip: input.ip,
      metadata: { attempt: attempts },
    });
    const locked = attempts >= EMAIL_MFA_MAX_ATTEMPTS;
    if (locked) {
      await db.execute(sql`
        update identity.staff_email_mfa_challenges
        set closed_at = now()
        where id = ${challenge.id}::uuid
          and consumed_at is null
          and closed_at is null
      `);
      await writeStaffAudit({
        action: "mfa.email.locked",
        actorUserId: input.userId,
        entityType: "user",
        entityId: input.userId,
        ip: input.ip,
        metadata: {},
      });
    }
    return { ok: false, message: EMAIL_MFA_INVALID_MESSAGE, locked };
  }

  const consumed = await db.execute(sql`
    update identity.staff_email_mfa_challenges
    set consumed_at = now()
    where id = ${challenge.id}::uuid
      and user_id = ${input.userId}::uuid
      and session_id = ${input.sessionId}::uuid
      and consumed_at is null
      and closed_at is null
    returning id
  `);
  if (!returnedId(consumed)) {
    return { ok: false, message: EMAIL_MFA_INVALID_MESSAGE, locked: false };
  }
  await writeStaffAudit({
    action: "mfa.email.verified",
    actorUserId: input.userId,
    entityType: "user",
    entityId: input.userId,
    ip: input.ip,
    metadata: {},
  });
  return { ok: true };
}
