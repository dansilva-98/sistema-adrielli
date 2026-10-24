import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createClient } from "@supabase/supabase-js";
import { generateSync } from "otplib";
import postgres from "postgres";

import { chooseDraft, evidenceText, summarize } from "./measure-staging-math.mjs";

const { chromium } = createRequire(import.meta.resolve("@playwright/test"))("playwright");

const tokenNames = [
  "NETLIFY_AUTH_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "MIGRATIONS_DATABASE_URL",
  "STAFF_SESSION_SECRET",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

function redact(text) {
  let output = text;
  for (const name of tokenNames) {
    const value = process.env[name];
    if (value) output = output.replaceAll(value, "[redigido]");
  }
  return output
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redigido]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redigido]");
}

function totpCode(secret) {
  const code = generateSync({ secret });
  return typeof code === "string" ? code : String(code);
}

function newPassword() {
  return `Aa1${randomBytes(18).toString("base64url")}`;
}

async function latestDeploys(siteId, token) {
  const response = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys?per_page=20`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`falha ao listar deploys HTTP ${response.status}`);
  return response.json();
}

async function createAuthUser(url, service, email, password) {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`falha ao criar usuário HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body?.id !== "string") throw new Error("Auth não devolveu o identificador.");
  return body.id;
}

async function insertStaff(databaseUrl, userId, email) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    await sql`
      insert into identity.users (id, kind, email, display_name)
      values (${userId}::uuid, 'STAFF', ${email}, 'Medicao')
    `;
    await sql`
      insert into identity.user_roles (user_id, role)
      values (${userId}::uuid, 'SUPER_ADMIN'::identity.staff_role)
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function enrollTotp(url, anon, email, password) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error("Não foi possível entrar para cadastrar o TOTP.");
  const enrolled = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Medicao",
  });
  const secret = enrolled.data?.totp?.secret;
  const factorId = enrolled.data?.id;
  if (enrolled.error || !secret || !factorId) {
    throw new Error("Não foi possível cadastrar o TOTP.");
  }
  const code = totpCode(secret);
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    throw new Error("Não foi possível desafiar o TOTP.");
  }
  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) throw new Error("Não foi possível confirmar o TOTP.");
  await client.auth.signOut();
  return secret;
}

async function login(origin, email, password, secret) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/equipe/entrar`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/equipe\/mfa\/verificar/, { timeout: 30_000 });
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await page.waitForURL(/\/admin\/?$/, { timeout: 30_000 });
    return await context.cookies();
  } finally {
    await browser.close();
  }
}

async function measure(origin, cookies) {
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const samples = [];
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now();
    const response = await fetch(`${origin}/admin?medicao=${index}`, {
      headers: { cookie, "cache-control": "no-cache" },
      redirect: "manual",
    });
    const elapsed = performance.now() - started;
    await response.body?.cancel();
    samples.push({ ms: elapsed, status: response.status });
  }
  return samples;
}

async function removeUser(userId) {
  const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  let database = false;
  let auth = false;
  if (migrationsUrl) {
    const sql = postgres(migrationsUrl, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await sql`
        update identity.user_roles set granted_by = null where granted_by = ${userId}::uuid
      `;
      await sql`delete from identity.user_roles where user_id = ${userId}::uuid`;
      await sql`delete from identity.users where id = ${userId}::uuid`;
      database = true;
    } catch (error) {
      console.log(
        redact(error instanceof Error ? error.message : "falha ao apagar no banco"),
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  if (url && service) {
    const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: service, authorization: `Bearer ${service}` },
    });
    auth = response.ok || response.status === 404;
  }
  return database && auth;
}

function publish(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  }
}

async function main() {
  const siteId = required("NETLIFY_SITE_ID");
  const netlifyToken = required("NETLIFY_AUTH_TOKEN");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const service = required("SUPABASE_SERVICE_ROLE_KEY");
  const anon = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const databaseUrl = required("DATABASE_URL");
  required("MIGRATIONS_DATABASE_URL");

  const draft = chooseDraft(await latestDeploys(siteId, netlifyToken));
  const email = `medir-${randomUUID()}@example.com`;
  const password = newPassword();
  const hidden = [email, password];
  const hide = (text) =>
    hidden.reduce((output, value) => output.replaceAll(value, "[redigido]"), text);
  let userId = null;
  let removed = false;
  let report = null;
  let failed = null;
  try {
    userId = await createAuthUser(supabaseUrl, service, email, password);
    await insertStaff(databaseUrl, userId, email);
    const secret = await enrollTotp(supabaseUrl, anon, email, password);
    hidden.push(secret);
    const cookies = await login(draft.url, email, password, secret);
    const samples = await measure(draft.url, cookies);
    const result = summarize(samples);
    if (result.statuses.some((status) => status !== 200)) {
      throw new Error(`/admin autenticado respondeu ${result.statuses.join(", ")}`);
    }
    report = { draft, result, count: samples.length };
  } catch (error) {
    failed = error;
  } finally {
    if (userId) {
      try {
        removed = await removeUser(userId);
      } catch (error) {
        removed = false;
        console.log(
          hide(redact(error instanceof Error ? error.message : "falha ao remover")),
        );
      }
    }
  }
  if (report) {
    publish(
      evidenceText({
        url: report.draft.url,
        context: report.draft.context,
        count: report.count,
        statuses: report.result.statuses,
        median: report.result.median,
        worst: report.result.worst,
        removed,
      }),
    );
  } else {
    publish(`Usuário de teste removido: ${removed ? "sim" : "não"}`);
  }
  if (failed)
    console.log(hide(redact(failed instanceof Error ? failed.message : "falha")));
  if (failed || (userId && !removed)) process.exit(1);
}

if (process.argv[1]?.endsWith("measure-staging.mjs")) {
  main().catch((error) => {
    console.log(redact(error instanceof Error ? error.message : "falha"));
    process.exit(1);
  });
}
