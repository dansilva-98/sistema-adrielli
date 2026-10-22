import { index, inet, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { AUDIT_ACTIONS } from "../audit-actions";

export const audit = pgSchema("audit");

export const auditLog = audit.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    ip: inet("ip"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    index("audit_log_occurred_at_idx").on(table.occurredAt),
    index("audit_log_actor_occurred_at_idx").on(table.actorUserId, table.occurredAt),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);
