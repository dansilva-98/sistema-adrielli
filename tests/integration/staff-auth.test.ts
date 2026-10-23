import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { beginStaffLogin, type StaffProfile } from "@/modules/identity/login";
import {
  LOGIN_EMAIL_LIMIT,
  LOGIN_ERROR_MESSAGE,
  LOGIN_IP_LIMIT,
  loginAttemptKey,
  readStaffSession,
  signStaffSession,
} from "@/modules/identity/staff-session";
import {
  endRejectedAuthSession,
  signInWithSupabase,
} from "@/modules/identity/supabase-sign-in";
import { TEST_DATABASE_NAME } from "../../src/db/seed";

const password = "correta-senha-12";

describe("login real no Supabase local", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let loginIsLimited: (keys: {
    emailKey: string;
    ipKey: string | null;
  }) => Promise<boolean>;
  let recordLoginAttempt: (keys: {
    emailKey: string;
    ipKey: string | null;
  }) => Promise<void>;
  let writeStaffAudit: typeof import("@/modules/identity/server/directory").writeStaffAudit;
  const secret = () => {
    const value = process.env.STAFF_SESSION_SECRET;
    if (!value) throw new Error("STAFF_SESSION_SECRET ausente.");
    return value;
  };
  const createdAuthIds: string[] = [];

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    process.env.DATABASE_URL = testUrl;
    const attempts = await import("@/modules/identity/server/login-attempts");
    loginIsLimited = attempts.loginIsLimited;
    recordLoginAttempt = attempts.recordLoginAttempt;
    writeStaffAudit = (await import("@/modules/identity/server/directory"))
      .writeStaffAudit;
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
  });

  afterAll(async () => {
    await deleteAuthUsers(createdAuthIds);
    await runtime?.end({ timeout: 5 });
    await owner?.end({ timeout: 5 });
  });

  it("recusa a sexta falha do mesmo e-mail sem chamar o Supabase", async () => {
    const email = `limite-${crypto.randomUUID()}@example.com`;
    const emailKey = loginAttemptKey(email, secret());
    for (let attempt = 0; attempt < LOGIN_EMAIL_LIMIT; attempt += 1) {
      await recordLoginAttempt({ emailKey, ipKey: null });
    }
    let calledSupabase = false;
    const decision = await beginStaffLogin({
      email,
      password: "errada",
      ip: null,
      secret: secret(),
      now: Date.now(),
      isLimited: loginIsLimited,
      recordFailure: recordLoginAttempt,
      signIn: async () => {
        calledSupabase = true;
        return null;
      },
      loadProfile: async () => null,
      findActorByEmail: async () => null,
    });

    expect(calledSupabase).toBe(false);
    expect(decision).toMatchObject({ ok: false, message: LOGIN_ERROR_MESSAGE });
    const columns = await runtime<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'identity' and table_name = 'login_attempts'
    `;
    expect(columns.map((column) => column.column_name)).not.toContain("email");
    const stored = await runtime<{ key_hash: string }[]>`
      select key_hash from identity.login_attempts where key_hash = ${emailKey}
    `;
    expect(stored.length).toBeGreaterThanOrEqual(LOGIN_EMAIL_LIMIT);
    expect(stored.every((row) => !row.key_hash.includes("@"))).toBe(true);
    expect(stored.every((row) => !row.key_hash.includes(email))).toBe(true);
  });

  it("recusa a 21ª falha do mesmo IP sem chamar o Supabase", async () => {
    const ip = "203.0.113.44";
    const ipKey = loginAttemptKey(ip, secret());
    for (let attempt = 0; attempt < LOGIN_IP_LIMIT; attempt += 1) {
      const emailKey = loginAttemptKey(
        `ip-${attempt}-${crypto.randomUUID()}@example.com`,
        secret(),
      );
      await recordLoginAttempt({ emailKey, ipKey });
    }
    let calledSupabase = false;
    const decision = await beginStaffLogin({
      email: `novo-ip-${crypto.randomUUID()}@example.com`,
      password: "errada",
      ip,
      secret: secret(),
      now: Date.now(),
      isLimited: loginIsLimited,
      recordFailure: recordLoginAttempt,
      signIn: async () => {
        calledSupabase = true;
        return null;
      },
      loadProfile: async () => null,
      findActorByEmail: async () => null,
    });

    expect(calledSupabase).toBe(false);
    expect(decision).toMatchObject({ ok: false, message: LOGIN_ERROR_MESSAGE });
    const stored = await runtime<{ total: number }[]>`
      select count(*)::int as total from identity.login_attempts
      where key_hash = ${ipKey} and kind = 'IP'
    `;
    expect(Number(stored[0]?.total ?? 0)).toBeGreaterThanOrEqual(LOGIN_IP_LIMIT);
    expect(ipKey.includes(ip)).toBe(false);
  });

  it("grava o sucesso de um CONTENT_ADMIN e o cookie com o userId", async () => {
    const email = `conteudo-${crypto.randomUUID()}@example.com`;
    const userId = await createAuthUser(email, password);
    createdAuthIds.push(userId);
    await owner`insert into auth.users (id) values (${userId}::uuid)`;
    await runtime`
      insert into identity.users (id, kind, email, display_name)
      values (${userId}::uuid, 'STAFF', ${email}, 'Conteúdo')
    `;
    await runtime`
      insert into identity.user_roles (user_id, role)
      values (${userId}::uuid, 'CONTENT_ADMIN')
    `;
    const client = authClient();
    const decision = await beginStaffLogin({
      email,
      password,
      ip: "127.0.0.1",
      secret: secret(),
      now: Date.now(),
      isLimited: async () => false,
      recordFailure: async () => undefined,
      signIn: (value, givenPassword) => signInWithSupabase(client, value, givenPassword),
      loadProfile: (id) => loadProfile(runtime, id),
      findActorByEmail: async () => null,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.redirectTo).toBe("/admin");
    expect(decision.session.userId).toBe(userId);
    expect(decision.session.sessionId.length).toBeGreaterThan(0);
    const token = signStaffSession(decision.session, secret());
    expect(readStaffSession(token, secret())).toMatchObject({
      userId,
      sessionId: decision.session.sessionId,
    });
    await writeStaffAudit({
      action: "auth.login.success",
      actorUserId: userId,
      entityType: "user",
      entityId: userId,
      metadata: {},
    });
    const audit = await runtime<{ metadata: unknown }[]>`
      select metadata from audit.audit_log
      where action = 'auth.login.success' and actor_user_id = ${userId}::uuid
    `;
    const metadata = audit[0]?.metadata;
    const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    expect(parsed).toEqual({});
    expect(JSON.stringify(parsed)).not.toContain(email);
  });

  it("responde igual para senha errada e e-mail inexistente, sem e-mail na auditoria", async () => {
    const email = `existente-${crypto.randomUUID()}@example.com`;
    const userId = await createAuthUser(email, password);
    createdAuthIds.push(userId);
    const wrong = await beginStaffLogin({
      email,
      password: "senha-errada-12",
      ip: null,
      secret: secret(),
      now: Date.now(),
      isLimited: async () => false,
      recordFailure: async () => undefined,
      signIn: (value, givenPassword) =>
        signInWithSupabase(authClient(), value, givenPassword),
      loadProfile: async () => null,
      findActorByEmail: async () => userId,
    });
    const missing = await beginStaffLogin({
      email: `ausente-${crypto.randomUUID()}@example.com`,
      password: "senha-errada-12",
      ip: null,
      secret: secret(),
      now: Date.now(),
      isLimited: async () => false,
      recordFailure: async () => undefined,
      signIn: (value, givenPassword) =>
        signInWithSupabase(authClient(), value, givenPassword),
      loadProfile: async () => null,
      findActorByEmail: async () => null,
    });

    expect(wrong).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      actorUserId: userId,
    });
    expect(missing).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      actorUserId: null,
    });
    expect(wrong.ok || missing.ok).toBe(false);
    if (!wrong.ok) expect(wrong.message).toBe(missing.ok ? "" : missing.message);
    await writeStaffAudit({
      action: "auth.login.failure",
      actorUserId: userId,
      metadata: {},
    });
    const audit = await runtime<{ metadata: unknown }[]>`
      select metadata from audit.audit_log
      where action = 'auth.login.failure' and actor_user_id = ${userId}::uuid
    `;
    const metadata = audit[0]?.metadata;
    const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    expect(JSON.stringify(parsed)).not.toContain(email);
  });

  it("recusa cliente e conta desativada e encerra a sessão do Supabase", async () => {
    const customerEmail = `cliente-${crypto.randomUUID()}@example.com`;
    const disabledEmail = `inativa-${crypto.randomUUID()}@example.com`;
    const customerId = await createAuthUser(customerEmail, password);
    const disabledId = await createAuthUser(disabledEmail, password);
    createdAuthIds.push(customerId, disabledId);
    await owner`insert into auth.users (id) values (${customerId}::uuid), (${disabledId}::uuid)`;
    await runtime`
      insert into identity.users (id, kind, email, display_name)
      values (${customerId}::uuid, 'CUSTOMER', ${customerEmail}, 'Cliente')
    `;
    await runtime`
      insert into identity.users (id, kind, email, display_name, disabled_at)
      values (${disabledId}::uuid, 'STAFF', ${disabledEmail}, 'Inativa', now())
    `;

    const customerClient = authClient();
    const customer = await beginStaffLogin({
      email: customerEmail,
      password,
      ip: null,
      secret: secret(),
      now: Date.now(),
      isLimited: async () => false,
      recordFailure: async () => undefined,
      signIn: (value, givenPassword) =>
        signInWithSupabase(customerClient, value, givenPassword),
      loadProfile: (id) => loadProfile(runtime, id),
      findActorByEmail: async () => null,
    });
    await endRejectedAuthSession(customerClient, customer);
    const customerSession = await customerClient.auth.getUser();
    expect(customer).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      endAuthSession: true,
    });
    expect(customerSession.data.user).toBeNull();

    const disabledClient = authClient();
    const disabled = await beginStaffLogin({
      email: disabledEmail,
      password,
      ip: null,
      secret: secret(),
      now: Date.now(),
      isLimited: async () => false,
      recordFailure: async () => undefined,
      signIn: (value, givenPassword) =>
        signInWithSupabase(disabledClient, value, givenPassword),
      loadProfile: (id) => loadProfile(runtime, id),
      findActorByEmail: async () => null,
    });
    await endRejectedAuthSession(disabledClient, disabled);
    const disabledSession = await disabledClient.auth.getUser();
    expect(disabled).toMatchObject({
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      endAuthSession: true,
    });
    expect(disabledSession.data.user).toBeNull();
  });
});

function authClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Auth local ausente.");
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAuthUser(email: string, userPassword: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("Auth local ausente.");
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: userPassword, email_confirm: true }),
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
  return body.id;
}

async function deleteAuthUsers(ids: string[]): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return;
  await Promise.all(
    ids.map((id) =>
      fetch(`${url}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: service, authorization: `Bearer ${service}` },
      }),
    ),
  );
}

async function loadProfile(
  runtime: ReturnType<typeof postgres>,
  userId: string,
): Promise<StaffProfile | null> {
  const people = await runtime<
    { id: string; kind: "STAFF" | "CUSTOMER"; disabled_at: Date | null }[]
  >`
    select id::text as id, kind::text as kind, disabled_at
    from identity.users where id = ${userId}::uuid
  `;
  const person = people[0];
  if (!person) return null;
  const roles = await runtime<{ role: StaffProfile["roles"][number] }[]>`
    select role::text as role from identity.user_roles where user_id = ${userId}::uuid
  `;
  return {
    id: person.id,
    kind: person.kind,
    disabledAt: person.disabled_at,
    roles: roles.map((role) => role.role),
  };
}
