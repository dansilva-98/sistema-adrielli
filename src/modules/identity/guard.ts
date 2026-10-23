import { staffRequiresMfa, type StaffRole } from "./access";
import {
  evaluateStaffSession,
  staffSessionMatches,
  touchStaffSession,
  type StaffSession,
} from "./staff-session";
import type { StaffProfile } from "./login";

export type StaffAccessReason =
  | "unauthenticated"
  | "mismatch"
  | "expired"
  | "rejected"
  | "forbidden"
  | "mfa-setup"
  | "mfa-verify";

export type StaffAccessDecision =
  | { ok: true; session: StaffSession }
  | {
      ok: false;
      reason: StaffAccessReason;
      userId: string | null;
      session: StaffSession | null;
    };

export function decideStaffAccess(input: {
  userId: string | null;
  sessionId: string | null;
  cookie: StaffSession | null;
  profile: StaffProfile | null;
  aal: "aal1" | "aal2" | null;
  hasVerifiedTotp: boolean;
  roles: readonly StaffRole[];
  now: number;
}): StaffAccessDecision {
  if (!input.userId || !input.sessionId) {
    return { ok: false, reason: "unauthenticated", userId: input.userId, session: null };
  }
  if (
    !input.cookie ||
    !staffSessionMatches(input.cookie, {
      userId: input.userId,
      sessionId: input.sessionId,
    })
  ) {
    return { ok: false, reason: "mismatch", userId: input.userId, session: null };
  }
  if (evaluateStaffSession(input.cookie, input.now) === "expired") {
    return {
      ok: false,
      reason: "expired",
      userId: input.userId,
      session: input.cookie,
    };
  }
  if (!input.profile || input.profile.kind !== "STAFF" || input.profile.disabledAt) {
    return {
      ok: false,
      reason: "rejected",
      userId: input.userId,
      session: input.cookie,
    };
  }
  if (staffRequiresMfa(input.profile.roles)) {
    if (!input.hasVerifiedTotp) {
      return {
        ok: false,
        reason: "mfa-setup",
        userId: input.userId,
        session: touchStaffSession(input.cookie, input.now),
      };
    }
    if (input.aal !== "aal2") {
      return {
        ok: false,
        reason: "mfa-verify",
        userId: input.userId,
        session: touchStaffSession(input.cookie, input.now),
      };
    }
  }
  const allowed = input.profile.roles.some((role) => input.roles.includes(role));
  if (!allowed) {
    return {
      ok: false,
      reason: "forbidden",
      userId: input.userId,
      session: input.cookie,
    };
  }
  return { ok: true, session: touchStaffSession(input.cookie, input.now) };
}
