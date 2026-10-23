import { z } from "zod";

const postgresUrl = z
  .string()
  .trim()
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    { message: "invalid" },
  );

const requiredText = z.string().trim().min(1);
const httpUrl = z.url();

export const serverEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  SUPABASE_SERVICE_ROLE_KEY: requiredText,
  SENTRY_DSN: httpUrl,
  APP_ENV: z.enum(["development", "staging", "production"]),
  STAFF_SESSION_SECRET: requiredText.min(32),
});

export const migrationsEnvSchema = z.object({
  MIGRATIONS_DATABASE_URL: postgresUrl,
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredText,
  NEXT_PUBLIC_SENTRY_DSN: httpUrl,
  NEXT_PUBLIC_SITE_URL: httpUrl,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type MigrationsEnv = z.infer<typeof migrationsEnvSchema>;

export function formatEnvError(error: z.ZodError): string {
  const names = [
    ...new Set(
      error.issues.map((issue) =>
        issue.path.length > 0 ? issue.path.join(".") : "desconhecida",
      ),
    ),
  ];
  return `Variável de ambiente inválida ou ausente: ${names.join(", ")}`;
}

function fail(error: z.ZodError): never {
  throw new Error(formatEnvError(error));
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    SENTRY_DSN: source.SENTRY_DSN,
    APP_ENV: source.APP_ENV,
    STAFF_SESSION_SECRET: source.STAFF_SESSION_SECRET,
  });
  if (!parsed.success) fail(parsed.error);
  return parsed.data;
}

export function parseMigrationsEnv(
  source: Record<string, string | undefined>,
): MigrationsEnv {
  const parsed = migrationsEnvSchema.safeParse({
    MIGRATIONS_DATABASE_URL: source.MIGRATIONS_DATABASE_URL,
  });
  if (!parsed.success) fail(parsed.error);
  return parsed.data;
}

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: source.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) fail(parsed.error);
  return parsed.data;
}
