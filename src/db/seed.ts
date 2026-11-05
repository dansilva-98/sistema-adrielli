import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";

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

export const TEST_DATABASE_NAME = "adrielli_flores_test";
export const APP_RUNTIME_ROLE = "app_runtime";

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

export function databaseUser(databaseUrl: string): string {
  let username: string;
  try {
    username = new URL(databaseUrl).username;
  } catch {
    throw new Error("Recusado: URL de banco inválida.");
  }
  if (!username) throw new Error("Recusado: URL de banco sem usuário.");
  return decodeURIComponent(username);
}

export function assertRuntimeDatabaseUrl(
  appEnv: string | undefined,
  databaseUrl: string,
): void {
  assertLocalDatabaseAllowed(appEnv, databaseUrl);
  if (databaseUser(databaseUrl) !== APP_RUNTIME_ROLE) {
    throw new Error("Recusado: a URL de runtime precisa usar o papel app_runtime.");
  }
}

export function assertTestDatabaseUrl(
  appEnv: string | undefined,
  databaseUrl: string,
): void {
  assertLocalDatabaseAllowed(appEnv, databaseUrl);
  if (databaseName(databaseUrl) !== TEST_DATABASE_NAME) {
    throw new Error(
      "Recusado: TEST_DATABASE_URL precisa usar o banco adrielli_flores_test.",
    );
  }
}

export type HowItWorksSeedStep = { title: string; body: string };

export const EMPTY_HOW_IT_WORKS: HowItWorksSeedStep[] = [
  { title: "Contato", body: "" },
  { title: "Avaliação", body: "" },
  { title: "Atendimento", body: "" },
  { title: "Acompanhamento", body: "" },
];

export const EXAMPLE_HOW_IT_WORKS: HowItWorksSeedStep[] = [
  { title: "Contato", body: "Exemplo: o primeiro contato." },
  { title: "Avaliação", body: "Exemplo: a avaliação do quadro." },
  { title: "Atendimento", body: "Exemplo: o plano de atendimento." },
  { title: "Acompanhamento", body: "Exemplo: o acompanhamento da evolução." },
];

export function howItWorksForSeed(emptySite: boolean): HowItWorksSeedStep[] {
  return emptySite ? EMPTY_HOW_IT_WORKS : EXAMPLE_HOW_IT_WORKS;
}

function loadLocalEnv(): void {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

async function seedHowItWorks(databaseUrl: string, emptySite: boolean): Promise<void> {
  const steps = howItWorksForSeed(emptySite);
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 8 });
  try {
    const updated = await sql`
      update content.site_settings
      set how_it_works = ${sql.json(steps)}
      where id = 1
    `;
    if (updated.count !== 1) {
      throw new Error("Recusado: site_settings ausente.");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const env = parseServerEnv(process.env);
  assertSeedAllowed(env.APP_ENV, env.DATABASE_URL);
  const emptySite = process.env.EMPTY_SITE === "1";
  await seedHowItWorks(env.DATABASE_URL, emptySite);
  console.log(
    emptySite
      ? "Seed concluído. Como funciona ficou sem texto."
      : "Seed concluído. Como funciona de exemplo gravado.",
  );
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("src/db/seed.ts")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "db:seed falhou";
    console.error(message);
    process.exit(1);
  });
}
