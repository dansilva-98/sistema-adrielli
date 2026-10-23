const token = required("NETLIFY_AUTH_TOKEN");
const siteId = required("NETLIFY_SITE_ID");

const keys = [
  "DATABASE_URL",
  "MIGRATIONS_DATABASE_URL",
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
  const value = process.env[key]?.trim() ?? "";
  if (!value) {
    console.log(`ausente ${key}`);
    failed = true;
    continue;
  }
  const payload = {
    key,
    scopes: ["builds", "functions", "runtime"],
    values: [{ context: "all", value }],
  };
  const updated = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}/env/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const response = updated.status === 404 ? await createVar(payload) : updated;
  if (!response.ok) {
    console.log(`falha ${key} HTTP ${response.status} ${redact(await response.text())}`);
    failed = true;
    continue;
  }
  console.log(`ok ${key}`);
}

if (failed) process.exit(1);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function createVar(payload) {
  return fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify([payload]),
  });
}

function redact(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redigido]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]")
    .replaceAll(token, "[token]");
}
