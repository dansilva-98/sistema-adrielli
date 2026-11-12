import type postgres from "postgres";

import { mapClinicError } from "./patients";

function isDeadlock(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "40P01") return true;
  if ("cause" in error) return isDeadlock(error.cause);
  return error instanceof Error && /deadlock detected/i.test(error.message);
}

export async function runClinicTransaction<T>(
  db: postgres.Sql,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return (await db.begin(async (tx) => work(tx))) as T;
    } catch (error) {
      const mapped = mapClinicError(error);
      if (mapped) throw mapped;
      lastError = error;
      if (!isDeadlock(error) || attempt === 3) throw error;
    }
  }
  throw lastError;
}
