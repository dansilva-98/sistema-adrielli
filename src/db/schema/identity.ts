import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

export const loginAttemptKind = identity.enum("login_attempt_kind", [
  "EMAIL",
  "IP",
  "MFA",
]);

export const loginAttempts = identity.table(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyHash: text("key_hash").notNull(),
    kind: loginAttemptKind("kind").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("login_attempts_key_attempted_at_idx").on(table.keyHash, table.attemptedAt),
  ],
);

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

export const staffEmailMfaChallenges = identity.table(
  "staff_email_mfa_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    codeHmac: text("code_hmac").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    ipHash: text("ip_hash"),
  },
  (table) => [
    index("staff_email_mfa_challenges_user_created_at_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("staff_email_mfa_challenges_session_consumed_idx")
      .on(table.sessionId)
      .where(sql`${table.consumedAt} is not null`),
    check(
      "staff_email_mfa_challenges_attempts_check",
      sql`${table.attempts} between 0 and 5`,
    ),
  ],
);

export const staffTotpFactors = identity.table(
  "staff_totp_factors",
  {
    factorId: uuid("factor_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("staff_totp_factors_user_id_idx").on(table.userId)],
);
