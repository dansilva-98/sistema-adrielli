CREATE TABLE "clinic"."appointment_reminders" (
	"appointment_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_reminders_appointment_id_guardian_id_pk" PRIMARY KEY("appointment_id","guardian_id")
);
--> statement-breakpoint
ALTER TABLE "clinic"."appointment_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinic"."appointment_reminders" ADD CONSTRAINT "appointment_reminders_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "clinic"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic"."appointment_reminders" ADD CONSTRAINT "appointment_reminders_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "clinic"."guardians"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON TABLE "clinic"."appointment_reminders" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "clinic"."appointment_reminders" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "clinic"."appointment_reminders" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "clinic"."appointment_reminders" FOR INSERT TO app_runtime WITH CHECK (true);