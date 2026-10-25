CREATE TYPE "clinic"."attachment_category" AS ENUM('CLINICAL_REPORT', 'SCHOOL_REPORT', 'ASSESSMENT', 'PERSONAL_DOCUMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "clinic"."guardian_relationship" AS ENUM('MOTHER', 'FATHER', 'GRANDMOTHER', 'SELF', 'OTHER');--> statement-breakpoint
CREATE TABLE "clinic"."guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"relationship" "clinic"."guardian_relationship" NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"cpf" text,
	"receives_reminders" boolean DEFAULT false NOT NULL,
	"full_name_search" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_phone_digits" CHECK ("clinic"."guardians"."phone" ~ '^[0-9]{10,13}$'),
	CONSTRAINT "guardians_cpf_digits" CHECK ("clinic"."guardians"."cpf" is null or "clinic"."guardians"."cpf" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
ALTER TABLE "clinic"."guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clinic"."patient_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"category" "clinic"."attachment_category" NOT NULL,
	"description" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "patient_attachments_storage_path" CHECK ("clinic"."patient_attachments"."storage_path" ~ ('^patients/' || "clinic"."patient_attachments"."patient_id"::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$')),
	CONSTRAINT "patient_attachments_mime_type" CHECK ("clinic"."patient_attachments"."mime_type" in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "patient_attachments_size_bytes" CHECK ("clinic"."patient_attachments"."size_bytes" between 1 and 10485760),
	CONSTRAINT "patient_attachments_sha256" CHECK ("clinic"."patient_attachments"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "clinic"."patient_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clinic"."patient_guardians" (
	"patient_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "patient_guardians_patient_id_guardian_id_pk" PRIMARY KEY("patient_id","guardian_id")
);
--> statement-breakpoint
ALTER TABLE "clinic"."patient_guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clinic"."patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"preferred_name" text,
	"birth_date" date NOT NULL,
	"cpf" text,
	"school" text,
	"school_grade" text,
	"referral_source" text,
	"notes" varchar(2000),
	"address_text" text,
	"full_name_search" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "patients_cpf_digits" CHECK ("clinic"."patients"."cpf" is null or "clinic"."patients"."cpf" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
ALTER TABLE "clinic"."patients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinic"."patient_attachments" ADD CONSTRAINT "patient_attachments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "clinic"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."patient_attachments" ADD CONSTRAINT "patient_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."patient_attachments" ADD CONSTRAINT "patient_attachments_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."patient_guardians" ADD CONSTRAINT "patient_guardians_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "clinic"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."patient_guardians" ADD CONSTRAINT "patient_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "clinic"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."patients" ADD CONSTRAINT "patients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_cpf_unique" ON "clinic"."guardians" USING btree ("cpf") WHERE "clinic"."guardians"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "guardians_full_name_search_idx" ON "clinic"."guardians" USING btree ("full_name_search");--> statement-breakpoint
CREATE INDEX "guardians_phone_idx" ON "clinic"."guardians" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "patient_attachments_patient_id_idx" ON "clinic"."patient_attachments" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_guardians_one_primary" ON "clinic"."patient_guardians" USING btree ("patient_id") WHERE "clinic"."patient_guardians"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "patients_cpf_unique" ON "clinic"."patients" USING btree ("cpf") WHERE "clinic"."patients"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "patients_full_name_search_idx" ON "clinic"."patients" USING btree ("full_name_search");--> statement-breakpoint
CREATE INDEX "patients_archived_at_idx" ON "clinic"."patients" USING btree ("archived_at");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE FUNCTION "clinic"."fold_search"(value text) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.unaccent(lower(coalesce(value, '')))
$$;
--> statement-breakpoint
CREATE FUNCTION "clinic"."cpf_is_valid"(value text) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  total integer := 0;
  digit integer;
  index integer;
BEGIN
  IF value IS NULL THEN
    RETURN true;
  END IF;
  IF value !~ '^[0-9]{11}$' OR value ~ '^([0-9])\1{10}$' THEN
    RETURN false;
  END IF;
  FOR index IN 1..9 LOOP
    total := total + (11 - index) * substring(value, index, 1)::integer;
  END LOOP;
  digit := (total * 10) % 11;
  IF digit = 10 THEN
    digit := 0;
  END IF;
  IF digit <> substring(value, 10, 1)::integer THEN
    RETURN false;
  END IF;
  total := 0;
  FOR index IN 1..10 LOOP
    total := total + (12 - index) * substring(value, index, 1)::integer;
  END LOOP;
  digit := (total * 10) % 11;
  IF digit = 10 THEN
    digit := 0;
  END IF;
  RETURN digit = substring(value, 11, 1)::integer;
END;
$$;
--> statement-breakpoint
ALTER TABLE "clinic"."patients" ADD CONSTRAINT "patients_cpf_valid" CHECK ("clinic"."cpf_is_valid"("cpf"));
--> statement-breakpoint
ALTER TABLE "clinic"."guardians" ADD CONSTRAINT "guardians_cpf_valid" CHECK ("clinic"."cpf_is_valid"("cpf"));
--> statement-breakpoint
CREATE FUNCTION "clinic"."prepare_named_row"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.full_name_search := clinic.fold_search(NEW.full_name);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "patients_prepare_named_row"
BEFORE INSERT OR UPDATE OF full_name ON "clinic"."patients"
FOR EACH ROW EXECUTE FUNCTION "clinic"."prepare_named_row"();
--> statement-breakpoint
CREATE TRIGGER "guardians_prepare_named_row"
BEFORE INSERT OR UPDATE OF full_name ON "clinic"."guardians"
FOR EACH ROW EXECUTE FUNCTION "clinic"."prepare_named_row"();
--> statement-breakpoint
CREATE FUNCTION "clinic"."touch_updated_at"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "patients_touch_updated_at"
BEFORE UPDATE ON "clinic"."patients"
FOR EACH ROW EXECUTE FUNCTION "clinic"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "guardians_touch_updated_at"
BEFORE UPDATE ON "clinic"."guardians"
FOR EACH ROW EXECUTE FUNCTION "clinic"."touch_updated_at"();
--> statement-breakpoint
CREATE FUNCTION "clinic"."reject_patient_without_guardian"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'patients' THEN
    target := NEW.id;
    IF NOT EXISTS (
      SELECT 1 FROM clinic.patient_guardians WHERE patient_id = target
    ) THEN
      RAISE EXCEPTION 'patient must have a guardian';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM clinic.patient_guardians WHERE patient_id = OLD.patient_id
  ) THEN
    RAISE EXCEPTION 'patient must have a guardian';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.patient_id IS DISTINCT FROM OLD.patient_id AND NOT EXISTS (
    SELECT 1 FROM clinic.patient_guardians WHERE patient_id = NEW.patient_id
  ) THEN
    RAISE EXCEPTION 'patient must have a guardian';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "patients_require_guardian"
AFTER INSERT ON "clinic"."patients"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "clinic"."reject_patient_without_guardian"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "patient_guardians_keep_one"
AFTER DELETE OR UPDATE OF patient_id ON "clinic"."patient_guardians"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "clinic"."reject_patient_without_guardian"();
--> statement-breakpoint
REVOKE ALL ON TABLE "clinic"."patients", "clinic"."guardians", "clinic"."patient_guardians", "clinic"."patient_attachments" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "clinic"."patients" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "clinic"."guardians" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "clinic"."patient_guardians" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "clinic"."patient_attachments" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."patients" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."patients" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "clinic"."patients" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."guardians" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."guardians" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "clinic"."guardians" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."patient_guardians" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."patient_guardians" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "clinic"."patient_guardians" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "clinic"."patient_guardians" FOR DELETE TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."patient_attachments" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."patient_attachments" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "clinic"."patient_attachments" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
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
  'content.image.uploaded',
  'clinic.patient.created',
  'clinic.patient.updated',
  'clinic.patient.archived',
  'clinic.patient.restored',
  'clinic.patient.viewed',
  'clinic.guardian.linked',
  'clinic.guardian.unlinked',
  'clinic.guardian.updated',
  'clinic.attachment.uploaded',
  'clinic.attachment.downloaded',
  'clinic.attachment.deleted'
));
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'clinic-private',
      'clinic-private',
      false,
      10485760,
      ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;