import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { parseServerEnv } from "../lib/env.ts";

export function assertSeedAllowed(appEnv: string | undefined): void {
  if (appEnv !== "development") {
    throw new Error("db:seed recusado: só executa quando APP_ENV=development.");
  }
}

function loadLocalEnv(): void {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const env = parseServerEnv(process.env);
  assertSeedAllowed(env.APP_ENV);
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
