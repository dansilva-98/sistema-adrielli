import { writeFileSync } from "node:fs";

import { buildSecurityHeaders } from "../src/lib/security-headers.ts";

const headers = buildSecurityHeaders({
  appEnv: "staging",
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  sentryDsn: required("SENTRY_DSN"),
  publicSentryDsn: required("NEXT_PUBLIC_SENTRY_DSN"),
  isDev: false,
});

const lines = ["/*", ...headers.map((header) => `  ${header.key}: ${header.value}`), ""];
writeFileSync("public/_headers", `${lines.join("\n")}\n`);
console.log("cabecalhos do arquivo estatico gravados");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}
