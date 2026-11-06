CREATE TABLE "identity"."staff_email_mfa_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"code_hmac" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	CONSTRAINT "staff_email_mfa_challenges_attempts_check" CHECK ("attempts" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "identity"."staff_email_mfa_challenges" ADD CONSTRAINT "staff_email_mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "staff_email_mfa_challenges_user_created_at_idx" ON "identity"."staff_email_mfa_challenges" USING btree ("user_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "staff_email_mfa_challenges_session_consumed_idx" ON "identity"."staff_email_mfa_challenges" USING btree ("session_id") WHERE "consumed_at" is not null;
--> statement-breakpoint
ALTER TABLE "identity"."staff_email_mfa_challenges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "identity"."staff_email_mfa_challenges" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "identity"."staff_email_mfa_challenges" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "identity"."staff_email_mfa_challenges" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "identity"."staff_email_mfa_challenges" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "identity"."staff_email_mfa_challenges" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "identity"."staff_email_mfa_challenges" FOR DELETE TO app_runtime USING (true);
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
