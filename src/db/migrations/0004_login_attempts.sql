CREATE TYPE "identity"."login_attempt_kind" AS ENUM('EMAIL', 'IP');--> statement-breakpoint
CREATE TABLE "identity"."login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"kind" "identity"."login_attempt_kind" NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_key_attempted_at_idx" ON "identity"."login_attempts" USING btree ("key_hash","attempted_at");
--> statement-breakpoint
ALTER TABLE "identity"."login_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "identity"."login_attempts" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "identity"."login_attempts" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "identity"."login_attempts" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "identity"."login_attempts" FOR INSERT TO app_runtime WITH CHECK (true);