GRANT DELETE ON TABLE "identity"."login_attempts" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_delete_old" ON "identity"."login_attempts" FOR DELETE TO app_runtime USING ("attempted_at" < now() - interval '30 days');
--> statement-breakpoint
DROP POLICY "app_runtime_delete" ON "identity"."staff_email_mfa_challenges";
--> statement-breakpoint
CREATE POLICY "app_runtime_delete_old" ON "identity"."staff_email_mfa_challenges" FOR DELETE TO app_runtime USING ("created_at" < now() - interval '1 day' AND ("consumed_at" is not null OR "expires_at" < now()));
