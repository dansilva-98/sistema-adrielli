CREATE TABLE "identity"."staff_totp_factors" (
	"factor_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."staff_totp_factors" ADD CONSTRAINT "staff_totp_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "staff_totp_factors_user_id_idx" ON "identity"."staff_totp_factors" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "identity"."staff_totp_factors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "identity"."staff_totp_factors" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "identity"."staff_totp_factors" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "identity"."staff_totp_factors" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "identity"."staff_totp_factors" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "identity"."staff_totp_factors" FOR DELETE TO app_runtime USING (true);
--> statement-breakpoint
DO $backfill$
BEGIN
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    INSERT INTO "identity"."staff_totp_factors" ("factor_id", "user_id", "enrolled_at")
    SELECT "id", "user_id", "created_at"
    FROM "auth"."mfa_factors"
    WHERE "factor_type"::text = 'totp' AND "status"::text = 'verified'
    ON CONFLICT ("factor_id") DO NOTHING;
  END IF;
END
$backfill$;
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
  'clinic.attachment.deleted'
));
