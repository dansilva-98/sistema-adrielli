import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const content = pgSchema("content");

const HOW_IT_WORKS_DEFAULT = [
  { title: "Contato", body: "" },
  { title: "Avaliação", body: "" },
  { title: "Atendimento", body: "" },
  { title: "Acompanhamento", body: "" },
];

export const siteSettings = content
  .table(
    "site_settings",
    {
      id: smallint("id").primaryKey().default(1),
      heroTitle: text("hero_title").notNull().default(""),
      heroSubtitle: text("hero_subtitle").notNull().default(""),
      heroTagline: text("hero_tagline").notNull().default(""),
      heroImagePath: text("hero_image_path"),
      heroImageAlt: text("hero_image_alt"),
      aboutTitle: text("about_title").notNull().default(""),
      aboutBody: text("about_body").notNull().default(""),
      aboutImagePath: text("about_image_path"),
      aboutImageAlt: text("about_image_alt"),
      howItWorks: jsonb("how_it_works")
        .$type<{ title: string; body: string }[]>()
        .notNull()
        .default(HOW_IT_WORKS_DEFAULT),
      whatsappNumber: text("whatsapp_number"),
      whatsappMessage: text("whatsapp_message").notNull().default(""),
      instagramHandle: text("instagram_handle"),
      contactEmail: text("contact_email"),
      supportEmail: text("support_email"),
      addressText: text("address_text"),
      serviceAreaText: text("service_area_text"),
      seoTitle: text("seo_title").notNull().default(""),
      seoDescription: text("seo_description").notNull().default(""),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
      updatedBy: uuid("updated_by").references(() => users.id),
      version: integer("version").notNull().default(1),
    },
    (table) => [
      check("site_settings_id_singleton", sql`${table.id} = 1`),
      check(
        "site_settings_how_it_works_count",
        sql`jsonb_typeof(${table.howItWorks}) = 'array' and jsonb_array_length(${table.howItWorks}) between 3 and 6`,
      ),
      check(
        "site_settings_whatsapp_digits",
        sql`${table.whatsappNumber} is null or ${table.whatsappNumber} ~ '^[0-9]+$'`,
      ),
      check(
        "site_settings_instagram_handle",
        sql`${table.instagramHandle} is null or position('@' in ${table.instagramHandle}) = 0`,
      ),
    ],
  )
  .enableRLS();

export const services = content
  .table(
    "services",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      title: text("title").notNull(),
      slug: text("slug").notNull().unique(),
      summary: varchar("summary", { length: 240 }).notNull(),
      body: text("body").notNull(),
      imagePath: text("image_path"),
      imageAlt: text("image_alt"),
      published: boolean("published").notNull().default(false),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
      updatedBy: uuid("updated_by").references(() => users.id),
      version: integer("version").notNull().default(1),
    },
    (table) => [
      index("services_published_sort_order_idx").on(table.published, table.sortOrder),
    ],
  )
  .enableRLS();

export const testimonials = content
  .table(
    "testimonials",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      quote: varchar("quote", { length: 600 }).notNull(),
      authorLabel: varchar("author_label", { length: 80 }).notNull(),
      consentAt: date("consent_at"),
      published: boolean("published").notNull().default(false),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
      updatedBy: uuid("updated_by").references(() => users.id),
      version: integer("version").notNull().default(1),
    },
    (table) => [
      index("testimonials_published_sort_order_idx").on(table.published, table.sortOrder),
      check(
        "testimonials_published_requires_consent",
        sql`not ${table.published} or ${table.consentAt} is not null`,
      ),
    ],
  )
  .enableRLS();

export const faq = content
  .table(
    "faq",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      question: varchar("question", { length: 200 }).notNull(),
      answer: varchar("answer", { length: 2000 }).notNull(),
      published: boolean("published").notNull().default(false),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
      updatedBy: uuid("updated_by").references(() => users.id),
      version: integer("version").notNull().default(1),
    },
    (table) => [
      index("faq_published_sort_order_idx").on(table.published, table.sortOrder),
    ],
  )
  .enableRLS();
