import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/modules/identity/access";
import { staffRequiresMfa } from "@/modules/identity/access";
import {
  decideStaffAccess,
  type StaffAccessDecision,
  type StaffAccessReason,
} from "@/modules/identity/guard";
import type { StaffProfile } from "@/modules/identity/login";
import {
  clientIp,
  readStaffSession,
  STAFF_SESSION_COOKIE,
} from "@/modules/identity/staff-session";
import { verifiedStaffClaims } from "@/modules/identity/staff-claims";

import { loadStaffProfile, writeStaffAudit } from "./directory";

export class StaffAccessError extends Error {
  readonly reason: StaffAccessReason;

  constructor(reason: StaffAccessReason) {
    super(reason);
    this.name = "StaffAccessError";
    this.reason = reason;
  }
}

const loadAccessContext = cache(async function loadAccessContext() {
  // A sessão do Supabase lê Date.now(). Sem isto, o Next tenta pré-renderizar
  // a área e devolve a página de erro em vez do 403.
  await connection();
  const supabase = await createSupabaseServerClient();
  const claimsResult = await supabase.auth.getClaims();
  const identity = verifiedStaffClaims(claimsResult.data?.claims ?? null);
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  const cookie = token ? readStaffSession(token, serverEnv.STAFF_SESSION_SECRET) : null;
  const profile = identity ? await loadStaffProfile(identity.userId) : null;
  let hasVerifiedTotp = identity?.aal === "aal2";
  if (
    profile?.kind === "STAFF" &&
    !profile.disabledAt &&
    staffRequiresMfa(profile.roles) &&
    identity?.aal !== "aal2"
  ) {
    const factors = await supabase.auth.mfa.listFactors();
    hasVerifiedTotp = (factors.data?.totp ?? []).some(
      (factor) => factor.status === "verified",
    );
  }
  return { identity, cookie, profile, hasVerifiedTotp, now: Date.now() };
});

const currentDecision = cache(async function currentDecision(
  roles: readonly StaffRole[],
): Promise<StaffAccessDecision> {
  const context = await loadAccessContext();
  return decideStaffAccess({
    userId: context.identity?.userId ?? null,
    sessionId: context.identity?.sessionId ?? null,
    cookie: context.cookie,
    profile: context.profile,
    aal: context.identity?.aal ?? null,
    hasVerifiedTotp: context.hasVerifiedTotp,
    roles,
    now: context.now,
  });
});

function redirectFor(decision: Extract<StaffAccessDecision, { ok: false }>): never {
  if (decision.reason === "forbidden") redirect("/acesso-negado");
  if (decision.reason === "mfa-setup") redirect("/equipe/mfa/configurar");
  if (decision.reason === "mfa-verify") redirect("/equipe/mfa/verificar");
  if (decision.reason === "expired") redirect("/equipe/sair?motivo=sessao");
  redirect("/equipe/sair");
}

async function denyIfForbidden(decision: StaffAccessDecision): Promise<void> {
  if (decision.ok || decision.reason !== "forbidden") return;
  const headerStore = await headers();
  await writeStaffAudit({
    action: "access.denied",
    actorUserId: decision.userId,
    entityType: "user",
    entityId: decision.userId,
    ip: clientIp(headerStore),
    metadata: {},
  });
}

export async function requireStaff(input: {
  roles: readonly StaffRole[];
}): Promise<{ userId: string; profile: StaffProfile }> {
  const decision = await currentDecision(input.roles);
  if (!decision.ok) {
    await denyIfForbidden(decision);
    redirectFor(decision);
  }
  const profile = await loadStaffProfile(decision.session.userId);
  if (!profile || profile.kind !== "STAFF" || profile.disabledAt)
    redirect("/equipe/sair");
  return { userId: decision.session.userId, profile };
}

export async function assertRole(roles: readonly StaffRole[]): Promise<void> {
  const decision = await currentDecision(roles);
  if (decision.ok) return;
  await denyIfForbidden(decision);
  throw new StaffAccessError(decision.reason);
}
