import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";

import { parseServerEnv } from "../lib/env.ts";
import { APP_RUNTIME_ROLE, assertLocalDatabaseAllowed, databaseUser } from "./seed.ts";

export async function syncAppRuntimePassword(input: {
  appEnv: string | undefined;
  ownerUrl: string;
  runtimeUrl: string;
}): Promise<void> {
  assertLocalDatabaseAllowed(input.appEnv, input.ownerUrl);
  assertLocalDatabaseAllowed(input.appEnv, input.runtimeUrl);
  if (databaseUser(input.runtimeUrl) !== APP_RUNTIME_ROLE) {
    throw new Error("Recusado: a URL de runtime precisa usar o papel app_runtime.");
  }

  const password = decodeURIComponent(new URL(input.runtimeUrl).password);
  if (!password) throw new Error("Recusado: a URL de runtime não tem senha.");

  const sql = postgres(input.ownerUrl, { max: 1, prepare: false, connect_timeout: 5 });
  try {
    const roles = await sql<{ exists: boolean }[]>`
      select exists (select 1 from pg_roles where rolname = ${APP_RUNTIME_ROLE}) as exists
    `;
    if (!roles[0]?.exists) {
      throw new Error("Recusado: o papel app_runtime ainda não existe.");
    }
    const statements = await sql<{ statement: string }[]>`
      select format(
        'ALTER ROLE app_runtime WITH LOGIN PASSWORD %L',
        ${password}::text
      ) as statement
    `;
    const statement = statements[0]?.statement;
    if (!statement)
      throw new Error("Recusado: não foi possível preparar a senha do app_runtime.");
    await sql.unsafe(statement);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function loadLocalEnv(): void {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const env = parseServerEnv(process.env);
  if (env.APP_ENV !== "development") {
    console.log("Senha do app_runtime preservada fora de development.");
    return;
  }
  await syncAppRuntimePassword({
    appEnv: env.APP_ENV,
    ownerUrl: env.MIGRATIONS_DATABASE_URL,
    runtimeUrl: env.DATABASE_URL,
  });
  console.log("Senha local do app_runtime alinhada com DATABASE_URL.");
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("src/db/sync-app-runtime-password.ts")) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "alinhamento da senha falhou";
    console.error(message);
    process.exit(1);
  });
}
