import { describe, expect, it } from "vitest";

import {
  formatEnvError,
  parseClientEnv,
  parseMigrationsEnv,
  parseServerEnv,
} from "@/lib/env";
import { z } from "zod";

const validServer = {
  DATABASE_URL: "postgresql://app_runtime:app-runtime-local@127.0.0.1:54322/postgres",
  MIGRATIONS_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SENTRY_DSN: "https://public@o0.ingest.sentry.io/0",
  APP_ENV: "development",
  STAFF_SESSION_SECRET: "local-staff-session-secret-32chars",
};

const validClient = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_SENTRY_DSN: "https://public@o0.ingest.sentry.io/0",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
};

describe("env", () => {
  it("aceita o conjunto válido", () => {
    expect(parseServerEnv(validServer).APP_ENV).toBe("development");
    expect(parseServerEnv(validServer)).not.toHaveProperty("MIGRATIONS_DATABASE_URL");
    expect(parseMigrationsEnv(validServer).MIGRATIONS_DATABASE_URL).toContain(
      "postgres:postgres@",
    );
    expect(parseClientEnv(validClient).NEXT_PUBLIC_SITE_URL).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("nomeia a variável ausente e não inclui o valor informado", () => {
    const secret = "super-secret-password";
    expect(() =>
      parseServerEnv({
        ...validServer,
        DATABASE_URL: secret,
      }),
    ).toThrow(/DATABASE_URL/);

    try {
      parseServerEnv({
        SUPABASE_SERVICE_ROLE_KEY: secret,
        SENTRY_DSN: validServer.SENTRY_DSN,
        APP_ENV: "production",
      });
      throw new Error("deveria falhar");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("MIGRATIONS_DATABASE_URL");
      expect(message).not.toContain(secret);
    }
  });

  it("não exige a URL de migration no runtime", () => {
    const runtime = { ...validServer, MIGRATIONS_DATABASE_URL: undefined };
    expect(parseServerEnv(runtime).DATABASE_URL).toContain("app_runtime");
    expect(() => parseMigrationsEnv(runtime)).toThrow(/MIGRATIONS_DATABASE_URL/);
  });

  it("rejeita APP_ENV fora da lista sem repetir o valor", () => {
    const invalid = "qa-secret-env";
    try {
      parseServerEnv({ ...validServer, APP_ENV: invalid });
      throw new Error("deveria falhar");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("APP_ENV");
      expect(message).not.toContain(invalid);
    }
  });

  it("não coloca segredo de servidor no ambiente público", () => {
    const parsed = parseClientEnv({
      ...validClient,
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    });
    expect(parsed).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("formata só os nomes das variáveis", () => {
    const error = new z.ZodError([
      {
        code: "custom",
        path: ["DATABASE_URL"],
        message: "valor secreto postgresql://user:senha@localhost/db",
      },
    ]);
    const message = formatEnvError(error);
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("senha");
  });
});
