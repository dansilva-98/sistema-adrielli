import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const clinic = pgSchema("clinic");

export const guardianRelationship = clinic.enum("guardian_relationship", [
  "MOTHER",
  "FATHER",
  "GRANDMOTHER",
  "SELF",
  "OTHER",
]);

export const attachmentCategory = clinic.enum("attachment_category", [
  "CLINICAL_REPORT",
  "SCHOOL_REPORT",
  "ASSESSMENT",
  "PERSONAL_DOCUMENT",
  "OTHER",
]);

export const appointmentStatus = clinic.enum("appointment_status", [
  "scheduled",
  "completed",
  "missed_notified",
  "missed_unnotified",
  "cancelled",
  "rescheduled",
]);

export const appointmentModality = clinic.enum("appointment_modality", [
  "in_person",
  "online",
]);

export const patients = clinic
  .table(
    "patients",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      fullName: text("full_name").notNull(),
      preferredName: text("preferred_name"),
      birthDate: date("birth_date").notNull(),
      cpf: text("cpf"),
      school: text("school"),
      schoolGrade: text("school_grade"),
      referralSource: text("referral_source"),
      notes: varchar("notes", { length: 2000 }),
      addressText: text("address_text"),
      fullNameSearch: text("full_name_search").notNull().default(""),
      archivedAt: timestamp("archived_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
      createdBy: uuid("created_by").references(() => users.id),
    },
    (table) => [
      uniqueIndex("patients_cpf_unique")
        .on(table.cpf)
        .where(sql`${table.cpf} is not null`),
      index("patients_full_name_search_idx").on(table.fullNameSearch),
      index("patients_archived_at_idx").on(table.archivedAt),
      check(
        "patients_cpf_digits",
        sql`${table.cpf} is null or ${table.cpf} ~ '^[0-9]{11}$'`,
      ),
    ],
  )
  .enableRLS();

export const guardians = clinic
  .table(
    "guardians",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      fullName: text("full_name").notNull(),
      relationship: guardianRelationship("relationship").notNull(),
      phone: text("phone").notNull(),
      email: text("email"),
      cpf: text("cpf"),
      receivesReminders: boolean("receives_reminders").notNull().default(false),
      fullNameSearch: text("full_name_search").notNull().default(""),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      uniqueIndex("guardians_cpf_unique")
        .on(table.cpf)
        .where(sql`${table.cpf} is not null`),
      index("guardians_full_name_search_idx").on(table.fullNameSearch),
      index("guardians_phone_idx").on(table.phone),
      check("guardians_phone_digits", sql`${table.phone} ~ '^[0-9]{10,13}$'`),
      check(
        "guardians_cpf_digits",
        sql`${table.cpf} is null or ${table.cpf} ~ '^[0-9]{11}$'`,
      ),
    ],
  )
  .enableRLS();

export const patientGuardians = clinic
  .table(
    "patient_guardians",
    {
      patientId: uuid("patient_id")
        .notNull()
        .references(() => patients.id),
      guardianId: uuid("guardian_id")
        .notNull()
        .references(() => guardians.id),
      isPrimary: boolean("is_primary").notNull().default(false),
    },
    (table) => [
      primaryKey({ columns: [table.patientId, table.guardianId] }),
      uniqueIndex("patient_guardians_one_primary")
        .on(table.patientId)
        .where(sql`${table.isPrimary}`),
    ],
  )
  .enableRLS();

export const patientAttachments = clinic
  .table(
    "patient_attachments",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      patientId: uuid("patient_id")
        .notNull()
        .references(() => patients.id),
      storagePath: text("storage_path").notNull(),
      originalName: text("original_name").notNull(),
      mimeType: text("mime_type").notNull(),
      sizeBytes: integer("size_bytes").notNull(),
      sha256: text("sha256").notNull(),
      category: attachmentCategory("category").notNull(),
      description: text("description"),
      uploadedBy: uuid("uploaded_by")
        .notNull()
        .references(() => users.id),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      deletedAt: timestamp("deleted_at", { withTimezone: true }),
      deletedBy: uuid("deleted_by").references(() => users.id),
    },
    (table) => [
      index("patient_attachments_patient_id_idx").on(table.patientId),
      uniqueIndex("patient_attachments_storage_path_key").on(table.storagePath),
      check(
        "patient_attachments_storage_path",
        sql`${table.storagePath} ~ ('^patients/' || ${table.patientId}::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(pdf|jpg|jpeg|png|webp)$')`,
      ),
      check(
        "patient_attachments_mime_type",
        sql`${table.mimeType} in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')`,
      ),
      check(
        "patient_attachments_size_bytes",
        sql`${table.sizeBytes} between 1 and 10485760`,
      ),
      check("patient_attachments_sha256", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    ],
  )
  .enableRLS();

export const settings = clinic
  .table(
    "settings",
    {
      id: smallint("id").primaryKey().default(1),
      defaultDurationMinutes: integer("default_duration_minutes").notNull().default(50),
      locationName: text("location_name").notNull().default(""),
      locationAddress: text("location_address").notNull().default(""),
      reminderSendHour: integer("reminder_send_hour").notNull().default(9),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
      updatedBy: uuid("updated_by").references(() => users.id),
    },
    (table) => [
      check("settings_id_singleton", sql`${table.id} = 1`),
      check(
        "settings_default_duration_minutes",
        sql`${table.defaultDurationMinutes} > 0`,
      ),
      check(
        "settings_reminder_send_hour",
        sql`${table.reminderSendHour} between 0 and 23`,
      ),
    ],
  )
  .enableRLS();

export const packages = clinic
  .table(
    "packages",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      patientId: uuid("patient_id")
        .notNull()
        .references(() => patients.id),
      totalSessions: integer("total_sessions").notNull(),
      startsOn: date("starts_on").notNull(),
      expiresOn: date("expires_on"),
      priceCents: integer("price_cents"),
      notes: varchar("notes", { length: 2000 }),
      closedAt: timestamp("closed_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      index("packages_patient_id_idx").on(table.patientId),
      check("packages_total_sessions", sql`${table.totalSessions} > 0`),
      check(
        "packages_price_cents",
        sql`${table.priceCents} is null or ${table.priceCents} >= 0`,
      ),
    ],
  )
  .enableRLS();

export const appointments = clinic
  .table(
    "appointments",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      patientId: uuid("patient_id")
        .notNull()
        .references(() => patients.id),
      packageId: uuid("package_id").references(() => packages.id),
      startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
      endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
      modality: appointmentModality("modality").notNull().default("in_person"),
      seriesId: uuid("series_id"),
      status: appointmentStatus("status").notNull().default("scheduled"),
      makeupOfId: uuid("makeup_of_id").references((): AnyPgColumn => appointments.id),
      rescheduledToId: uuid("rescheduled_to_id").references(
        (): AnyPgColumn => appointments.id,
      ),
      notes: varchar("notes", { length: 2000 }),
      cancelReason: varchar("cancel_reason", { length: 200 }),
      statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
      reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
      createdBy: uuid("created_by")
        .notNull()
        .references(() => users.id),
    },
    (table) => [
      index("appointments_starts_at_idx").on(table.startsAt),
      index("appointments_patient_id_idx").on(table.patientId),
      index("appointments_package_id_idx").on(table.packageId),
      uniqueIndex("appointments_makeup_of_unique")
        .on(table.makeupOfId)
        .where(
          sql`${table.makeupOfId} is not null and ${table.status} not in ('cancelled', 'rescheduled')`,
        ),
      check("appointments_time_order", sql`${table.endsAt} > ${table.startsAt}`),
      check(
        "appointments_rescheduled_link",
        sql`${table.rescheduledToId} is null or ${table.status} = 'rescheduled'`,
      ),
    ],
  )
  .enableRLS();

export const appointmentReminders = clinic
  .table(
    "appointment_reminders",
    {
      appointmentId: uuid("appointment_id")
        .notNull()
        .references(() => appointments.id),
      guardianId: uuid("guardian_id")
        .notNull()
        .references(() => guardians.id),
      sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.appointmentId, table.guardianId] })],
  )
  .enableRLS();
