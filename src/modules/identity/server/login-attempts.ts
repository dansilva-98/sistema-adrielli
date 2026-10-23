import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";
import {
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  LOGIN_WINDOW_MS,
  MFA_ATTEMPT_LIMIT,
  loginAttemptKey,
} from "@/modules/identity/staff-session";
import { serverEnv } from "@/lib/env.server";

async function countAttempts(
  keyHash: string,
  kind: "EMAIL" | "IP" | "MFA",
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.keyHash, keyHash),
        eq(loginAttempts.kind, kind),
        gt(loginAttempts.attemptedAt, since),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function loginIsLimited(keys: {
  emailKey: string;
  ipKey: string | null;
}): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  if ((await countAttempts(keys.emailKey, "EMAIL", since)) >= LOGIN_EMAIL_LIMIT)
    return true;
  if (!keys.ipKey) return false;
  return (await countAttempts(keys.ipKey, "IP", since)) >= LOGIN_IP_LIMIT;
}

export async function recordLoginAttempt(keys: {
  emailKey: string;
  ipKey: string | null;
}): Promise<void> {
  await db.insert(loginAttempts).values({ keyHash: keys.emailKey, kind: "EMAIL" });
  if (keys.ipKey) {
    await db.insert(loginAttempts).values({ keyHash: keys.ipKey, kind: "IP" });
  }
}

export async function mfaIsLimited(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const keyHash = loginAttemptKey(userId, serverEnv.STAFF_SESSION_SECRET);
  return (await countAttempts(keyHash, "MFA", since)) >= MFA_ATTEMPT_LIMIT;
}

export async function recordMfaFailure(userId: string): Promise<void> {
  const keyHash = loginAttemptKey(userId, serverEnv.STAFF_SESSION_SECRET);
  await db.insert(loginAttempts).values({ keyHash, kind: "MFA" });
}
