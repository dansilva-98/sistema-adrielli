export type VerifiedStaffClaims = {
  userId: string;
  sessionId: string;
  aal: "aal1" | "aal2";
};

export function verifiedStaffClaims(
  claims: { sub?: unknown; session_id?: unknown; aal?: unknown } | null,
): VerifiedStaffClaims | null {
  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) return null;
  if (typeof claims.session_id !== "string" || claims.session_id.length === 0)
    return null;
  return {
    userId: claims.sub,
    sessionId: claims.session_id,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
  };
}
