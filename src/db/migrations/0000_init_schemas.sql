DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  schema_name text;
  owner_name text;
  owner_names text[] := ARRAY['postgres', 'supabase_admin', current_user];
  app_schemas text[] := ARRAY['identity', 'content', 'commerce', 'clinic', 'audit'];
BEGIN
  FOREACH schema_name IN ARRAY app_schemas
  LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', schema_name);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon, authenticated', schema_name);
    FOREACH owner_name IN ARRAY owner_names
    LOOP
      -- O papel local postgres não é membro de supabase_admin.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = owner_name)
        AND pg_has_role(current_user, owner_name, 'MEMBER') THEN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON TABLES FROM anon, authenticated',
          owner_name,
          schema_name
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM anon, authenticated',
          owner_name,
          schema_name
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM anon, authenticated',
          owner_name,
          schema_name
        );
      END IF;
    END LOOP;
  END LOOP;
END
$$;
