import "server-only";

import { eq } from "drizzle-orm";
import postgres from "postgres";

import { db } from "@/db/client";
import { userRoles, users } from "@/db/schema";
import { serverEnv } from "@/lib/env.server";
import { parseClientEnv } from "@/lib/env";
import { isStaffRole, STAFF_ROLE_LABELS } from "@/modules/identity/access";
import type { StaffListItem } from "@/modules/identity/staff-list";

export type { StaffListItem };

type AuthUser = {
  id?: string;
  last_sign_in_at?: string | null;
  factors?: { status?: string; factor_type?: string }[];
};

export function runtimeSql(): postgres.Sql {
  return postgres(serverEnv.DATABASE_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
  });
}

export async function listStaff(): Promise<StaffListItem[]> {
  const people = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.kind, "STAFF"))
    .orderBy(users.displayName);
  const roles = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles);
  const auth = await loadAuthUsers(people.map((person) => person.id));
  return people.map((person) => {
    const personRoles = roles
      .filter((role) => role.userId === person.id)
      .map((role) => role.role)
      .filter(isStaffRole);
    const account = auth.get(person.id);
    return {
      id: person.id,
      displayName: person.displayName,
      email: person.email,
      roles: personRoles,
      roleLabels: personRoles.map((role) => STAFF_ROLE_LABELS[role]).join(", "),
      mfaActive: (account?.factors ?? []).some(
        (factor) => factor.factor_type === "totp" && factor.status === "verified",
      ),
      disabled: person.disabledAt !== null,
      lastLogin: formatLastLogin(account?.last_sign_in_at ?? null),
    };
  });
}

function formatLastLogin(value: string | null): string {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

async function loadAuthUsers(ids: readonly string[]): Promise<Map<string, AuthUser>> {
  const found = new Map<string, AuthUser>();
  await Promise.all(
    ids.map(async (id) => {
      const [account, factors] = await Promise.all([loadAuthUser(id), loadFactors(id)]);
      account.factors = factors;
      found.set(id, account);
    }),
  );
  return found;
}

async function loadAuthUser(userId: string): Promise<AuthUser> {
  const client = parseClientEnv(process.env);
  const response = await fetch(
    new URL(`/auth/v1/admin/users/${userId}`, client.NEXT_PUBLIC_SUPABASE_URL),
    { headers: authHeaders(), cache: "no-store" },
  );
  if (response.status === 404) return { id: userId };
  if (!response.ok) {
    throw new Error(`Falha ao consultar o acesso da equipe (${response.status}).`);
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) return { id: userId };
  const lastLogin = "last_sign_in_at" in body ? body.last_sign_in_at : null;
  return {
    id: userId,
    last_sign_in_at: typeof lastLogin === "string" ? lastLogin : null,
  };
}

function authHeaders(): { Authorization: string; apikey: string } {
  return {
    Authorization: `Bearer ${serverEnv.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function loadFactors(userId: string): Promise<AuthUser["factors"]> {
  const client = parseClientEnv(process.env);
  const response = await fetch(
    new URL(`/auth/v1/admin/users/${userId}/factors`, client.NEXT_PUBLIC_SUPABASE_URL),
    { headers: authHeaders(), cache: "no-store" },
  );
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Falha ao consultar os fatores da equipe (${response.status}).`);
  }
  const body: unknown = await response.json();
  if (Array.isArray(body)) return body;
  if (typeof body === "object" && body !== null && "factors" in body) {
    const factors = body.factors;
    if (Array.isArray(factors)) return factors;
  }
  return [];
}

async function authUserRequest(userId: string, body: unknown) {
  const client = parseClientEnv(process.env);
  const response = await fetch(
    new URL(`/auth/v1/admin/users/${userId}`, client.NEXT_PUBLIC_SUPABASE_URL),
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error("Falha ao atualizar o acesso da equipe.");
}

export async function blockAuthUser(userId: string): Promise<void> {
  await authUserRequest(userId, { ban_duration: "876000h" });
}

export async function unblockAuthUser(userId: string): Promise<void> {
  await authUserRequest(userId, { ban_duration: "none" });
}
