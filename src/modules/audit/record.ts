import type postgres from "postgres";
import { z } from "zod";

import type { AuditAction } from "../../db/audit-actions.ts";

const undoFromStatuses = [
  "scheduled",
  "completed",
  "missed_notified",
  "missed_unnotified",
  "cancelled",
  "rescheduled",
] as const;

const metadataSchema = z
  .object({
    attempt: z.number().int().min(1).max(5).optional(),
    factor_id: z.string().uuid().optional(),
    from: z.enum(undoFromStatuses).optional(),
    to: z.literal("scheduled").optional(),
    undo: z.literal(true).optional(),
    linked: z.boolean().optional(),
  })
  .strict();

export type AuditEvent = {
  action: AuditAction;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

type AuditExecutor = postgres.Sql | postgres.TransactionSql;

type AuditMetadata = {
  attempt?: number;
  factor_id?: string;
  from?: (typeof undoFromStatuses)[number];
  to?: "scheduled";
  undo?: true;
  linked?: boolean;
};

export async function recordAudit(event: AuditEvent, tx?: AuditExecutor): Promise<void> {
  const metadata = metadataSchema.safeParse(event.metadata ?? {});
  if (!metadata.success) throw new Error("Metadado de auditoria recusado.");
  if (tx) {
    await insertAudit(tx, event, metadata.data);
    return;
  }
  const { db } = await import("../../db/client.ts");
  const { auditLog } = await import("../../db/schema/index.ts");
  await db.insert(auditLog).values({
    action: event.action,
    actorUserId: event.actorUserId ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    ip: event.ip ?? null,
    metadata: metadata.data,
  });
}

async function insertAudit(
  tx: AuditExecutor,
  event: AuditEvent,
  metadata: AuditMetadata,
): Promise<void> {
  await tx`
    insert into audit.audit_log (
      actor_user_id, action, entity_type, entity_id, ip, metadata
    )
    values (
      ${event.actorUserId ?? null}::uuid,
      ${event.action},
      ${event.entityType ?? null},
      ${event.entityId ?? null}::uuid,
      ${event.ip ?? null}::inet,
      ${tx.json(metadata)}
    )
  `;
}
