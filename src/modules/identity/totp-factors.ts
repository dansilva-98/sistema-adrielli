export function totpFactorsAreTrusted(
  verifiedFactorIds: readonly string[],
  knownFactorIds: readonly string[],
): boolean {
  const known = new Set(knownFactorIds);
  return verifiedFactorIds.every((id) => known.has(id));
}

export function staffMfaConfirmed(input: {
  aal: "aal1" | "aal2" | null;
  totpFactorsTrusted?: boolean;
  hasEmailVerification?: boolean;
}): boolean {
  const trustedAal2 = input.aal === "aal2" && input.totpFactorsTrusted !== false;
  return trustedAal2 || Boolean(input.hasEmailVerification);
}

export function totpEnrollmentAllowed(input: {
  emailMfaEnabled: boolean;
  aal: "aal1" | "aal2" | null;
  totpFactorsTrusted?: boolean;
  hasEmailVerification?: boolean;
}): boolean {
  if (!input.emailMfaEnabled) return true;
  return staffMfaConfirmed(input);
}
