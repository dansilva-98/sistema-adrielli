import { pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const identity = pgSchema("identity");

export const userKind = identity.enum("user_kind", ["STAFF", "CUSTOMER"]);

export const staffRole = identity.enum("staff_role", [
  "SUPER_ADMIN",
  "CONTENT_ADMIN",
  "CLINIC_ADMIN",
]);

export const users = identity.table("users", {
  id: uuid("id").primaryKey(),
  kind: userKind("kind").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export const userRoles = identity.table(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: staffRole("role").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);
