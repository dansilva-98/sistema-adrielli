GRANT DELETE ON TABLE "clinic"."calendar_feed_requests" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_delete_old" ON "clinic"."calendar_feed_requests" FOR DELETE TO app_runtime USING ("attempted_at" < now() - interval '1 day');
