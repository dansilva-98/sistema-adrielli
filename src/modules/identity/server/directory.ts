import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db/client";
import { userRoles, users } from "@/db/schema";
import type { AuditAction } from "@/db/audit-actions";
import { reportServerError } from "@/lib/sentry-server";
import { recordAudit, type AuditEvent } from "@/modules/audit/record";
import { isStaffRole, type StaffRole } from "@/modules/identity/access";
import type { StaffProfile } from "@/modules/identity/login";

const nonBlocking = new Set<AuditAction>([
  "auth.login.failure",
  "auth.login.success",
  "auth.logout",
  "auth.session.expired",
  "access.denied",
  "auth.mfa.unknown_factor",
  "mfa.email.sent",
  "mfa.email.verified",
  "mfa.email.failed",
  "mfa.email.locked",
  "mfa.email.rate_limited",
]);

export async function writeStaffAudit(input: AuditEvent): Promise<void> {
  try {
    await recordAudit(input);
  } catch (error) {
    await reportServerError(error);
    if (!nonBlocking.has(input.action)) throw error;
  }
}

export const loadStaffProfile = cache(
  async (userId: string): Promise<StaffProfile | null> => {
    const rows = await db
      .select({
        id: users.id,
        kind: users.kind,
        disabledAt: users.disabledAt,
        role: userRoles.role,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(eq(users.id, userId));
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      disabledAt: row.disabledAt,
      roles: rows.flatMap((item) =>
        item.role !== null && isStaffRole(item.role) ? [item.role] : [],
      ),
    };
  },
);

export async function findStaffActorByEmail(email: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0]?.id ?? null;
}

export type { StaffRole };
