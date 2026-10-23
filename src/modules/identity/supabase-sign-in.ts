import type { SupabaseClient } from "@supabase/supabase-js";

import type { LoginDecision, SignedInAuth } from "./login";

export function sessionIdFromAccessToken(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (typeof parsed !== "object" || parsed === null || !("session_id" in parsed))
      return null;
    return typeof parsed.session_id === "string" && parsed.session_id
      ? parsed.session_id
      : null;
  } catch {
    return null;
  }
}

export async function signInWithSupabase(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<SignedInAuth | null> {
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.user || !signed.data.session) return null;
  const sessionId = sessionIdFromAccessToken(signed.data.session.access_token);
  if (!sessionId) {
    await client.auth.signOut();
    return null;
  }
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const factors = await client.auth.mfa.listFactors();
  const hasVerifiedTotp = (factors.data?.totp ?? []).some(
    (factor) => factor.status === "verified",
  );
  return {
    userId: signed.data.user.id,
    sessionId,
    aal: assurance.data?.currentLevel === "aal2" ? "aal2" : "aal1",
    hasVerifiedTotp,
  };
}

export async function endRejectedAuthSession(
  client: SupabaseClient,
  decision: LoginDecision,
): Promise<void> {
  if (!decision.ok && decision.endAuthSession) await client.auth.signOut();
}
