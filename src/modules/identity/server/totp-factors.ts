import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { staffTotpFactors } from "@/db/schema";
import { totpFactorsAreTrusted } from "@/modules/identity/totp-factors";

export async function knownStaffTotpFactorIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ factorId: staffTotpFactors.factorId })
    .from(staffTotpFactors)
    .where(eq(staffTotpFactors.userId, userId));
  return rows.map((row) => row.factorId);
}

export async function rememberStaffTotpFactor(input: {
  userId: string;
  factorId: string;
}): Promise<void> {
  await db
    .insert(staffTotpFactors)
    .values({ userId: input.userId, factorId: input.factorId })
    .onConflictDoNothing();
}

export async function verifiedTotpFactorsAreKnown(
  userId: string,
  verifiedFactorIds: readonly string[],
): Promise<boolean> {
  if (verifiedFactorIds.length === 0) return true;
  const known = await knownStaffTotpFactorIds(userId);
  return totpFactorsAreTrusted(verifiedFactorIds, known);
}
