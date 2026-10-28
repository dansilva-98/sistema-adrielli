import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgSchema,
  primaryKey,
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
