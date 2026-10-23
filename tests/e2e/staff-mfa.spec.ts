import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { generateSync } from "otplib";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const password = "correta-senha-12";

test.describe("MFA da equipe no Supabase local", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];

  test.afterAll(async () => {
    await Promise.all(created.map((id) => removeStaff(id)));
  });

  test("recarregar a configuração não cria fator e o código confirma o acesso", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = `mfa-novo-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "SUPER_ADMIN");
    created.push(userId);

    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/configurar$/);
    await page.reload();
    await page.reload();
    await expect(page.getByRole("button", { name: "Gerar código" })).toBeVisible();
    expect(await factorCount(userId)).toBe(0);

    await page.getByRole("button", { name: "Gerar código" }).click();
    const secret = await page.getByTestId("totp-secret").getAttribute("data-secret");
    expect(secret).toBeTruthy();
    await page.getByLabel("Código").fill(totpCode(secret ?? ""));
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("quem já tem TOTP só entra com o código válido", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `mfa-ativo-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "SUPER_ADMIN");
    created.push(userId);
    const secret = await enrollVerifiedTotp(email);

    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    const current = totpCode(secret);
    const wrong = current === "000000" ? "111111" : "000000";
    await page.getByLabel("Código").fill(wrong);
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("Código inválido.")).toBeVisible();
    expect(await failureCount(userId)).toBeGreaterThan(0);

    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});

function totpCode(secret: string): string {
  const code = generateSync({ secret });
  return typeof code === "string" ? code : String(code);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/equipe/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

function localEnv(): void {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
}

async function createStaff(email: string, role: "SUPER_ADMIN"): Promise<string> {
  if (role !== "SUPER_ADMIN") throw new Error("Papel de teste inesperado.");
  localEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!url || !service || !databaseUrl) throw new Error("Ambiente local ausente.");
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!response.ok)
    throw new Error(`Falha ao criar usuário de teste: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string"
  ) {
    throw new Error("Resposta do Auth sem identificador.");
  }
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5 });
  try {
    await sql`
      insert into identity.users (id, kind, email, display_name)
      values (${body.id}::uuid, 'STAFF', ${email}, 'Equipe')
    `;
    await sql`
      insert into identity.user_roles (user_id, role)
      values (${body.id}::uuid, 'SUPER_ADMIN')
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
  return body.id;
}

async function enrollVerifiedTotp(email: string): Promise<string> {
  localEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Auth local ausente.");
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error("Não foi possível entrar para cadastrar o TOTP.");
  const enrolled = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Teste",
  });
  const secret = enrolled.data?.totp?.secret;
  const factorId = enrolled.data?.id;
  if (enrolled.error || !secret || !factorId)
    throw new Error("Não foi possível cadastrar o TOTP.");
  const code = totpCode(secret);
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data)
    throw new Error("Não foi possível desafiar o TOTP.");
  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) throw new Error("Não foi possível confirmar o TOTP.");
  await client.auth.signOut();
  return secret;
}

async function factorCount(userId: string): Promise<number> {
  const sql = ownerSql();
  try {
    const rows = await sql<{ total: number }[]>`
      select count(*)::int as total from auth.mfa_factors where user_id = ${userId}::uuid
    `;
    return rows[0]?.total ?? 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function failureCount(userId: string): Promise<number> {
  const sql = ownerSql();
  try {
    const rows = await sql<{ total: number }[]>`
      select count(*)::int as total from audit.audit_log
      where action = 'auth.mfa.failure' and actor_user_id = ${userId}::uuid
    `;
    return rows[0]?.total ?? 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function ownerSql(): ReturnType<typeof postgres> {
  localEnv();
  const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
  if (!migrationsUrl) throw new Error("MIGRATIONS_DATABASE_URL ausente.");
  return postgres(migrationsUrl, { max: 1, prepare: false, connect_timeout: 5 });
}

async function removeStaff(userId: string): Promise<void> {
  localEnv();
  const sql = ownerSql();
  try {
    await sql`delete from identity.user_roles where user_id = ${userId}::uuid`;
    await sql`delete from identity.users where id = ${userId}::uuid`;
  } finally {
    await sql.end({ timeout: 5 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return;
  await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: service, authorization: `Bearer ${service}` },
  });
}
