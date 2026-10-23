"use server";

import { redirect } from "next/navigation";

import {
  clearStaffSessionCookie,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export type InviteFormState = { message: string };

const invalidInvite = "Este convite não é mais válido. Peça um novo à administração.";

export async function acceptInviteAction(
  _state: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!tokenHash) return { message: invalidInvite };
  if (password.length < 12) {
    return { message: "A senha precisa ter pelo menos 12 caracteres." };
  }
  const supabase = await createSupabaseServerClient();
  const verified = await supabase.auth.verifyOtp({
    type: "invite",
    token_hash: tokenHash,
  });
  if (verified.error) return { message: invalidInvite };
  const updated = await supabase.auth.updateUser({ password });
  if (updated.error || !updated.data.user) {
    return { message: "Não foi possível definir a senha. Peça um novo convite." };
  }
  await supabase.auth.signOut();
  await clearStaffSessionCookie();
  redirect("/equipe/entrar?motivo=senha");
}
