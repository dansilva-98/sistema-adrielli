import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env.server";
import {
  clearStaffSessionCookie,
  createSupabaseServerClient,
  writeStaffSessionCookie,
} from "@/lib/supabase/server";
import type { StaffRole } from "@/modules/identity/access";
import { staffRequiresMfa } from "@/modules/identity/access";
import {
  decideStaffAccess,
  type StaffAccessDecision,
  type StaffAccessReason,
} from "@/modules/identity/guard";
import {
  readStaffSession,
  signStaffSession,
  STAFF_SESSION_COOKIE,
} from "@/modules/identity/staff-session";
import { sessionIdFromAccessToken } from "@/modules/identity/supabase-sign-in";

import { loadStaffProfile, writeStaffAudit } from "./directory";

export class StaffAccessError extends Error {
  readonly reason: StaffAccessReason;

  constructor(reason: StaffAccessReason) {
    super(reason);
    this.name = "StaffAccessError";
    this.reason = reason;
  }
}

async function currentDecision(
  roles: readonly StaffRole[],
): Promise<StaffAccessDecision> {
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  const sessionResult = user ? await supabase.auth.getSession() : null;
  const accessToken = sessionResult?.data.session?.access_token ?? "";
  const sessionUserId = sessionResult?.data.session?.user.id ?? null;
  const sessionId =
    user && sessionUserId === user.id ? sessionIdFromAccessToken(accessToken) : null;
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  const cookie = token ? readStaffSession(token, serverEnv.STAFF_SESSION_SECRET) : null;
  const profile = user ? await loadStaffProfile(user.id) : null;
  let aal: "aal1" | "aal2" | null = null;
  let hasVerifiedTotp = false;
  if (
    profile?.kind === "STAFF" &&
    !profile.disabledAt &&
    staffRequiresMfa(profile.roles)
  ) {
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = assurance.data?.currentLevel === "aal2" ? "aal2" : "aal1";
    const factors = await supabase.auth.mfa.listFactors();
    hasVerifiedTotp = (factors.data?.totp ?? []).some(
      (factor) => factor.status === "verified",
    );
  }
  return decideStaffAccess({
    userId: user?.id ?? null,
    sessionId,
    cookie,
    profile,
    aal,
    hasVerifiedTotp,
    roles,
    now: Date.now(),
  });
}

async function enforceStaffAccess(
  roles: readonly StaffRole[],
): Promise<StaffAccessDecision> {
  const decision = await currentDecision(roles);
  if (decision.ok) {
    await writeStaffSessionCookie(
      signStaffSession(decision.session, serverEnv.STAFF_SESSION_SECRET),
    );
    return decision;
  }
  if (decision.reason === "mfa-setup" || decision.reason === "mfa-verify") {
    if (decision.session) {
      await writeStaffSessionCookie(
        signStaffSession(decision.session, serverEnv.STAFF_SESSION_SECRET),
      );
    }
    return decision;
  }
  if (decision.reason === "forbidden") {
    await writeStaffAudit({
      action: "access.denied",
      actorUserId: decision.userId,
      entityType: "user",
      entityId: decision.userId,
      metadata: {},
    });
    return decision;
  }
  if (
    decision.reason === "expired" ||
    decision.reason === "mismatch" ||
    decision.reason === "rejected" ||
    decision.reason === "unauthenticated"
  ) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    await clearStaffSessionCookie();
  }
  if (decision.reason === "expired") {
    await writeStaffAudit({
      action: "auth.session.expired",
      actorUserId: decision.userId,
      entityType: "user",
      entityId: decision.userId,
      metadata: {},
    });
  }
  return decision;
}

function redirectFor(decision: Extract<StaffAccessDecision, { ok: false }>): never {
  if (decision.reason === "forbidden") redirect("/acesso-negado");
  if (decision.reason === "mfa-setup") redirect("/equipe/mfa/configurar");
  if (decision.reason === "mfa-verify") redirect("/equipe/mfa/verificar");
  if (decision.reason === "expired") redirect("/equipe/entrar?motivo=sessao");
  redirect("/equipe/entrar");
}

export async function requireStaff(input: {
  roles: readonly StaffRole[];
}): Promise<void> {
  const decision = await enforceStaffAccess(input.roles);
  if (!decision.ok) redirectFor(decision);
}

export async function assertRole(roles: readonly StaffRole[]): Promise<void> {
  const decision = await enforceStaffAccess(roles);
  if (!decision.ok) throw new StaffAccessError(decision.reason);
}
