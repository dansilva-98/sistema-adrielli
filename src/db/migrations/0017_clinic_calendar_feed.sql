CREATE TABLE "clinic"."calendar_feed_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"kind" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_requests_kind" CHECK ("clinic"."calendar_feed_requests"."kind" in ('TOKEN', 'IP'))
);
--> statement-breakpoint
ALTER TABLE "clinic"."calendar_feed_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinic"."settings" ADD COLUMN "calendar_feed_token_hash" text;--> statement-breakpoint
ALTER TABLE "clinic"."settings" ADD COLUMN "calendar_feed_rotated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "calendar_feed_requests_key_attempted_at_idx" ON "clinic"."calendar_feed_requests" USING btree ("key_hash","attempted_at");--> statement-breakpoint
ALTER TABLE "clinic"."settings" ADD CONSTRAINT "settings_calendar_feed_token_hash" CHECK ("clinic"."settings"."calendar_feed_token_hash" is null or "clinic"."settings"."calendar_feed_token_hash" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
REVOKE ALL ON TABLE "clinic"."calendar_feed_requests" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "clinic"."calendar_feed_requests" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."calendar_feed_requests" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."calendar_feed_requests" FOR INSERT TO app_runtime WITH CHECK (true);
