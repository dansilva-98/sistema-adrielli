CREATE TABLE "content"."faq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" varchar(200) NOT NULL,
	"answer" varchar(2000) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content"."faq" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content"."services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" varchar(240) NOT NULL,
	"body" text NOT NULL,
	"image_path" text,
	"image_alt" text,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "content"."services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content"."site_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"hero_title" text DEFAULT '' NOT NULL,
	"hero_subtitle" text DEFAULT '' NOT NULL,
	"hero_tagline" text DEFAULT '' NOT NULL,
	"hero_image_path" text,
	"hero_image_alt" text,
	"about_title" text DEFAULT '' NOT NULL,
	"about_body" text DEFAULT '' NOT NULL,
	"about_image_path" text,
	"about_image_alt" text,
	"how_it_works" jsonb DEFAULT '[{"title":"Contato","body":""},{"title":"Avaliação","body":""},{"title":"Atendimento","body":""},{"title":"Acompanhamento","body":""}]'::jsonb NOT NULL,
	"whatsapp_number" text,
	"whatsapp_message" text DEFAULT '' NOT NULL,
	"instagram_handle" text,
	"contact_email" text,
	"support_email" text,
	"address_text" text,
	"service_area_text" text,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "site_settings_id_singleton" CHECK ("content"."site_settings"."id" = 1),
	CONSTRAINT "site_settings_how_it_works_count" CHECK (jsonb_typeof("content"."site_settings"."how_it_works") = 'array' and jsonb_array_length("content"."site_settings"."how_it_works") between 3 and 6),
	CONSTRAINT "site_settings_whatsapp_digits" CHECK ("content"."site_settings"."whatsapp_number" is null or "content"."site_settings"."whatsapp_number" ~ '^[0-9]+$'),
	CONSTRAINT "site_settings_instagram_handle" CHECK ("content"."site_settings"."instagram_handle" is null or position('@' in "content"."site_settings"."instagram_handle") = 0)
);
--> statement-breakpoint
ALTER TABLE "content"."site_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content"."testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote" varchar(600) NOT NULL,
	"author_label" varchar(80) NOT NULL,
	"consent_at" date,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "testimonials_published_requires_consent" CHECK (not "content"."testimonials"."published" or "content"."testimonials"."consent_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "content"."testimonials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content"."faq" ADD CONSTRAINT "faq_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."services" ADD CONSTRAINT "services_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."testimonials" ADD CONSTRAINT "testimonials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faq_published_sort_order_idx" ON "content"."faq" USING btree ("published","sort_order");--> statement-breakpoint
CREATE INDEX "services_published_sort_order_idx" ON "content"."services" USING btree ("published","sort_order");--> statement-breakpoint
CREATE INDEX "testimonials_published_sort_order_idx" ON "content"."testimonials" USING btree ("published","sort_order");
--> statement-breakpoint
REVOKE ALL ON TABLE "content"."site_settings", "content"."services", "content"."testimonials", "content"."faq" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "content"."site_settings", "content"."services", "content"."testimonials", "content"."faq" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "content"."site_settings" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "content"."site_settings" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "content"."site_settings" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "content"."site_settings" FOR DELETE TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "content"."services" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "content"."services" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "content"."services" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "content"."services" FOR DELETE TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "content"."testimonials" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "content"."testimonials" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "content"."testimonials" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "content"."testimonials" FOR DELETE TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "content"."faq" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "content"."faq" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "content"."faq" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "content"."faq" FOR DELETE TO app_runtime USING (true);
--> statement-breakpoint
INSERT INTO "content"."site_settings" ("id") VALUES (1);
--> statement-breakpoint
ALTER TABLE "audit"."audit_log" DROP CONSTRAINT "audit_log_action_check";
--> statement-breakpoint
ALTER TABLE "audit"."audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("action" IN (
  'user.bootstrap',
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
  'auth.session.expired',
  'auth.mfa.enrolled',
  'auth.mfa.failure',
  'auth.password.reset',
  'user.invited',
  'user.role.granted',
  'user.role.revoked',
  'user.disabled',
  'user.enabled',
  'access.denied',
  'content.site.updated',
  'content.service.created',
  'content.service.updated',
  'content.service.deleted',
  'content.testimonial.created',
  'content.testimonial.updated',
  'content.testimonial.deleted',
  'content.faq.created',
  'content.faq.updated',
  'content.faq.deleted',
  'content.image.uploaded'
));
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'site-public',
      'site-public',
      true,
      4194304,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;