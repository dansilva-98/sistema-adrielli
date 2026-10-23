import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { generateSync } from "otplib";
import type { Page } from "@playwright/test";
import postgres from "postgres";

import type { StaffRole } from "../../src/modules/identity/access";

export const staffPassword = "correta-senha-12";

export function totpCode(secret: string): string {
  const code = generateSync({ secret });
  return typeof code === "string" ? code : String(code);
}

export function loadLocalEnv(): void {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/equipe/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(staffPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function createStaff(email: string, role: StaffRole): Promise<string> {
  loadLocalEnv();
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
    body: JSON.stringify({ email, password: staffPassword, email_confirm: true }),
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
      values (${body.id}::uuid, ${role}::identity.staff_role)
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
  return body.id;
}

export async function enrollVerifiedTotp(email: string): Promise<string> {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Auth local ausente.");
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({
    email,
    password: staffPassword,
  });
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

export function ownerSql(): ReturnType<typeof postgres> {
  loadLocalEnv();
  const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
  if (!migrationsUrl) throw new Error("MIGRATIONS_DATABASE_URL ausente.");
  return postgres(migrationsUrl, { max: 1, prepare: false, connect_timeout: 5 });
}

export async function factorCount(userId: string): Promise<number> {
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

export async function failureCount(userId: string): Promise<number> {
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

export async function disableStaff(userId: string): Promise<void> {
  const sql = ownerSql();
  try {
    await sql`update identity.users set disabled_at = now() where id = ${userId}::uuid`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function expiredAuditCount(userId: string): Promise<number> {
  const sql = ownerSql();
  try {
    const rows = await sql<{ total: number }[]>`
      select count(*)::int as total from audit.audit_log
      where action = 'auth.session.expired' and actor_user_id = ${userId}::uuid
    `;
    return rows[0]?.total ?? 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function staffIdByEmail(email: string): Promise<string | null> {
  const sql = ownerSql();
  try {
    const rows = await sql<{ id: string }[]>`
      select id from identity.users where email = ${email}
    `;
    return rows[0]?.id ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function removeStaff(userId: string): Promise<void> {
  loadLocalEnv();
  const sql = ownerSql();
  try {
    await sql`
      update identity.user_roles set granted_by = null where granted_by = ${userId}::uuid
    `;
    await sql`
      update content.site_settings set updated_by = null where updated_by = ${userId}::uuid
    `;
    await sql`
      update content.services set updated_by = null where updated_by = ${userId}::uuid
    `;
    await sql`
      update content.testimonials set updated_by = null where updated_by = ${userId}::uuid
    `;
    await sql`
      update content.faq set updated_by = null where updated_by = ${userId}::uuid
    `;
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
