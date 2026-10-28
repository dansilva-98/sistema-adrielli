"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { z, ZodError } from "zod";

import { sql } from "@/db/client";
import { clientEnv } from "@/lib/env-client";
import { serverEnv } from "@/lib/env.server";
import {
  confirmAttachmentUpload,
  deleteAttachment,
  openAttachment,
  prepareAttachmentUpload,
} from "@/modules/clinic/attachments";
import {
  type ClinicActionState,
  type GuardianSearchState,
  type PatientSearchState,
} from "@/modules/clinic/form-state";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@/modules/clinic/format";
import { clinicObjectStore } from "@/modules/clinic/storage";
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
import { readGuardianSearch, readPatientList } from "@/modules/clinic/server/read";
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
    if (error.code === "type") {
      return {
        ok: false,
        code: "",
        message: "Envie um PDF ou uma imagem JPG, PNG ou WebP.",
      };
    }
    if (error.code === "size") {
      return {
        ok: false,
        code: "",
        message: "O arquivo precisa ter entre 1 byte e 10 MB.",
      };
    }
    if (error.code === "already-confirmed") {
      return { ok: false, code: "", message: "Este envio já foi registrado." };
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
  const current = await currentActor();
  if (formData.get("confirm") !== "sim") {
    return { ok: false, code: "", message: "Confirme o arquivamento." };
  }
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
  const current = await currentActor();
  if (formData.get("confirm") !== "sim") {
    return { ok: false, code: "", message: "Confirme para desligar o responsável." };
  }
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

function formText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function reportSearchFailure(): void {
  Sentry.captureException(new Error("Clinic search failed"));
}

export async function searchPatientsFormAction(
  _previous: PatientSearchState,
  formData: FormData,
): Promise<PatientSearchState> {
  await assertRole(CONSULTORIO_ROLES);
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const query = formText(formData.get("query"));
  const archived = formData.get("archived") === "arquivados";
  try {
    const patients = await readPatientList({ query, archived });
    return { patients, hasQuery: query.trim().length > 0, message: "" };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof StaffAccessError) throw error;
    reportSearchFailure();
    return {
      patients: [],
      hasQuery: false,
      message: "Não foi possível buscar. Tente novamente.",
    };
  }
}

export async function searchGuardiansFormAction(
  _previous: GuardianSearchState,
  formData: FormData,
): Promise<GuardianSearchState> {
  await assertRole(CONSULTORIO_ROLES);
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const patientId = formText(formData.get("patientId"));
  const query = formText(formData.get("query"));
  if (!z.uuid().safeParse(patientId).success) {
    return { matches: [], message: "Não foi possível buscar. Tente novamente." };
  }
  try {
    const matches = await readGuardianSearch(patientId, query);
    return { matches, message: "" };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof StaffAccessError) throw error;
    reportSearchFailure();
    return { matches: [], message: "Não foi possível buscar. Tente novamente." };
  }
}

const attachmentStore = () =>
  clinicObjectStore({
    supabaseUrl: clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  });

export type AttachmentUploadState =
  | { ok: true; signedUrl: string; token: string; receipt: string }
  | { ok: false; message: string };

function formNumber(value: FormDataEntryValue | null): number {
  const parsed = Number(formText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formCategory(value: FormDataEntryValue | null): AttachmentCategory | null {
  const text = formText(value);
  return ATTACHMENT_CATEGORIES.some(([category]) => category === text)
    ? (text as AttachmentCategory)
    : null;
}

export async function prepareAttachmentUploadAction(
  formData: FormData,
): Promise<AttachmentUploadState> {
  try {
    const actor = await currentActor();
    const patientId = parseRecordId(formData);
    const prepared = await prepareAttachmentUpload(
      sql,
      actor,
      attachmentStore(),
      serverEnv.STAFF_SESSION_SECRET,
      {
        patientId,
        mime: formText(formData.get("mime")),
        size: formNumber(formData.get("size")),
      },
      Date.now(),
    );
    return { ok: true, ...prepared };
  } catch (error) {
    const result = failure(error);
    return { ok: false, message: result.message };
  }
}

export async function confirmAttachmentUploadAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const actor = await currentActor();
  try {
    const patientId = parseRecordId(formData);
    const category = formCategory(formData.get("category"));
    if (!category)
      return { ok: false, code: "", message: "Escolha a categoria do anexo." };
    await confirmAttachmentUpload(
      sql,
      actor,
      attachmentStore(),
      serverEnv.STAFF_SESSION_SECRET,
      {
        receipt: formText(formData.get("receipt")),
        originalName: formText(formData.get("originalName")),
        category,
        now: Date.now(),
      },
    );
    refresh(patientId);
    return { ok: true, code: "", message: "" };
  } catch (error) {
    return failure(error);
  }
}

export async function openAttachmentAction(
  attachmentId: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const actor = await currentActor();
    const parsed = z.uuid().safeParse(attachmentId);
    if (!parsed.success) return { ok: false, message: "Anexo não encontrado." };
    const url = await openAttachment(sql, actor, attachmentStore(), parsed.data);
    return { ok: true, url };
  } catch (error) {
    const result = failure(error);
    return { ok: false, message: result.message };
  }
}

export async function deleteAttachmentAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const actor = await currentActor();
  try {
    if (formData.get("confirm") !== "sim") {
      return { ok: false, code: "", message: "Confirme a exclusão do anexo." };
    }
    const patientId = parseRecordId(formData);
    const attachmentId = z.uuid().parse(formText(formData.get("attachmentId")));
    await deleteAttachment(sql, actor, attachmentId);
    refresh(patientId);
    return { ok: true, code: "", message: "" };
  } catch (error) {
    return failure(error);
  }
}
