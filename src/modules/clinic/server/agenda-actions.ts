"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z, ZodError } from "zod";

import { sql } from "@/db/client";
import { reportServerError } from "@/lib/sentry-server";
import {
  parseAgendaSettings,
  parseAppointmentForm,
  parseCancelReason,
  parseCreatePackage,
  parseMakeupForm,
  parseOptionalPriceCents,
  parseRescheduleForm,
  parseStatusChange,
} from "@/modules/clinic/agenda-schema";
import { updateAgendaSettings } from "@/modules/clinic/agenda-settings";
import {
  packageOverflowLabel,
  seriesConfirmFlags,
  seriesConfirmKey,
} from "@/modules/clinic/agenda-view";
import {
  cancelAppointment,
  changeAppointmentStatus,
  clinicDateTime,
  clinicWeeklySlots,
  createAppointment,
  createAppointmentSeries,
  previewAppointmentSeries,
  rescheduleAppointment,
  scheduleMakeup,
  setAppointmentPackage,
  undoAppointmentStatus,
} from "@/modules/clinic/appointments";
import { clinicErrorMessage } from "@/modules/clinic/clinic-errors";
import type { AgendaActionState, ClinicActionState } from "@/modules/clinic/form-state";
import { idleAgendaAction, idleClinicAction } from "@/modules/clinic/form-state";
import { formatClinicSlotLabel } from "@/modules/clinic/format";
import { closePackage, createPackage } from "@/modules/clinic/packages";
import { ClinicRuleError, type Actor } from "@/modules/clinic/patients";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import {
  assertRole,
  requireStaff,
  StaffAccessError,
} from "@/modules/identity/server/guard";
import { clientIp } from "@/modules/identity/staff-session";

function formText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function optionalId(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function failure(error: unknown): Promise<AgendaActionState> {
  if (error instanceof StaffAccessError) throw error;
  if (error instanceof ClinicRuleError) {
    return {
      ...idleAgendaAction,
      code: error.code,
      message:
        error.code === "package-overflow"
          ? packageOverflowLabel(error.overflowCount)
          : clinicErrorMessage(error.code),
      overflowCount: error.overflowCount,
    };
  }
  if (error instanceof ZodError) {
    return {
      ...idleAgendaAction,
      message: error.issues[0]?.message ?? "Confira os dados e tente novamente.",
    };
  }
  await reportServerError(error);
  return {
    ...idleAgendaAction,
    message: "Não foi possível concluir. Tente novamente.",
  };
}

async function clinicFailure(error: unknown): Promise<ClinicActionState> {
  if (error instanceof StaffAccessError) throw error;
  if (error instanceof ClinicRuleError) {
    return { ok: false, code: "", message: clinicErrorMessage(error.code) };
  }
  if (error instanceof ZodError) {
    return {
      ok: false,
      code: "",
      message: error.issues[0]?.message ?? "Confira os dados e tente novamente.",
    };
  }
  await reportServerError(error);
  return { ok: false, code: "", message: "Não foi possível concluir. Tente novamente." };
}

async function currentActor(): Promise<Actor> {
  await assertRole(CONSULTORIO_ROLES);
  const access = await requireStaff({ roles: CONSULTORIO_ROLES });
  const headerStore = await headers();
  return { userId: access.userId, ip: clientIp(headerStore) };
}

function refreshAgenda(patientId?: string, appointmentId?: string): void {
  revalidatePath("/consultorio/agenda");
  if (appointmentId) revalidatePath(`/consultorio/agenda/${appointmentId}`);
  if (patientId) revalidatePath(`/consultorio/pacientes/${patientId}`);
}

export async function createAppointmentAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  let slotKey = "";
  let skipConflicts = false;
  try {
    const input = parseAppointmentForm({
      patientId: formText(formData.get("patientId")),
      date: formText(formData.get("date")),
      time: formText(formData.get("time")),
      durationMinutes: Number(formText(formData.get("durationMinutes"))),
      packageId: optionalId(formText(formData.get("packageId"))),
      modality: "in_person",
      notes: formText(formData.get("notes")) || null,
      weeks: Number(formText(formData.get("weeks")) || "1"),
    });
    slotKey = seriesConfirmKey({
      date: input.date,
      time: input.time,
      durationMinutes: input.durationMinutes,
      weeks: input.weeks,
      packageId: input.packageId,
    });
    const postedKey = formText(formData.get("confirmKey"));
    const flags = seriesConfirmFlags({
      postedKey,
      slotKey,
      confirmLivres: formData.get("confirm") === "livres",
      confirmOverflow: formData.get("confirmOverflow") === "sim",
    });
    skipConflicts = flags.skipConflicts;
    const unlinkedCount = flags.overflowConfirmed
      ? Number(formText(formData.get("overflowCount")))
      : 0;
    if (input.weeks === 1) {
      const slot = await clinicDateTime(
        sql,
        input.date,
        input.time,
        input.durationMinutes,
      );
      const id = await createAppointment(sql, actor, {
        patientId: input.patientId,
        packageId: input.packageId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        modality: input.modality,
        seriesId: null,
        notes: input.notes,
      });
      refreshAgenda(input.patientId, id);
      redirect(`/consultorio/agenda/${id}`);
    }
    const slots = await clinicWeeklySlots(
      sql,
      input.date,
      input.time,
      input.durationMinutes,
      input.weeks,
    );
    const preview = await previewAppointmentSeries(sql, slots);
    const conflicts = preview.filter((slot) => slot.conflict);
    if (conflicts.length > 0 && !skipConflicts) {
      return {
        ...idleAgendaAction,
        code: "series-conflict",
        message: clinicErrorMessage("series-conflict"),
        conflicts: conflicts.map((slot) => formatClinicSlotLabel(slot.startsAt)),
        slotKey,
      };
    }
    const ids = await createAppointmentSeries(
      sql,
      actor,
      {
        patientId: input.patientId,
        packageId: input.packageId,
        startsAt: slots[0]!.startsAt,
        endsAt: slots[0]!.endsAt,
        modality: input.modality,
        seriesId: null,
        notes: input.notes,
        slots,
      },
      { skipConflicts, unlinkedCount },
    );
    refreshAgenda(input.patientId, ids[0]);
    redirect(`/consultorio/agenda/${ids[0]}`);
  } catch (error) {
    unstable_rethrow(error);
    const failed = await failure(error);
    if (failed.code === "package-overflow") {
      return { ...failed, slotKey, allowSkip: skipConflicts };
    }
    if (failed.code === "series-conflict") {
      return { ...failed, slotKey };
    }
    return failed;
  }
}

export async function createPackageAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const actor = await currentActor();
  try {
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    const expiresOn = optionalId(formText(formData.get("expiresOn")));
    await createPackage(
      sql,
      actor,
      parseCreatePackage({
        patientId,
        totalSessions: Number(formText(formData.get("totalSessions"))),
        startsOn: formText(formData.get("startsOn")),
        expiresOn,
        priceCents: parseOptionalPriceCents(formText(formData.get("price"))),
        notes: formText(formData.get("notes")) || null,
      }),
    );
    refreshAgenda(patientId);
    return { ...idleClinicAction, ok: true, message: "Pacote criado." };
  } catch (error) {
    return clinicFailure(error);
  }
}

export async function closePackageAction(
  _state: ClinicActionState,
  formData: FormData,
): Promise<ClinicActionState> {
  const actor = await currentActor();
  if (formData.get("confirm") !== "sim") {
    return { ...idleClinicAction, message: "Confirme o encerramento." };
  }
  try {
    const packageId = z.uuid().parse(formText(formData.get("packageId")));
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    await closePackage(sql, actor, packageId);
    refreshAgenda(patientId);
    return { ...idleClinicAction, ok: true, message: "Pacote encerrado." };
  } catch (error) {
    return clinicFailure(error);
  }
}

export async function setAppointmentPackageAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  try {
    const appointmentId = z.uuid().parse(formText(formData.get("appointmentId")));
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    const packageId = optionalId(formText(formData.get("packageId")));
    await setAppointmentPackage(sql, actor, appointmentId, packageId);
    refreshAgenda(patientId, appointmentId);
    return {
      ...idleAgendaAction,
      ok: true,
      message: packageId ? "Sessão ligada ao pacote." : "Sessão desligada do pacote.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function changeAppointmentStatusAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  try {
    const appointmentId = z.uuid().parse(formText(formData.get("appointmentId")));
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    const status = parseStatusChange(formText(formData.get("status")));
    const cancelReason =
      status === "cancelled"
        ? parseCancelReason(formText(formData.get("cancelReason")) || null)
        : null;
    await changeAppointmentStatus(sql, actor, appointmentId, status, { cancelReason });
    refreshAgenda(patientId, appointmentId);
    return { ...idleAgendaAction, ok: true, message: "Status atualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelAppointmentAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  if (formData.get("confirm") !== "sim") {
    return { ...idleAgendaAction, message: "Confirme o cancelamento." };
  }
  try {
    const appointmentId = z.uuid().parse(formText(formData.get("appointmentId")));
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    await cancelAppointment(
      sql,
      actor,
      appointmentId,
      parseCancelReason(formText(formData.get("cancelReason")) || null),
    );
    refreshAgenda(patientId, appointmentId);
    return { ...idleAgendaAction, ok: true, message: "Sessão cancelada." };
  } catch (error) {
    return failure(error);
  }
}

export async function undoAppointmentAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  if (formData.get("confirm") !== "sim") {
    return { ...idleAgendaAction, message: "Confirme o desfazer." };
  }
  try {
    const appointmentId = z.uuid().parse(formText(formData.get("appointmentId")));
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    await undoAppointmentStatus(sql, actor, appointmentId);
    refreshAgenda(patientId, appointmentId);
    return { ...idleAgendaAction, ok: true, message: "Alteração desfeita." };
  } catch (error) {
    return failure(error);
  }
}

export async function rescheduleAppointmentAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  if (formData.get("confirm") !== "sim") {
    return { ...idleAgendaAction, message: "Confirme a remarcação." };
  }
  try {
    const appointmentId = z.uuid().parse(formText(formData.get("appointmentId")));
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    const input = parseRescheduleForm({
      date: formText(formData.get("date")),
      time: formText(formData.get("time")),
      durationMinutes: Number(formText(formData.get("durationMinutes"))),
      notes: formText(formData.get("notes")) || null,
    });
    const slot = await clinicDateTime(sql, input.date, input.time, input.durationMinutes);
    const nextId = await rescheduleAppointment(sql, actor, appointmentId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      notes: input.notes,
    });
    refreshAgenda(patientId, nextId);
    redirect(`/consultorio/agenda/${nextId}`);
  } catch (error) {
    unstable_rethrow(error);
    return failure(error);
  }
}

export async function scheduleMakeupAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  try {
    const missedId = z.uuid().parse(formText(formData.get("appointmentId")));
    const patientId = z.uuid().parse(formText(formData.get("patientId")));
    const input = parseMakeupForm({
      date: formText(formData.get("date")),
      time: formText(formData.get("time")),
      durationMinutes: Number(formText(formData.get("durationMinutes"))),
      modality: "in_person",
      notes: formText(formData.get("notes")) || null,
    });
    const slot = await clinicDateTime(sql, input.date, input.time, input.durationMinutes);
    const id = await scheduleMakeup(sql, actor, missedId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      modality: input.modality,
      notes: input.notes,
    });
    refreshAgenda(patientId, id);
    redirect(`/consultorio/agenda/${id}`);
  } catch (error) {
    unstable_rethrow(error);
    return failure(error);
  }
}

export async function updateAgendaSettingsAction(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const actor = await currentActor();
  try {
    await updateAgendaSettings(
      sql,
      actor,
      parseAgendaSettings({
        defaultDurationMinutes: Number(formText(formData.get("defaultDurationMinutes"))),
        locationName: formText(formData.get("locationName")),
        locationAddress: formText(formData.get("locationAddress")),
        reminderSendHour: Number(formText(formData.get("reminderSendHour"))),
      }),
    );
    revalidatePath("/consultorio/agenda");
    revalidatePath("/consultorio/agenda/configuracoes");
    return { ...idleAgendaAction, ok: true, message: "Configurações salvas." };
  } catch (error) {
    return failure(error);
  }
}
