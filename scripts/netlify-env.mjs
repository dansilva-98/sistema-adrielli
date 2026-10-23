import { assertExactSiteName } from "./netlify-site-policy.mjs";

const token = required("NETLIFY_AUTH_TOKEN");
const siteId = required("NETLIFY_SITE_ID");
const contexts = parseContexts(required("NETLIFY_ENV_CONTEXTS"));
const accountSlug = await accountSlugForSite();

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
  const base = `https://api.netlify.com/api/v1/accounts/${accountSlug}/env`;
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

async function upsert(key, value) {
  const current = await fetch(envUrl(key), { headers: authHeaders() });
  if (current.status === 404) {
    await createVar(key, value);
    return;
  }
  if (!current.ok) throw new Error(`falha ${key} HTTP ${current.status}`);
  const body = await current.json();
  const values = Array.isArray(body.values) ? body.values : [];
  for (const context of contexts) {
    const replaced = await writeContext(key, value, context, values);
    if (replaced) return;
  }
  for (const item of values) {
    if (item.context === "all" && item.id) await deleteValue(key, item.id);
  }
}

async function createVar(key, value) {
  const response = await fetch(envUrl(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify([
      {
        key,
        values: contexts.map((context) => ({ context, value })),
      },
    ]),
  });
  if (!response.ok)
    throw new Error(`falha ${key} HTTP ${response.status} ${await response.text()}`);
}

async function writeContext(key, value, context, values) {
  const found = values.find((item) => item.context === context && item.id);
  if (found) {
    const response = await fetch(envUrl(key, `/value/${found.id}`), {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ context, value }),
    });
    if (!response.ok) {
      throw new Error(`falha ${key} HTTP ${response.status} ${await response.text()}`);
    }
    return false;
  }
  const response = await fetch(envUrl(key, "/value"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ context, value }),
  });
  if (response.ok) return false;
  if (response.status === 404 || response.status === 405) {
    await replaceWhenSafe(key, value, values);
    return true;
  }
  throw new Error(`falha ${key} HTTP ${response.status} ${await response.text()}`);
}

async function replaceWhenSafe(key, value, values) {
  const foreign = values.filter(
    (item) => item.context !== "all" && !contexts.includes(item.context),
  );
  if (foreign.length > 0) {
    throw new Error(`falha ${key}: há outro contexto e ele não foi alterado`);
  }
  const response = await fetch(envUrl(key), {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({
      key,
      values: contexts.map((context) => ({ context, value })),
    }),
  });
  if (!response.ok)
    throw new Error(`falha ${key} HTTP ${response.status} ${await response.text()}`);
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
