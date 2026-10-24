ALTER TABLE "content"."services" ALTER COLUMN "title" SET DATA TYPE varchar(120);--> statement-breakpoint
ALTER TABLE "content"."services" ALTER COLUMN "slug" SET DATA TYPE varchar(80);--> statement-breakpoint
ALTER TABLE "content"."services" ALTER COLUMN "body" SET DATA TYPE varchar(12000);--> statement-breakpoint
ALTER TABLE "content"."services" ALTER COLUMN "image_path" SET DATA TYPE varchar(240);--> statement-breakpoint
ALTER TABLE "content"."services" ALTER COLUMN "image_alt" SET DATA TYPE varchar(160);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_title" SET DATA TYPE varchar(80);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_title" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_subtitle" SET DATA TYPE varchar(120);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_subtitle" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_tagline" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_tagline" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_image_path" SET DATA TYPE varchar(240);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "hero_image_alt" SET DATA TYPE varchar(160);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "about_title" SET DATA TYPE varchar(120);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "about_title" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "about_body" SET DATA TYPE varchar(12000);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "about_body" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "about_image_path" SET DATA TYPE varchar(240);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "about_image_alt" SET DATA TYPE varchar(160);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "whatsapp_number" SET DATA TYPE varchar(15);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "whatsapp_message" SET DATA TYPE varchar(400);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "whatsapp_message" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "instagram_handle" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "contact_email" SET DATA TYPE varchar(254);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "support_email" SET DATA TYPE varchar(254);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "address_text" SET DATA TYPE varchar(400);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "service_area_text" SET DATA TYPE varchar(400);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "seo_title" SET DATA TYPE varchar(70);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "seo_title" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "seo_description" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "content"."site_settings" ALTER COLUMN "seo_description" SET DEFAULT '';--> statement-breakpoint
CREATE FUNCTION content.how_it_works_text_ok(steps jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(steps) AS step
    WHERE jsonb_typeof(step) <> 'object'
      OR jsonb_typeof(step->'title') <> 'string'
      OR jsonb_typeof(step->'body') <> 'string'
      OR char_length(step->>'title') > 80
      OR char_length(step->>'body') > 400
  );
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION content.how_it_works_text_ok(jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION content.how_it_works_text_ok(jsonb) TO app_runtime;--> statement-breakpoint
ALTER TABLE "content"."site_settings" ADD CONSTRAINT "site_settings_how_it_works_text" CHECK (content.how_it_works_text_ok(how_it_works));
--> statement-breakpoint
DROP POLICY "app_runtime_insert" ON "content"."site_settings";
--> statement-breakpoint
DROP POLICY "app_runtime_delete" ON "content"."site_settings";
--> statement-breakpoint
REVOKE INSERT, DELETE ON TABLE "content"."site_settings" FROM app_runtime;