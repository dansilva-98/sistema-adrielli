import { assertExactSiteName } from "./netlify-site-policy.mjs";

const token = required("NETLIFY_AUTH_TOKEN");
const siteId = required("NETLIFY_SITE_ID");
const contexts = parseContexts(required("NETLIFY_ENV_CONTEXTS"));
const accountSlug = await accountSlugForSite();
const accountId = await accountIdFor(accountSlug);

const keys = [
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SENTRY_DSN",
  "APP_ENV",
  "STAFF_SESSION_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SITE_URL",
];

let failed = false;
for (const key of keys) {
  if (key.includes("MIGRATIONS")) {
    console.log(`recusado ${key}`);
    failed = true;
    continue;
  }
  const value = process.env[key]?.trim() ?? "";
  if (!value) {
    console.log(`ausente ${key}`);
    failed = true;
    continue;
  }
  try {
    await upsert(key, value);
    console.log(`ok ${key}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha";
    console.log(redact(message));
    failed = true;
  }
}

try {
  await deleteMigrationsUrl();
  console.log("ok MIGRATIONS_DATABASE_URL ausente no site");
} catch (error) {
  const message = error instanceof Error ? error.message : "falha";
  console.log(redact(message));
  failed = true;
}

if (failed) process.exit(1);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

function parseContexts(value) {
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set(["production", "deploy-preview", "branch-deploy"]);
  if (parsed.length === 0 || parsed.some((item) => !allowed.has(item))) {
    throw new Error(
      "NETLIFY_ENV_CONTEXTS só aceita production, deploy-preview ou branch-deploy.",
    );
  }
  return parsed;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function envUrl(key, suffix = "") {
  const query = `site_id=${encodeURIComponent(siteId)}`;
  const base = `https://api.netlify.com/api/v1/accounts/${accountId}/env`;
  const path = key ? `${base}/${encodeURIComponent(key)}${suffix}` : base;
  return `${path}?${query}`;
}

async function accountSlugForSite() {
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(`Não foi possível ler o site: HTTP ${response.status}`);
  const body = await response.json();
  assertExactSiteName(body.name);
  if (!body.account_slug) throw new Error("O site não informou a conta.");
  return body.account_slug;
}

async function accountIdFor(slug) {
  const response = await fetch(
    `https://api.netlify.com/api/v1/accounts/${encodeURIComponent(slug)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error(`Não foi possível ler a conta: HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error("A conta não informou o id.");
  }
  return body.id;
}

async function siteEnvVars() {
  const response = await fetch(envUrl(), { headers: authHeaders() });
  if (!response.ok) throw new Error(`falha ao listar HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error("A lista de variáveis não veio em lista.");
  return body;
}

async function upsert(key, value) {
  const listed = await siteEnvVars();
  const current = listed.find((item) => item?.key === key);
  if (!current) {
    await createVar(key, value);
    return;
  }
  for (const context of contexts) {
    await writeContext(key, value, context);
  }
  const values = Array.isArray(current.values) ? current.values : [];
  for (const item of values) {
    if (item.context === "all" && item.id) await deleteValue(key, item.id);
  }
}

async function createVar(key, value) {
  const payload = {
    key,
    values: contexts.map((context) => ({ context, value })),
  };
  const created = await postEnv(payload);
  if (created.ok) return;
  if (created.status !== 400 && created.status !== 422) {
    throw new Error(`falha ${key} ao criar HTTP ${created.status}`);
  }
  const asList = await postEnv([payload]);
  if (!asList.ok) throw new Error(`falha ${key} ao criar HTTP ${asList.status}`);
}

async function postEnv(payload) {
  return fetch(envUrl(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

async function writeContext(key, value, context) {
  const response = await fetch(envUrl(key), {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ context, value }),
  });
  await response.body?.cancel();
  if (!response.ok) {
    throw new Error(`falha ${key} ao atualizar HTTP ${response.status}`);
  }
}

async function deleteValue(key, id) {
  const response = await fetch(envUrl(key, `/value/${id}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`falha ao remover contexto all de ${key}: HTTP ${response.status}`);
  }
}

async function deleteMigrationsUrl() {
  const response = await fetch(envUrl("MIGRATIONS_DATABASE_URL"), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`falha MIGRATIONS_DATABASE_URL HTTP ${response.status}`);
  }
}

function redact(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redigido]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]")
    .replaceAll(token, "[token]");
}
