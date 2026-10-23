import "server-only";

import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLog, userRoles, users } from "@/db/schema";
import type { AuditAction } from "@/db/audit-actions";
import { isStaffRole, type StaffRole } from "@/modules/identity/access";
import type { StaffProfile } from "@/modules/identity/login";

const metadataSchema = { empty: {} as const };

export async function writeStaffAudit(input: {
  action: AuditAction;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  metadata?: Record<string, never>;
}): Promise<void> {
  const metadata = input.metadata ?? metadataSchema.empty;
  try {
    await db.insert(auditLog).values({
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ip: input.ip ?? null,
      metadata,
    });
  } catch (error) {
    Sentry.captureException(error);
    const blocksTheUser =
      input.action !== "auth.login.failure" &&
      input.action !== "auth.login.success" &&
      input.action !== "auth.logout" &&
      input.action !== "auth.session.expired" &&
      input.action !== "access.denied";
    if (blocksTheUser) throw error;
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
