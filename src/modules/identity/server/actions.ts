"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env.server";
import { parseClientEnv } from "@/lib/env";
import {
  clearStaffSessionCookie,
  createSupabaseServerClient,
  writeStaffSessionCookie,
} from "@/lib/supabase/server";
import { decideLogin, type SignedInAuth } from "@/modules/identity/login";
import { clientIp, signStaffSession } from "@/modules/identity/staff-session";
import { staffHome, staffRequiresMfa } from "@/modules/identity/access";
import {
  findStaffActorByEmail,
  loadStaffProfile,
  writeStaffAudit,
} from "@/modules/identity/server/directory";

export type FormMessage = { message: string };

async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignedInAuth | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return null;
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id;
  if (!userId) return null;
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const factors = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = (factors.data?.totp ?? []).some(
    (factor) => factor.status === "verified",
  );
  return {
    userId,
    aal: assurance.data?.currentLevel === "aal2" ? "aal2" : "aal1",
    hasVerifiedTotp,
  };
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
  const decision = await decideLogin({
    email,
    password,
    now: Date.now(),
    signIn: signInWithPassword,
    loadProfile: loadStaffProfile,
    findActorByEmail: findStaffActorByEmail,
  });

  if (!decision.ok) {
    if (decision.endAuthSession) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
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
  await writeStaffAudit({
    action: "auth.logout",
    actorUserId: userId,
    entityType: userId ? "user" : null,
    entityId: userId,
    ip: await requestIp(),
    metadata: {},
  });
  await supabase.auth.signOut();
  await clearStaffSessionCookie();
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
  if (password.length < 8)
    return { message: "A senha precisa ter pelo menos 8 caracteres." };
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

export async function enrollTotp(): Promise<
  { factorId: string; qrCode: string } | { error: string }
> {
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
  if (enrolled.error || !enrolled.data?.totp?.qr_code) {
    return { error: "Não foi possível preparar o autenticador. Tente novamente." };
  }
  return { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code };
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
