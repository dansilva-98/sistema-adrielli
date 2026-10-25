import type postgres from "postgres";
import { z } from "zod";

import type { AuditAction } from "../../db/audit-actions.ts";

const metadataSchema = z.object({}).strict();

export type AuditEvent = {
  action: AuditAction;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

type AuditExecutor = postgres.Sql | postgres.TransactionSql;

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
  metadata: Record<string, never>,
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
