"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { ZodError } from "zod";

import { sql } from "@/db/client";
import { type ClinicActionState } from "@/modules/clinic/form-state";
import { todayInClinic } from "@/modules/clinic/format";
import {
  addGuardian,
  archivePatient,
  ClinicRuleError,
  createPatient,
  linkGuardian,
  restorePatient,
  setPrimaryGuardian,
  unlinkGuardian,
  updatePatient,
  type Actor,
} from "@/modules/clinic/patients";
import {
  parseCreatePatient,
  parseGuardianInput,
  parsePatientUpdate,
  parseRecordId,
} from "@/modules/clinic/schema";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import {
  assertRole,
  requireStaff,
  StaffAccessError,
} from "@/modules/identity/server/guard";
import { clientIp } from "@/modules/identity/staff-session";

function failure(error: unknown): ClinicActionState {
  if (error instanceof StaffAccessError) throw error;
  if (error instanceof ClinicRuleError) {
    if (error.code === "duplicate") {
      return {
        ok: false,
        code: "duplicate",
        message:
          "Já existe um paciente com este nome e esta data de nascimento. Confirme para cadastrar mesmo assim.",
      };
    }
    if (error.code === "last-guardian") {
      return { ok: false, code: "", message: "O paciente precisa de um responsável." };
    }
    if (error.code === "duplicate-cpf") {
      return { ok: false, code: "", message: "Este CPF já está cadastrado." };
    }
    if (error.code === "invalid-cpf") {
      return { ok: false, code: "", message: "CPF inválido." };
    }
    if (error.code === "invalid-phone") {
      return { ok: false, code: "", message: "Telefone inválido." };
    }
    if (error.code === "already-linked") {
      return {
        ok: false,
        code: "",
        message: "Este responsável já está ligado ao paciente.",
      };
    }
    return { ok: false, code: "", message: "Paciente não encontrado." };
  }
  if (error instanceof ZodError) {
    return {
      ok: false,
      code: "",
      message: error.issues[0]?.message ?? "Confira os dados e tente novamente.",
    };
  }
  Sentry.captureException(error);
  return { ok: false, code: "", message: "Não foi possível concluir. Tente novamente." };
}

async function currentActor(): Promise<Actor> {
  await assertRole(CONSULTORIO_ROLES);
  const access = await requireStaff({ roles: CONSULTORIO_ROLES });
  const headerStore = await headers();
  return { userId: access.userId, ip: clientIp(headerStore) };
}

function refresh(patientId?: string): void {
  revalidatePath("/consultorio/pacientes");
  if (patientId) revalidatePath(`/consultorio/pacientes/${patientId}`);
}

export async function createPatientAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const current = await currentActor();
  let patientId = "";
  try {
    const input = parseCreatePatient(formData, todayInClinic());
    patientId = await createPatient(sql, current, input);
  } catch (error) {
    return failure(error);
  }
  refresh(patientId);
  redirect(`/consultorio/pacientes/${patientId}`);
}

export async function updatePatientAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const current = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    await updatePatient(
      sql,
      current,
      patientId,
      parsePatientUpdate(formData, todayInClinic()),
    );
    refresh(patientId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true, code: "", message: "Dados salvos." };
}

export async function archivePatientAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  if (formData.get("confirm") !== "sim") {
    return { ok: false, code: "", message: "Confirme o arquivamento." };
  }
  const current = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    await archivePatient(sql, current, patientId);
    refresh(patientId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true, code: "", message: "Paciente arquivado." };
}

export async function restorePatientAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const current = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    await restorePatient(sql, current, patientId);
    refresh(patientId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true, code: "", message: "Paciente restaurado." };
}

export async function addGuardianAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const current = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    await addGuardian(sql, current, patientId, parseGuardianInput(formData));
    refresh(patientId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true, code: "", message: "Responsável adicionado." };
}

export async function linkGuardianAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const current = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    const guardianId = parseRecordId(formData, "guardianId");
    await linkGuardian(sql, current, patientId, guardianId);
    refresh(patientId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true, code: "", message: "Responsável vinculado." };
}

export async function setPrimaryGuardianAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const current = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    const guardianId = parseRecordId(formData, "guardianId");
    await setPrimaryGuardian(sql, current, patientId, guardianId);
    refresh(patientId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true, code: "", message: "Responsável principal definido." };
}

export async function unlinkGuardianAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  if (formData.get("confirm") !== "sim") {
    return { ok: false, code: "", message: "Confirme para desligar o responsável." };
  }
  const current = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    const guardianId = parseRecordId(formData, "guardianId");
    await unlinkGuardian(sql, current, patientId, guardianId);
    refresh(patientId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true, code: "", message: "Responsável desligado." };
}
