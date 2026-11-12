CREATE TYPE "clinic"."appointment_modality" AS ENUM('in_person', 'online');--> statement-breakpoint
CREATE TYPE "clinic"."appointment_status" AS ENUM('scheduled', 'completed', 'missed_notified', 'missed_unnotified', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TABLE "clinic"."appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"package_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"modality" "clinic"."appointment_modality" DEFAULT 'in_person' NOT NULL,
	"series_id" uuid,
	"status" "clinic"."appointment_status" DEFAULT 'scheduled' NOT NULL,
	"makeup_of_id" uuid,
	"rescheduled_to_id" uuid,
	"notes" varchar(2000),
	"cancel_reason" varchar(200),
	"status_changed_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "appointments_time_order" CHECK ("clinic"."appointments"."ends_at" > "clinic"."appointments"."starts_at"),
	CONSTRAINT "appointments_rescheduled_link" CHECK ("clinic"."appointments"."rescheduled_to_id" is null or "clinic"."appointments"."status" = 'rescheduled')
);
--> statement-breakpoint
ALTER TABLE "clinic"."appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clinic"."packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"total_sessions" integer NOT NULL,
	"starts_on" date NOT NULL,
	"expires_on" date,
	"price_cents" integer,
	"notes" varchar(2000),
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_total_sessions" CHECK ("clinic"."packages"."total_sessions" > 0),
	CONSTRAINT "packages_price_cents" CHECK ("clinic"."packages"."price_cents" is null or "clinic"."packages"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "clinic"."packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clinic"."settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_duration_minutes" integer DEFAULT 50 NOT NULL,
	"location_name" text DEFAULT '' NOT NULL,
	"location_address" text DEFAULT '' NOT NULL,
	"reminder_send_hour" integer DEFAULT 9 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "settings_id_singleton" CHECK ("clinic"."settings"."id" = 1),
	CONSTRAINT "settings_default_duration_minutes" CHECK ("clinic"."settings"."default_duration_minutes" > 0),
	CONSTRAINT "settings_reminder_send_hour" CHECK ("clinic"."settings"."reminder_send_hour" between 0 and 23)
);
--> statement-breakpoint
ALTER TABLE "clinic"."settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinic"."appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "clinic"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."appointments" ADD CONSTRAINT "appointments_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "clinic"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."appointments" ADD CONSTRAINT "appointments_makeup_of_id_appointments_id_fk" FOREIGN KEY ("makeup_of_id") REFERENCES "clinic"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."appointments" ADD CONSTRAINT "appointments_rescheduled_to_id_appointments_id_fk" FOREIGN KEY ("rescheduled_to_id") REFERENCES "clinic"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."packages" ADD CONSTRAINT "packages_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "clinic"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_starts_at_idx" ON "clinic"."appointments" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_id_idx" ON "clinic"."appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointments_package_id_idx" ON "clinic"."appointments" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_makeup_of_unique" ON "clinic"."appointments" USING btree ("makeup_of_id") WHERE "clinic"."appointments"."makeup_of_id" is not null and "clinic"."appointments"."status" not in ('cancelled', 'rescheduled');--> statement-breakpoint
CREATE INDEX "packages_patient_id_idx" ON "clinic"."packages" USING btree ("patient_id");
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
DO $$
DECLARE
  extension_schema name;
BEGIN
  SELECT n.nspname
    INTO extension_schema
  FROM pg_extension AS e
  JOIN pg_namespace AS n ON n.oid = e.extnamespace
  WHERE e.extname = 'btree_gist';

  IF extension_schema IS NULL THEN
    CREATE EXTENSION btree_gist WITH SCHEMA extensions;
  ELSIF extension_schema <> 'extensions' THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA extensions TO app_runtime;
--> statement-breakpoint
ALTER TABLE "clinic"."appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" IN ('scheduled', 'completed'));
--> statement-breakpoint
CREATE TRIGGER "packages_touch_updated_at"
BEFORE UPDATE ON "clinic"."packages"
FOR EACH ROW EXECUTE FUNCTION "clinic"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "appointments_touch_updated_at"
BEFORE UPDATE ON "clinic"."appointments"
FOR EACH ROW EXECUTE FUNCTION "clinic"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "settings_touch_updated_at"
BEFORE UPDATE ON "clinic"."settings"
FOR EACH ROW EXECUTE FUNCTION "clinic"."touch_updated_at"();
--> statement-breakpoint
INSERT INTO "clinic"."settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
REVOKE ALL ON TABLE "clinic"."settings", "clinic"."packages", "clinic"."appointments" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE "clinic"."settings" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "clinic"."packages" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "clinic"."appointments" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."settings" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "clinic"."settings" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."packages" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."packages" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "clinic"."packages" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."appointments" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."appointments" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "clinic"."appointments" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
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
  'auth.mfa.unknown_factor',
  'mfa.email.sent',
  'mfa.email.verified',
  'mfa.email.failed',
  'mfa.email.locked',
  'mfa.email.rate_limited',
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
  'clinic.attachment.deleted',
  'clinic.appointment.created',
  'clinic.appointment.status_changed',
  'clinic.appointment.rescheduled',
  'clinic.appointment.cancelled',
  'clinic.package.created',
  'clinic.package.closed',
  'clinic.reminder.sent',
  'clinic.calendar_feed.rotated',
  'clinic.settings.updated'
));