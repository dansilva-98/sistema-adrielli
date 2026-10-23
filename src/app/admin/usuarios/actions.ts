"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { ZodError } from "zod";

import { parseClientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { USER_ADMIN_ROLES, isStaffRole } from "@/modules/identity/access";
import {
  cancelStaffInvite,
  inviteStaffByEmail,
} from "@/modules/identity/bootstrap-super-admin";
import { requireStaff } from "@/modules/identity/server/guard";
import {
  blockAuthUser,
  runtimeSql,
  unblockAuthUser,
} from "@/modules/identity/server/staff-directory";
import { clientIp } from "@/modules/identity/staff-session";
import {
  disableStaff,
  enableStaff,
  inviteStaffMember,
  replaceStaffRoles,
  StaffAdminError,
} from "@/modules/identity/staff-admin";

import type { StaffFormState } from "./staff-form";

function failure(error: unknown): StaffFormState {
  if (error instanceof StaffAdminError) {
    if (error.code === "self") return { message: "Você não pode desativar a si mesmo." };
    if (error.code === "last") {
      return { message: "A equipe precisa de um super admin ativo." };
    }
    if (error.code === "missing") return { message: "Usuário não encontrado." };
    return { message: "Confira os dados e tente novamente." };
  }
  if (error instanceof ZodError)
    return { message: "Confira os dados e tente novamente." };
  Sentry.captureException(error);
  return { message: "Não foi possível concluir. Tente novamente." };
}

async function actor(): Promise<{ userId: string; ip: string | null }> {
  const access = await requireStaff({ roles: USER_ADMIN_ROLES });
  const headerStore = await headers();
  return { userId: access.userId, ip: clientIp(headerStore) };
}

export async function inviteStaffAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const current = await actor();
  const sql = runtimeSql();
  try {
    const client = parseClientEnv(process.env);
    await inviteStaffMember(sql, {
      actorId: current.userId,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      roles: formData.getAll("roles").map(String).filter(isStaffRole),
      ip: current.ip,
      invite: (email) =>
        inviteStaffByEmail({
          supabaseUrl: client.NEXT_PUBLIC_SUPABASE_URL,
          serviceRoleKey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
          email,
        }),
      cancelInvite: (userId) =>
        cancelStaffInvite({
          supabaseUrl: client.NEXT_PUBLIC_SUPABASE_URL,
          serviceRoleKey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
          userId,
        }),
      report: (error) => Sentry.captureException(error),
    });
    revalidatePath("/admin/usuarios");
    return { message: "Convite enviado." };
  } catch (error) {
    return failure(error);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function updateRolesAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const current = await actor();
  const sql = runtimeSql();
  try {
    await replaceStaffRoles(sql, {
      actorId: current.userId,
      targetId: String(formData.get("userId") ?? ""),
      roles: formData.getAll("roles").map(String).filter(isStaffRole),
      ip: current.ip,
    });
    revalidatePath("/admin/usuarios");
    return { message: "Papéis atualizados." };
  } catch (error) {
    return failure(error);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function setStaffAccessAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const current = await actor();
  const targetId = String(formData.get("userId") ?? "");
  const disable = formData.get("disabled") === "true";
  const sql = runtimeSql();
  try {
    const shared = {
      actorId: current.userId,
      targetId,
      ip: current.ip,
      blockAuth: blockAuthUser,
      unblockAuth: unblockAuthUser,
      report: (error: unknown) => Sentry.captureException(error),
    };
    if (disable) await disableStaff(sql, shared);
    else await enableStaff(sql, shared);
    revalidatePath("/admin/usuarios");
    return { message: disable ? "Usuário desativado." : "Usuário reativado." };
  } catch (error) {
    return failure(error);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
