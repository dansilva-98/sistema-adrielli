import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { generateSync } from "otplib";
import postgres from "postgres";

const draftUrl = required("DRAFT_URL").replace(/\/$/, "");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const ownerUrl = required("MIGRATIONS_DATABASE_URL");
const netlifyToken = required("NETLIFY_AUTH_TOKEN");
const siteId = required("NETLIFY_SITE_ID");

const staffEmail = "h1-rascunho@example.com";
const inviteEmail = "h1-convite@example.com";
const password = `${randomBytes(18).toString("base64url")}Aa1`;
const report = [];
const failures = [];

let owner;

try {
  owner = postgres(ownerUrl, { max: 1, prepare: false, connect_timeout: 15 });
  await removeTestUser(staffEmail);
  await removeTestUser(inviteEmail);
  await createStaff();
  const secret = await enrollTotp();
  await checkAnonymous();
  await checkHeaders();
  await checkImage();
  await checkIp();
  await checkHealth();
  await measure("/");
  await measure("/equipe/entrar");
  await withBrowser(secret);
  await checkCredits();
} catch (error) {
  note("erro", false, error instanceof Error ? redact(error.message) : "falha");
} finally {
  try {
    await removeTestUser(staffEmail);
    await removeTestUser(inviteEmail);
  } catch (error) {
    note("limpeza", false, error instanceof Error ? redact(error.message) : "falha");
  }
  await owner?.end({ timeout: 5 });
}

const evidence = ["# Evidência H1.1", "", ...report.map((line) => `- ${line}`), ""].join(
  "\n",
);
writeFileSync("h1-evidence.md", evidence);
console.log(evidence);
if (failures.length > 0) process.exit(1);

async function withBrowser(secret) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${draftUrl}/equipe/entrar`, { waitUntil: "networkidle" });
    await page.getByLabel("E-mail").fill(staffEmail);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/equipe\/mfa\/verificar/, { timeout: 30000 });
    await page.getByLabel("Código").fill(totp(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });
    note("V4 login com senha e TOTP", page.url().includes("/admin"), page.url());

    const before = cookieValue(await context.cookies());
    await page.goto(`${draftUrl}/admin`, { waitUntil: "networkidle" });
    const after = cookieValue(await context.cookies());
    note(
      "V4 sessão renovada pelo proxy",
      Boolean(before && after && before !== after),
      "cookie staff_session",
    );

    await measure("/admin", context.request);
    await page.goto(`${draftUrl}/equipe/sair`, { waitUntil: "networkidle" });
    const loggedOut = page.url().includes("/equipe/entrar");
    await page.goto(`${draftUrl}/admin`, { waitUntil: "networkidle" });
    note(
      "V4 sair encerra a sessão",
      loggedOut && page.url().includes("/equipe/entrar"),
      new URL(page.url()).pathname,
    );

    await signInAgain(page, secret);
    await checkAction(page);
    await checkInvite(page);
    await checkCache(page);
    await checkUpload(page);
  } finally {
    await browser.close();
  }
}

async function signInAgain(page, secret) {
  if (!page.url().includes("/equipe/entrar")) return;
  await page.getByLabel("E-mail").fill(staffEmail);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/equipe\/mfa\/verificar/, { timeout: 30000 });
  await page.getByLabel("Código").fill(totp(secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.waitForURL(/\/admin/, { timeout: 30000 });
}

async function checkAction(page) {
  const seen = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/h1/acao")) {
      seen.push({
        url: request.url(),
        headers: request.headers(),
        body: request.postDataBuffer(),
      });
    }
  });
  await page.goto(`${draftUrl}/h1/acao`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Executar ação" }).click();
  await page.getByTestId("h1-action-result").filter({ hasText: "Ação aceita." }).waitFor({
    timeout: 30000,
  });
  note("V5 ação de servidor", true, "Ação aceita.");
  const recorded = seen.at(-1);
  if (!recorded?.body) {
    note("V5 Origin diferente", false, "não capturei o POST da ação");
    return;
  }
  const headers = { ...recorded.headers, origin: "https://exemplo-invalido.test" };
  delete headers["content-length"];
  const forged = await fetch(recorded.url, {
    method: "POST",
    headers,
    body: recorded.body,
  });
  const snippet = redact(await forged.text()).slice(0, 180);
  note("V5 Origin diferente", forged.status >= 400, `HTTP ${forged.status} ${snippet}`);
}

async function checkInvite(page) {
  await page.goto(`${draftUrl}/admin/usuarios`, { waitUntil: "networkidle" });
  const form = page.locator("form").filter({ hasText: "Convidar" });
  await form.getByLabel("Nome").fill("Convite H1");
  await form.getByLabel("E-mail").fill(inviteEmail);
  await form.getByLabel("Conteúdo").check();
  await page.getByRole("button", { name: "Enviar convite" }).click();
  const status = page.getByRole("status").last();
  await status.waitFor({ timeout: 30000 }).catch(() => undefined);
  const message = (await status.textContent())?.trim() || "sem mensagem";
  note("V5 convite", !/não foi possível|erro|falha/i.test(message), message);
}

async function checkCache(page) {
  await page.goto(`${draftUrl}/h1/cache`, { waitUntil: "networkidle" });
  const before = (await page.getByTestId("h1-stamp").textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "Atualizar" }).click();
  await page.waitForLoadState("networkidle");
  await page.goto(`${draftUrl}/h1/cache`, { waitUntil: "networkidle" });
  const after = (await page.getByTestId("h1-stamp").textContent())?.trim() ?? "";
  note("V7 cache", Boolean(before && after && before !== after), `${before} -> ${after}`);
}

async function checkUpload(page) {
  const accepted = await sendFile(page, 4 * 1024 * 1024);
  note("V9 4 MB", accepted.includes("Recebido 4194304"), accepted);
  const rejected = await sendFile(page, 7 * 1024 * 1024);
  note("V9 7 MB", !rejected.includes("Recebido 7340032"), rejected);
}

async function sendFile(page, size) {
  try {
    await page.goto(`${draftUrl}/h1/corpo`, { waitUntil: "networkidle" });
    await page.setInputFiles("#h1-file", {
      name: "amostra.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(size, 1),
    });
    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST",
      { timeout: 60000 },
    );
    await page.getByRole("button", { name: "Enviar" }).click();
    const response = await responsePromise;
    const text =
      (await page
        .getByTestId("h1-upload-result")
        .textContent({ timeout: 15000 })
        .catch(() => "")) ?? "";
    return text.trim() || `HTTP ${response.status()}`;
  } catch (error) {
    return error instanceof Error ? redact(error.message) : "falha";
  }
}

async function checkAnonymous() {
  const chain = [];
  let current = `${draftUrl}/admin`;
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await fetch(current, { redirect: "manual" });
    chain.push(`${response.status} ${new URL(current).pathname}`);
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) break;
    current = new URL(location, current).toString();
  }
  note(
    "V2 anônimo em /admin",
    chain.some((item) => item.includes("/equipe/entrar")),
    chain.join(" -> "),
  );
  const denied = await fetch(`${draftUrl}/acesso-negado`);
  note("V2 /acesso-negado", denied.status === 403, `HTTP ${denied.status}`);
}

async function checkHeaders() {
  const paths = ["/", "/h1/ip", "/h1-estatico.txt"];
  const expected = [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
  ];
  for (const path of paths) {
    const response = await fetch(`${draftUrl}${path}`);
    const missing = expected.filter((name) => !response.headers.get(name));
    note(
      `V3 ${path}`,
      missing.length === 0 && response.status < 400,
      missing.join(", ") || `HTTP ${response.status}`,
    );
  }
}

async function checkImage() {
  const response = await fetch(`${draftUrl}/h1/imagem`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const webp =
    bytes.byteLength > 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
  note(
    "V8 sharp",
    response.headers.get("content-type") === "image/webp" && webp,
    response.headers.get("content-type") ?? "",
  );
}

async function checkIp() {
  const response = await fetch(`${draftUrl}/h1/ip`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
  const body = await response.json();
  const headers = body.headers ?? {};
  const forwarded = String(headers["x-forwarded-for"] ?? "");
  const netlifyIp = String(headers["x-nf-client-connection-ip"] ?? "");
  const forged = forwarded.split(",")[0]?.trim() === "203.0.113.9";
  note("V6 cabeçalhos", response.ok, JSON.stringify(headers));
  note(
    "V6 X-Forwarded-For forjado",
    true,
    forged
      ? `o primeiro valor chegou como 203.0.113.9; IP da Netlify=${netlifyIp || "ausente"}. A H1.2 precisa trocar a leitura do IP.`
      : `o valor forjado não foi o primeiro; IP da Netlify=${netlifyIp || "ausente"}.`,
  );
}

async function checkHealth() {
  const response = await fetch(`${draftUrl}/api/health`);
  const text = await response.text();
  note(
    "V12 /api/health",
    response.status === 200 || response.status === 503,
    `HTTP ${response.status} ${text.slice(0, 80)}`,
  );
}

async function measure(path, request) {
  const times = [];
  let status = 0;
  for (let index = 0; index < 20; index += 1) {
    const start = performance.now();
    if (request) {
      const response = await request.get(`${draftUrl}${path}`);
      status = response.status();
      await response.body();
    } else {
      const response = await fetch(`${draftUrl}${path}`);
      status = response.status;
      await response.arrayBuffer();
    }
    times.push(performance.now() - start);
  }
  times.sort((left, right) => left - right);
  const median = Math.round((times[9] + times[10]) / 2);
  const worst = Math.round(times[19] ?? 0);
  note(
    `V10 ${path}`,
    status < 400,
    `HTTP ${status}; mediana ${median} ms; pior ${worst} ms`,
  );
}

async function checkCredits() {
  const site = await netlify(`/sites/${siteId}`);
  const account = await netlify("/accounts/dansilva-98");
  const region = [
    site.json?.functions_region,
    site.json?.processing_settings?.region,
    site.json?.default_domain,
  ]
    .filter((value) => typeof value === "string")
    .join(" ");
  note(
    "V10 região da função",
    Boolean(region),
    region || `chaves: ${Object.keys(site.json ?? {}).join(", ")}`,
  );
  note("V10 região do Supabase", true, supabaseRegion());
  const billing = await netlify("/accounts/dansilva-98/billing");
  const credits = pickCredits(account.json, billing.json);
  const estimate =
    "estimativa do plano: 8 publicações em produção x 15 créditos = 120, mais 3 créditos por 10 mil requisições e 10 por GB; rascunho não gasta crédito de publicação";
  note(
    "V11 créditos",
    credits.length > 0,
    `${credits.join("; ") || `HTTP conta ${account.status}, cobrança ${billing.status}`}. ${estimate}`,
  );
}

async function netlify(path) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${netlifyToken}` },
  });
  const json = response.ok ? await response.json() : {};
  return { status: response.status, json };
}

function pickCredits(...bodies) {
  const lines = [];
  for (const body of bodies) {
    if (!body || typeof body !== "object") continue;
    for (const [key, value] of Object.entries(body)) {
      if (!/credit|usage|bandwidth|request/i.test(key)) continue;
      if (typeof value === "number" || typeof value === "string")
        lines.push(`${key}=${value}`);
    }
  }
  return lines;
}

function supabaseRegion() {
  const host = new URL(ownerUrl).hostname;
  const match = host.match(/[a-z]{2}-[a-z]+-\d/);
  return match?.[0] ?? "não identificada no host da conexão de migrations";
}

async function createStaff() {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: staffEmail, password, email_confirm: true }),
  });
  if (!response.ok)
    throw new Error(`Falha ao criar usuário de teste: HTTP ${response.status}`);
  const body = await response.json();
  await owner`
    insert into identity.users (id, kind, email, display_name)
    values (${body.id}::uuid, 'STAFF', ${staffEmail}, 'H1')
  `;
  await owner`
    insert into identity.user_roles (user_id, role)
    values (${body.id}::uuid, 'SUPER_ADMIN'::identity.staff_role)
  `;
  return body.id;
}

async function enrollTotp() {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email: staffEmail, password });
  if (signed.error) throw new Error("Não foi possível entrar para cadastrar o TOTP.");
  const enrolled = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "H1",
  });
  const secret = enrolled.data?.totp?.secret;
  const factorId = enrolled.data?.id;
  if (enrolled.error || !secret || !factorId)
    throw new Error("Não foi possível cadastrar o TOTP.");
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data)
    throw new Error("Não foi possível desafiar o TOTP.");
  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: totp(secret),
  });
  if (verified.error) throw new Error("Não foi possível confirmar o TOTP.");
  await client.auth.signOut();
  return secret;
}

async function removeTestUser(email) {
  if (!owner) return;
  const rows = await owner`
    select id from auth.users where email = ${email}
  `;
  for (const row of rows) {
    await owner`delete from identity.user_roles where user_id = ${row.id}::uuid`;
    await owner`delete from identity.users where id = ${row.id}::uuid`;
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${row.id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
  }
}

function totp(secret) {
  const code = generateSync({ secret });
  return typeof code === "string" ? code : String(code);
}

function cookieValue(cookies) {
  return cookies.find((cookie) => cookie.name === "staff_session")?.value ?? "";
}

function note(label, ok, detail) {
  report.push(`${ok ? "ok" : "falha"} ${label}: ${detail}`);
  if (!ok) failures.push(label);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

function redact(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redigido]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]")
    .replaceAll(password, "[senha]")
    .replaceAll(netlifyToken, "[token]");
}
