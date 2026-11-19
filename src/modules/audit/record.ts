import type postgres from "postgres";

import { parseAuditMetadata, recordAuditTx, type AuditEvent } from "./record-sql.ts";

export type { AuditEvent };

type AuditExecutor = postgres.Sql | postgres.TransactionSql;

export async function recordAudit(event: AuditEvent, tx?: AuditExecutor): Promise<void> {
  if (tx) {
    await recordAuditTx(event, tx);
    return;
  }
  const metadata = parseAuditMetadata(event.metadata);
  const { db } = await import("../../db/client.ts");
  const { auditLog } = await import("../../db/schema/index.ts");
  await db.insert(auditLog).values({
    action: event.action,
    actorUserId: event.actorUserId ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    ip: event.ip ?? null,
    metadata,
  });
}
