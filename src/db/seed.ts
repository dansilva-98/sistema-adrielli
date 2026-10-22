import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { parseServerEnv } from "../lib/env.ts";

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function assertLocalDatabaseAllowed(
  appEnv: string | undefined,
  databaseUrl: string,
): void {
  if (appEnv !== "development") {
    throw new Error("Recusado: só executa quando APP_ENV=development.");
  }

  let host: string;
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("Recusado: DATABASE_URL inválida.");
  }

  if (!LOCAL_DATABASE_HOSTS.has(host)) {
    throw new Error(
      "Recusado: o host da DATABASE_URL precisa ser 127.0.0.1 ou localhost.",
    );
  }
}

export function assertSeedAllowed(appEnv: string | undefined, databaseUrl: string): void {
  assertLocalDatabaseAllowed(appEnv, databaseUrl);
}

export const TEST_DATABASE_NAME = "ana_aprender_test";

export function databaseName(databaseUrl: string): string {
  let pathname: string;
  try {
    pathname = new URL(databaseUrl).pathname;
  } catch {
    throw new Error("Recusado: URL de banco inválida.");
  }
  const name = pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (!name) throw new Error("Recusado: URL de banco sem nome.");
  return decodeURIComponent(name);
}

export function assertTestDatabaseUrl(
  appEnv: string | undefined,
  databaseUrl: string,
): void {
  assertLocalDatabaseAllowed(appEnv, databaseUrl);
  if (databaseName(databaseUrl) !== TEST_DATABASE_NAME) {
    throw new Error(
      "Recusado: TEST_DATABASE_URL precisa usar o banco ana_aprender_test.",
    );
  }
}

function loadLocalEnv(): void {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const env = parseServerEnv(process.env);
  assertSeedAllowed(env.APP_ENV, env.DATABASE_URL);
  console.log("Seed concluído. Não há tabelas de negócio para popular neste épico.");
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("src/db/seed.ts")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "db:seed falhou";
    console.error(message);
    process.exit(1);
  });
}
