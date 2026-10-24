import { mkdirSync, writeFileSync } from "node:fs";

import { buildSecurityHeaders } from "../src/lib/security-headers.ts";

const appEnv = required("APP_ENV");
if (appEnv !== "staging" && appEnv !== "production") {
  throw new Error("APP_ENV do cabeçalho precisa ser staging ou production.");
}

const headers = buildSecurityHeaders({
  appEnv,
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  sentryDsn: required("SENTRY_DSN"),
  publicSentryDsn: required("NEXT_PUBLIC_SENTRY_DSN"),
  isDev: false,
});

const lines = ["/*", ...headers.map((header) => `  ${header.key}: ${header.value}`), ""];
mkdirSync("public", { recursive: true });
writeFileSync("public/_headers", `${lines.join("\n")}\n`);
console.log("cabecalhos do arquivo estatico gravados");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}
