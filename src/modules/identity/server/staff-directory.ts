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
  const client = parseClientEnv(process.env);
  const found = new Map<string, AuthUser>();
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      new URL(
        `/auth/v1/admin/users?page=${page}&per_page=200`,
        client.NEXT_PUBLIC_SUPABASE_URL,
      ),
      {
        headers: {
          Authorization: `Bearer ${serverEnv.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(`Falha ao consultar o acesso da equipe (${response.status}).`);
    }
    const body: unknown = await response.json();
    const usersPage = readUsers(body);
    for (const user of usersPage) {
      if (user.id) found.set(user.id, user);
    }
    if (usersPage.length < 200) break;
  }
  await Promise.all(
    ids.map(async (id) => {
      const current = found.get(id) ?? { id };
      current.factors = await loadFactors(id);
      found.set(id, current);
    }),
  );
  return found;
}

async function loadFactors(userId: string): Promise<AuthUser["factors"]> {
  const client = parseClientEnv(process.env);
  const response = await fetch(
    new URL(`/auth/v1/admin/users/${userId}/factors`, client.NEXT_PUBLIC_SUPABASE_URL),
    {
      headers: {
        Authorization: `Bearer ${serverEnv.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Falha ao consultar os fatores da equipe (${response.status}).`);
  }
  const body: unknown = await response.json();
  if (Array.isArray(body)) return body;
  return [];
}

function readUsers(body: unknown): AuthUser[] {
  if (typeof body !== "object" || body === null || !("users" in body)) return [];
  const usersValue = body.users;
  if (!Array.isArray(usersValue)) return [];
  return usersValue.filter(
    (user): user is AuthUser => typeof user === "object" && user !== null,
  );
}

async function authUserRequest(userId: string, method: "PUT" | "POST", body?: unknown) {
  const client = parseClientEnv(process.env);
  const path =
    method === "POST"
      ? `/auth/v1/admin/users/${userId}/logout`
      : `/auth/v1/admin/users/${userId}`;
  const response = await fetch(new URL(path, client.NEXT_PUBLIC_SUPABASE_URL), {
    method,
    headers: {
      Authorization: `Bearer ${serverEnv.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Falha ao atualizar o acesso da equipe.");
}

export async function blockAuthUser(userId: string): Promise<void> {
  await authUserRequest(userId, "PUT", { ban_duration: "876000h" });
  await authUserRequest(userId, "POST");
}

export async function unblockAuthUser(userId: string): Promise<void> {
  await authUserRequest(userId, "PUT", { ban_duration: "none" });
}
