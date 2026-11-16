import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const CALENDAR_TOKEN_BYTES = 32;
export const CALENDAR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateCalendarToken(): string {
  return randomBytes(CALENDAR_TOKEN_BYTES).toString("base64url");
}

export function hashCalendarToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseCalendarFeedFile(file: string): string | null {
  if (!file.endsWith(".ics")) return null;
  const token = file.slice(0, -".ics".length);
  if (!CALENDAR_TOKEN_PATTERN.test(token)) return null;
  return token;
}

export function calendarFeedPath(token: string): string {
  return `/api/consultorio/calendario/${token}.ics`;
}

export function calendarTokenHashMatches(
  storedHash: string | null,
  token: string,
): boolean {
  const presented = hashCalendarToken(token);
  const baseline = storedHash ?? "0".repeat(64);
  const left = Buffer.from(baseline, "utf8");
  const right = Buffer.from(presented, "utf8");
  if (left.length !== right.length) return false;
  const equal = timingSafeEqual(left, right);
  return storedHash !== null && equal;
}
