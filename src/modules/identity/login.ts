import { staffHome, staffRequiresMfa, type StaffRole } from "./access";
import { LOGIN_ERROR_MESSAGE, loginAttemptKey, type StaffSession } from "./staff-session";

export type StaffProfile = {
  id: string;
  kind: "STAFF" | "CUSTOMER";
  disabledAt: Date | null;
  roles: StaffRole[];
};

export type SignedInAuth = {
  userId: string;
  sessionId: string;
  aal: "aal1" | "aal2";
  hasVerifiedTotp: boolean;
};

export type LoginDecision =
  | { ok: true; userId: string; redirectTo: string; session: StaffSession }
  | { ok: false; message: string; actorUserId: string | null; endAuthSession: boolean };

export async function decideLogin(input: {
  email: string;
  password: string;
  now: number;
  signIn: (email: string, password: string) => Promise<SignedInAuth | null>;
  loadProfile: (userId: string) => Promise<StaffProfile | null>;
  findActorByEmail: (email: string) => Promise<string | null>;
}): Promise<LoginDecision> {
  const email = input.email.trim().toLowerCase();
  const signedIn = await input.signIn(email, input.password);
  if (!signedIn) {
    return {
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      actorUserId: await input.findActorByEmail(email),
      endAuthSession: false,
    };
  }

  const profile = await input.loadProfile(signedIn.userId);
  if (!profile || profile.kind !== "STAFF" || profile.disabledAt) {
    return {
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      actorUserId: profile?.id ?? signedIn.userId,
      endAuthSession: true,
    };
  }

  const session: StaffSession = {
    userId: profile.id,
    sessionId: signedIn.sessionId,
    startedAt: input.now,
    lastActivity: input.now,
  };
  if (staffRequiresMfa(profile.roles)) {
    if (!signedIn.hasVerifiedTotp) {
      return {
        ok: true,
        userId: profile.id,
        redirectTo: "/equipe/mfa/configurar",
        session,
      };
    }
    if (signedIn.aal !== "aal2") {
      return {
        ok: true,
        userId: profile.id,
        redirectTo: "/equipe/mfa/verificar",
        session,
      };
    }
  }

  return { ok: true, userId: profile.id, redirectTo: staffHome(profile.roles), session };
}

export async function beginStaffLogin(input: {
  email: string;
  password: string;
  ip: string | null;
  secret: string;
  now: number;
  isLimited: (keys: { emailKey: string; ipKey: string | null }) => Promise<boolean>;
  recordFailure: (keys: { emailKey: string; ipKey: string | null }) => Promise<void>;
  signIn: (email: string, password: string) => Promise<SignedInAuth | null>;
  loadProfile: (userId: string) => Promise<StaffProfile | null>;
  findActorByEmail: (email: string) => Promise<string | null>;
}): Promise<LoginDecision> {
  const email = input.email.trim().toLowerCase();
  const keys = {
    emailKey: loginAttemptKey(email, input.secret),
    ipKey: input.ip ? loginAttemptKey(input.ip, input.secret) : null,
  };
  if (await input.isLimited(keys)) {
    await input.recordFailure(keys);
    return {
      ok: false,
      message: LOGIN_ERROR_MESSAGE,
      actorUserId: await input.findActorByEmail(email),
      endAuthSession: false,
    };
  }

  const decision = await decideLogin({
    email,
    password: input.password,
    now: input.now,
    signIn: input.signIn,
    loadProfile: input.loadProfile,
    findActorByEmail: input.findActorByEmail,
  });
  if (!decision.ok) await input.recordFailure(keys);
  return decision;
}
