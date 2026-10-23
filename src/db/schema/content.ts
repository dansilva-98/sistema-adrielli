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
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { CONTENT_LIMITS } from "../content-limits";
import { users } from "./identity";

export const content = pgSchema("content");

const HOW_IT_WORKS_DEFAULT = [
  { title: "Contato", body: "" },
  { title: "Avaliação", body: "" },
  { title: "Atendimento", body: "" },
  { title: "Acompanhamento", body: "" },
];

const howItWorksTextLimit = sql.raw(`content.how_it_works_text_ok(how_it_works)`);

export const siteSettings = content
  .table(
    "site_settings",
    {
      id: smallint("id").primaryKey().default(1),
      heroTitle: varchar("hero_title", { length: CONTENT_LIMITS.heroTitle })
        .notNull()
        .default(""),
      heroSubtitle: varchar("hero_subtitle", { length: CONTENT_LIMITS.heroSubtitle })
        .notNull()
        .default(""),
      heroTagline: varchar("hero_tagline", { length: CONTENT_LIMITS.heroTagline })
        .notNull()
        .default(""),
      heroImagePath: varchar("hero_image_path", { length: CONTENT_LIMITS.heroImagePath }),
      heroImageAlt: varchar("hero_image_alt", { length: CONTENT_LIMITS.heroImageAlt }),
      aboutTitle: varchar("about_title", { length: CONTENT_LIMITS.aboutTitle })
        .notNull()
        .default(""),
      aboutBody: varchar("about_body", { length: CONTENT_LIMITS.aboutBody })
        .notNull()
        .default(""),
      aboutImagePath: varchar("about_image_path", {
        length: CONTENT_LIMITS.aboutImagePath,
      }),
      aboutImageAlt: varchar("about_image_alt", { length: CONTENT_LIMITS.aboutImageAlt }),
      howItWorks: jsonb("how_it_works")
        .$type<{ title: string; body: string }[]>()
        .notNull()
        .default(HOW_IT_WORKS_DEFAULT),
      whatsappNumber: varchar("whatsapp_number", {
        length: CONTENT_LIMITS.whatsappNumber,
      }),
      whatsappMessage: varchar("whatsapp_message", {
        length: CONTENT_LIMITS.whatsappMessage,
      })
        .notNull()
        .default(""),
      instagramHandle: varchar("instagram_handle", {
        length: CONTENT_LIMITS.instagramHandle,
      }),
      contactEmail: varchar("contact_email", { length: CONTENT_LIMITS.contactEmail }),
      supportEmail: varchar("support_email", { length: CONTENT_LIMITS.supportEmail }),
      addressText: varchar("address_text", { length: CONTENT_LIMITS.addressText }),
      serviceAreaText: varchar("service_area_text", {
        length: CONTENT_LIMITS.serviceAreaText,
      }),
      seoTitle: varchar("seo_title", { length: CONTENT_LIMITS.seoTitle })
        .notNull()
        .default(""),
      seoDescription: varchar("seo_description", {
        length: CONTENT_LIMITS.seoDescription,
      })
        .notNull()
        .default(""),
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
      check("site_settings_how_it_works_text", howItWorksTextLimit),
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
      title: varchar("title", { length: CONTENT_LIMITS.serviceTitle }).notNull(),
      slug: varchar("slug", { length: CONTENT_LIMITS.serviceSlug }).notNull().unique(),
      summary: varchar("summary", { length: CONTENT_LIMITS.serviceSummary }).notNull(),
      body: varchar("body", { length: CONTENT_LIMITS.serviceBody }).notNull(),
      imagePath: varchar("image_path", { length: CONTENT_LIMITS.serviceImagePath }),
      imageAlt: varchar("image_alt", { length: CONTENT_LIMITS.serviceImageAlt }),
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
      quote: varchar("quote", { length: CONTENT_LIMITS.testimonialQuote }).notNull(),
      authorLabel: varchar("author_label", {
        length: CONTENT_LIMITS.testimonialAuthor,
      }).notNull(),
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
      question: varchar("question", { length: CONTENT_LIMITS.faqQuestion }).notNull(),
      answer: varchar("answer", { length: CONTENT_LIMITS.faqAnswer }).notNull(),
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
