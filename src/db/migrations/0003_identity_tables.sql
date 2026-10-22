CREATE TYPE "identity"."staff_role" AS ENUM('SUPER_ADMIN', 'CONTENT_ADMIN', 'CLINIC_ADMIN');--> statement-breakpoint
CREATE TYPE "identity"."user_kind" AS ENUM('STAFF', 'CUSTOMER');--> statement-breakpoint
CREATE TABLE "audit"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"ip" "inet",
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."user_roles" (
	"user_id" uuid NOT NULL,
	"role" "identity"."staff_role" NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "identity"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "identity"."user_kind" NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit"."audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_occurred_at_idx" ON "audit"."audit_log" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit"."audit_log" USING btree ("entity_type","entity_id");
--> statement-breakpoint
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_id_auth_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
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
  'access.denied'
));
--> statement-breakpoint
ALTER TABLE "identity"."users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "identity"."user_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit"."audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "identity"."users", "identity"."user_roles" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "audit"."audit_log" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "identity"."users" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "identity"."user_roles" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "audit"."audit_log" TO app_runtime;
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "identity"."users" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "identity"."users" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_update" ON "identity"."users" FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "identity"."user_roles" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "identity"."user_roles" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_delete" ON "identity"."user_roles" FOR DELETE TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_select" ON "audit"."audit_log" FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY "app_runtime_insert" ON "audit"."audit_log" FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION "identity"."user_roles_staff_only"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  user_kind text;
BEGIN
  SELECT kind::text INTO user_kind FROM identity.users WHERE id = NEW.user_id;
  IF user_kind IS DISTINCT FROM 'STAFF' THEN
    RAISE EXCEPTION 'only STAFF users can have a role';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "user_roles_staff_only"
BEFORE INSERT OR UPDATE ON "identity"."user_roles"
FOR EACH ROW EXECUTE FUNCTION "identity"."user_roles_staff_only"();
--> statement-breakpoint
CREATE FUNCTION "audit"."reject_audit_log_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_log_immutable"
BEFORE UPDATE OR DELETE ON "audit"."audit_log"
FOR EACH ROW EXECUTE FUNCTION "audit"."reject_audit_log_mutation"();