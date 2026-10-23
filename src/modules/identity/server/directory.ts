import "server-only";

import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { userRoles, users } from "@/db/schema";
import type { AuditAction } from "@/db/audit-actions";
import { recordAudit, type AuditEvent } from "@/modules/audit/record";
import { isStaffRole, type StaffRole } from "@/modules/identity/access";
import type { StaffProfile } from "@/modules/identity/login";

const nonBlocking = new Set<AuditAction>([
  "auth.login.failure",
  "auth.login.success",
  "auth.logout",
  "auth.session.expired",
  "access.denied",
]);

export async function writeStaffAudit(input: AuditEvent): Promise<void> {
  try {
    await recordAudit(input);
  } catch (error) {
    Sentry.captureException(error);
    if (!nonBlocking.has(input.action)) throw error;
  }
}

export async function loadStaffProfile(userId: string): Promise<StaffProfile | null> {
  const person = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = person[0];
  if (!row) return null;
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return {
    id: row.id,
    kind: row.kind,
    disabledAt: row.disabledAt,
    roles: roles.map((item) => item.role).filter(isStaffRole),
  };
}

export async function findStaffActorByEmail(email: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0]?.id ?? null;
}

export type { StaffRole };
