"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import * as Sentry from "@sentry/nextjs";

import { serverEnv } from "@/lib/env.server";
import { parseClientEnv } from "@/lib/env";
import {
  clearStaffSessionCookie,
  createSupabaseServerClient,
  writeStaffSessionCookie,
} from "@/lib/supabase/server";
import { beginStaffLogin } from "@/modules/identity/login";
import {
  endRejectedAuthSession,
  signInWithSupabase,
} from "@/modules/identity/supabase-sign-in";
import {
  clientIp,
  endStaffAccess,
  signStaffSession,
} from "@/modules/identity/staff-session";
import { staffHome, staffRequiresMfa } from "@/modules/identity/access";
import {
  findStaffActorByEmail,
  loadStaffProfile,
  writeStaffAudit,
} from "@/modules/identity/server/directory";
import {
  loginIsLimited,
  recordLoginAttempt,
} from "@/modules/identity/server/login-attempts";

export type FormMessage = { message: string };

async function signInWithPassword(email: string, password: string) {
  const supabase = await createSupabaseServerClient();
  return signInWithSupabase(supabase, email, password);
}

async function requestIp(): Promise<string | null> {
  const headerStore = await headers();
  return clientIp(headerStore.get("x-forwarded-for"));
}

export async function loginAction(
  _state: FormMessage,
  formData: FormData,
): Promise<FormMessage> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = await requestIp();
  const decision = await beginStaffLogin({
    email,
    password,
    ip,
    secret: serverEnv.STAFF_SESSION_SECRET,
    now: Date.now(),
    isLimited: loginIsLimited,
    recordFailure: recordLoginAttempt,
    signIn: signInWithPassword,
    loadProfile: loadStaffProfile,
    findActorByEmail: findStaffActorByEmail,
  });

  if (!decision.ok) {
    if (decision.endAuthSession) {
      const supabase = await createSupabaseServerClient();
      await endRejectedAuthSession(supabase, decision);
    }
    await writeStaffAudit({
      action: "auth.login.failure",
      actorUserId: decision.actorUserId,
      ip,
      metadata: {},
    });
    return { message: decision.message };
  }

  await writeStaffAudit({
    action: "auth.login.success",
    actorUserId: decision.userId,
    entityType: "user",
    entityId: decision.userId,
    ip,
    metadata: {},
  });
  await writeStaffSessionCookie(
    signStaffSession(decision.session, serverEnv.STAFF_SESSION_SECRET),
  );
  redirect(decision.redirectTo);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id ?? null;
  const ip = await requestIp();
  await endStaffAccess({
    signOut: async () => {
      await supabase.auth.signOut();
    },
    clearCookie: clearStaffSessionCookie,
    audit: () =>
      writeStaffAudit({
        action: "auth.logout",
        actorUserId: userId,
        entityType: userId ? "user" : null,
        entityId: userId,
        ip,
        metadata: {},
      }),
    report: (error) => Sentry.captureException(error),
  });
  redirect("/equipe/entrar");
}

export async function requestPasswordResetAction(
  _state: FormMessage,
  formData: FormData,
): Promise<FormMessage> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const confirmation = "Se o e-mail estiver cadastrado, enviaremos as instruções.";
  if (!email) return { message: "Informe o e-mail." };
  const supabase = await createSupabaseServerClient();
  const site = parseClientEnv(process.env).NEXT_PUBLIC_SITE_URL;
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/equipe/redefinir-senha`,
  });
  return { message: confirmation };
}

export async function setPasswordAction(
  _state: FormMessage,
  formData: FormData,
): Promise<FormMessage> {
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  if (password.length < 12)
    return { message: "A senha precisa ter pelo menos 12 caracteres." };
  const supabase = await createSupabaseServerClient();
  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) return { message: "O link de redefinição não é mais válido." };
  }
  const updated = await supabase.auth.updateUser({ password });
  if (updated.error || !updated.data.user) {
    return { message: "Não foi possível redefinir a senha. Peça um novo link." };
  }
  await writeStaffAudit({
    action: "auth.password.reset",
    actorUserId: updated.data.user.id,
    entityType: "user",
    entityId: updated.data.user.id,
    ip: await requestIp(),
    metadata: {},
  });
  await supabase.auth.signOut();
  await clearStaffSessionCookie();
  redirect("/equipe/entrar?motivo=senha");
}

export async function requireAuthSession(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  if (!userResult.data.user) redirect("/equipe/entrar");
}

export type TotpSetupState = {
  message: string;
  qrCode: string;
  factorId: string;
  secret: string;
};

export async function generateTotpAction(
  _state: TotpSetupState,
  _formData: FormData,
): Promise<TotpSetupState> {
  void _state;
  void _formData;
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  if (!userResult.data.user) redirect("/equipe/entrar");
  const listed = await supabase.auth.mfa.listFactors();
  const verified = (listed.data?.totp ?? []).find(
    (factor) => factor.status === "verified",
  );
  if (verified) redirect("/equipe/mfa/verificar");
  for (const factor of listed.data?.totp ?? []) {
    if (factor.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const enrolled = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Aplicativo autenticador",
  });
  if (enrolled.error || !enrolled.data?.totp?.qr_code || !enrolled.data.totp.secret) {
    return {
      message: "Não foi possível preparar o autenticador. Tente novamente.",
      qrCode: "",
      factorId: "",
      secret: "",
    };
  }
  return {
    message: "",
    qrCode: enrolled.data.totp.qr_code,
    factorId: enrolled.data.id,
    secret: enrolled.data.totp.secret,
  };
}

export async function confirmTotpAction(
  _state: FormMessage,
  formData: FormData,
): Promise<FormMessage> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const factorId = String(formData.get("factorId") ?? "");
  if (!/^\d{6}$/.test(code) || !factorId)
    return { message: "Informe o código de 6 dígitos." };
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id;
  if (!userId) redirect("/equipe/entrar");
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) return { message: "Código inválido." };
  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) {
    await writeStaffAudit({
      action: "auth.mfa.failure",
      actorUserId: userId,
      entityType: "user",
      entityId: userId,
      ip: await requestIp(),
      metadata: {},
    });
    return { message: "Código inválido." };
  }
  await writeStaffAudit({
    action: "auth.mfa.enrolled",
    actorUserId: userId,
    entityType: "user",
    entityId: userId,
    ip: await requestIp(),
    metadata: {},
  });
  const profile = await loadStaffProfile(userId);
  redirect(profile ? staffHome(profile.roles) : "/equipe/entrar");
}

export async function verifyTotpAction(
  _state: FormMessage,
  formData: FormData,
): Promise<FormMessage> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { message: "Informe o código de 6 dígitos." };
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id;
  if (!userId) redirect("/equipe/entrar");
  const listed = await supabase.auth.mfa.listFactors();
  const factor = (listed.data?.totp ?? []).find((item) => item.status === "verified");
  if (!factor) redirect("/equipe/mfa/configurar");
  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error || !challenge.data) return { message: "Código inválido." };
  const verified = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) {
    await writeStaffAudit({
      action: "auth.mfa.failure",
      actorUserId: userId,
      entityType: "user",
      entityId: userId,
      ip: await requestIp(),
      metadata: {},
    });
    return { message: "Código inválido." };
  }
  const profile = await loadStaffProfile(userId);
  if (profile && staffRequiresMfa(profile.roles)) {
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.data?.currentLevel !== "aal2") {
      return { message: "Código inválido." };
    }
  }
  redirect(profile ? staffHome(profile.roles) : "/equipe/entrar");
}
