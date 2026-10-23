import postgres from "postgres";

import { describeDatabaseUrl, normalizeDatabaseUrl } from "./h1-db-url.mjs";

const raw = process.env.MIGRATIONS_DATABASE_URL ?? "";
if (!raw.trim()) {
  console.log("MIGRATIONS_DATABASE_URL ausente");
  process.exit(1);
}

const normalized = normalizeDatabaseUrl(raw);
if (!normalized) {
  console.log(`MIGRATIONS_DATABASE_URL não é uma URL. ${describeDatabaseUrl(raw)}`);
  process.exit(1);
}

const parsed = new URL(normalized);
const user = decodeURIComponent(parsed.username);
const userKind = user.startsWith("postgres.")
  ? "postgres.projeto"
  : user === "postgres"
    ? "postgres sem sufixo"
    : user.startsWith("app_runtime")
      ? "app_runtime"
      : "outro";
const hostKind = parsed.hostname.endsWith(".pooler.supabase.com")
  ? "pooler"
  : parsed.hostname.startsWith("db.")
    ? "direto"
    : "outro";
const region = parsed.hostname.match(/[a-z]{2}-[a-z]+-\d/)?.[0] ?? "desconhecida";
const sslmode = parsed.searchParams.get("sslmode") ?? "ausente";
console.log(
  `migracao: host=${hostKind} porta=${parsed.port || "5432"} usuario=${userKind} regiao=${region} sslmode=${sslmode} senha=${parsed.password ? "presente" : "ausente"} ajustada=${normalized !== raw.trim()}`,
);

const sql = postgres(normalized, { max: 1, prepare: false, connect_timeout: 20 });
try {
  await sql`select 1 as ok`;
  console.log("conexao de migracao ok");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "falha";
  console.log(redact(`conexao de migracao falhou ${code} ${message}`));
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

function redact(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redigido]")
    .replace(/password[=:]\s*\S+/gi, "password=[redigido]");
}
