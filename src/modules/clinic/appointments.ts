import type postgres from "postgres";

import { recordAudit } from "@/modules/audit/record";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { assertRole } from "@/modules/identity/server/guard";

import type {
  CreateAppointmentInput,
  MakeupAppointmentInput,
  RescheduleAppointmentInput,
} from "./agenda-schema";
import { parseCancelReason } from "./agenda-schema";
import {
  canChangeAppointmentStatus,
  canUndoAppointmentStatus,
  occupiesPackageSlot,
  sameClinicDay,
  type AppointmentModality,
  type AppointmentStatus,
  type StatusChangeFromScheduled,
} from "./appointment-status";
import { packageHasSlot, remainingSessions } from "./package-balance";
import { ClinicRuleError, type Actor } from "./patients";
import { runClinicTransaction } from "./run-transaction";

type Database = postgres.Sql | postgres.TransactionSql;

type AppointmentRow = {
  id: string;
  patient_id: string;
  package_id: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  modality: AppointmentModality;
  series_id: string | null;
  status: AppointmentStatus;
  makeup_of_id: string | null;
  rescheduled_to_id: string | null;
  notes: string | null;
  cancel_reason: string | null;
  status_changed_at: Date | string | null;
  reminder_sent_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string;
};

export type AppointmentRecord = {
  id: string;
  patientId: string;
  packageId: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  modality: AppointmentModality;
  seriesId: string | null;
  status: AppointmentStatus;
  makeupOfId: string | null;
  rescheduledToId: string | null;
  notes: string | null;
  cancelReason: string | null;
  statusChangedAt: Date | string | null;
  reminderSentAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
};

export type AppointmentListItem = AppointmentRecord & {
  patientName: string;
};

export type AppointmentDetail = AppointmentListItem & {
  hasActiveMakeup: boolean;
};

export type SeriesSlotPreview = {
  startsAt: Date;
  endsAt: Date;
  conflict: boolean;
};

function mapAppointment(row: AppointmentRow): AppointmentRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    packageId: row.package_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    modality: row.modality,
    seriesId: row.series_id,
    status: row.status,
    makeupOfId: row.makeup_of_id,
    rescheduledToId: row.rescheduled_to_id,
    notes: row.notes,
    cancelReason: row.cancel_reason,
    statusChangedAt: row.status_changed_at,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function asDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

async function audit(
  tx: postgres.TransactionSql,
  actor: Actor,
  action:
    | "clinic.appointment.created"
    | "clinic.appointment.status_changed"
    | "clinic.appointment.rescheduled"
    | "clinic.appointment.cancelled",
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await recordAudit(
    {
      action,
      actorUserId: actor.userId,
      entityType: "appointment",
      entityId,
      ip: actor.ip,
      metadata,
    },
    tx,
  );
}

async function loadAppointment(
  db: Database,
  appointmentId: string,
  forUpdate = false,
): Promise<AppointmentRow> {
  const rows = forUpdate
    ? await db<AppointmentRow[]>`
        select id, patient_id, package_id, starts_at, ends_at, modality, series_id, status,
          makeup_of_id, rescheduled_to_id, notes, cancel_reason, status_changed_at,
          reminder_sent_at, created_at, updated_at, created_by
        from clinic.appointments
        where id = ${appointmentId}::uuid
        for update
      `
    : await db<AppointmentRow[]>`
        select id, patient_id, package_id, starts_at, ends_at, modality, series_id, status,
          makeup_of_id, rescheduled_to_id, notes, cancel_reason, status_changed_at,
          reminder_sent_at, created_at, updated_at, created_by
        from clinic.appointments
        where id = ${appointmentId}::uuid
      `;
  if (!rows[0]) throw new ClinicRuleError("not-found");
  return rows[0];
}

async function assertPatientExists(tx: Database, patientId: string): Promise<void> {
  const rows = await tx<{ id: string }[]>`
    select id from clinic.patients where id = ${patientId}::uuid
  `;
  if (!rows[0]) throw new ClinicRuleError("not-found");
}

async function occupiedForPackage(tx: Database, packageId: string): Promise<number> {
  const rows = await tx<{ occupied: number }[]>`
    select count(*)::int as occupied
    from clinic.appointments
    where package_id = ${packageId}::uuid
      and status in ('scheduled', 'completed', 'missed_unnotified')
  `;
  return rows[0]?.occupied ?? 0;
}

async function assertPackageAcceptsSession(
  tx: postgres.TransactionSql,
  packageId: string,
  patientId: string,
): Promise<void> {
  const rows = await tx<
    {
      id: string;
      patient_id: string;
      total_sessions: number;
      closed_at: Date | string | null;
    }[]
  >`
    select id, patient_id, total_sessions, closed_at
    from clinic.packages
    where id = ${packageId}::uuid
    for update
  `;
  const pkg = rows[0];
  if (!pkg) throw new ClinicRuleError("not-found");
  if (pkg.patient_id !== patientId) throw new ClinicRuleError("package-patient-mismatch");
  if (pkg.closed_at) throw new ClinicRuleError("package-exhausted");
  const occupied = await occupiedForPackage(tx, packageId);
  if (!packageHasSlot(pkg.total_sessions, occupied)) {
    throw new ClinicRuleError("package-exhausted");
  }
}

async function activeMakeupId(tx: Database, missedId: string): Promise<string | null> {
  const rows = await tx<{ id: string }[]>`
    select id
    from clinic.appointments
    where makeup_of_id = ${missedId}::uuid
      and status not in ('cancelled', 'rescheduled')
  `;
  return rows[0]?.id ?? null;
}

async function insertAppointment(
  tx: postgres.TransactionSql,
  actor: Actor,
  input: {
    patientId: string;
    packageId: string | null;
    startsAt: Date;
    endsAt: Date;
    modality: AppointmentModality;
    seriesId: string | null;
    notes: string | null;
    makeupOfId?: string | null;
  },
): Promise<string> {
  const rows = await tx<{ id: string }[]>`
    insert into clinic.appointments (
      patient_id, package_id, starts_at, ends_at, modality, series_id, notes,
      makeup_of_id, created_by
    )
    values (
      ${input.patientId}::uuid,
      ${input.packageId}::uuid,
      ${input.startsAt},
      ${input.endsAt},
      ${input.modality}::clinic.appointment_modality,
      ${input.seriesId}::uuid,
      ${input.notes},
      ${input.makeupOfId ?? null}::uuid,
      ${actor.userId}::uuid
    )
    returning id
  `;
  const id = rows[0]?.id;
  if (!id) throw new ClinicRuleError("not-found");
  return id;
}

export async function getAppointment(
  db: Database,
  appointmentId: string,
): Promise<AppointmentRecord> {
  await assertRole(CONSULTORIO_ROLES);
  return mapAppointment(await loadAppointment(db, appointmentId));
}

export async function listAppointments(
  db: Database,
  range: { from: Date; to: Date },
): Promise<AppointmentRecord[]> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<AppointmentRow[]>`
    select id, patient_id, package_id, starts_at, ends_at, modality, series_id, status,
      makeup_of_id, rescheduled_to_id, notes, cancel_reason, status_changed_at,
      reminder_sent_at, created_at, updated_at, created_by
    from clinic.appointments
    where starts_at < ${range.to}
      and ends_at > ${range.from}
    order by starts_at, id
  `;
  return rows.map(mapAppointment);
}

export async function createAppointment(
  db: postgres.Sql,
  actor: Actor,
  input: CreateAppointmentInput,
): Promise<string> {
  await assertRole(CONSULTORIO_ROLES);
  return runClinicTransaction(db, async (tx) => {
    await assertPatientExists(tx, input.patientId);
    if (input.packageId) {
      await assertPackageAcceptsSession(tx, input.packageId, input.patientId);
    }
    const id = await insertAppointment(tx, actor, input);
    await audit(tx, actor, "clinic.appointment.created", id);
    return id;
  });
}

export async function changeAppointmentStatus(
  db: postgres.Sql,
  actor: Actor,
  appointmentId: string,
  nextStatus: StatusChangeFromScheduled,
  options?: { cancelReason?: string | null },
): Promise<void> {
  await assertRole(CONSULTORIO_ROLES);
  const cancelReason =
    nextStatus === "cancelled" ? parseCancelReason(options?.cancelReason ?? null) : null;
  await runClinicTransaction(db, async (tx) => {
    const current = await loadAppointment(tx, appointmentId, true);
    if (!canChangeAppointmentStatus(current.status, nextStatus)) {
      throw new ClinicRuleError("invalid-transition");
    }
    if (nextStatus === "cancelled") {
      await tx`
        update clinic.appointments
        set
          status = ${nextStatus}::clinic.appointment_status,
          status_changed_at = now(),
          cancel_reason = ${cancelReason}
        where id = ${appointmentId}::uuid
      `;
    } else {
      await tx`
        update clinic.appointments
        set
          status = ${nextStatus}::clinic.appointment_status,
          status_changed_at = now()
        where id = ${appointmentId}::uuid
      `;
    }
    const action =
      nextStatus === "cancelled"
        ? "clinic.appointment.cancelled"
        : "clinic.appointment.status_changed";
    await audit(tx, actor, action, appointmentId);
  });
}

export async function cancelAppointment(
  db: postgres.Sql,
  actor: Actor,
  appointmentId: string,
  cancelReason: string | null = null,
): Promise<void> {
  await assertRole(CONSULTORIO_ROLES);
  await changeAppointmentStatus(db, actor, appointmentId, "cancelled", { cancelReason });
}

export async function rescheduleAppointment(
  db: postgres.Sql,
  actor: Actor,
  appointmentId: string,
  input: RescheduleAppointmentInput,
): Promise<string> {
  await assertRole(CONSULTORIO_ROLES);
  return runClinicTransaction(db, async (tx) => {
    const original = await loadAppointment(tx, appointmentId, true);
    if (original.status !== "scheduled") {
      throw new ClinicRuleError("invalid-transition");
    }
    if (original.package_id) {
      const pkg = await tx<{ id: string }[]>`
        select id from clinic.packages where id = ${original.package_id}::uuid for update
      `;
      if (!pkg[0]) throw new ClinicRuleError("not-found");
    }
    await tx`
      update clinic.appointments
      set
        status = 'rescheduled'::clinic.appointment_status,
        status_changed_at = now()
      where id = ${appointmentId}::uuid
    `;
    const nextId = await insertAppointment(tx, actor, {
      patientId: original.patient_id,
      packageId: original.package_id,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      modality: original.modality,
      seriesId: original.series_id,
      notes: input.notes,
      makeupOfId: original.makeup_of_id,
    });
    await tx`
      update clinic.appointments
      set rescheduled_to_id = ${nextId}::uuid
      where id = ${appointmentId}::uuid
    `;
    await audit(tx, actor, "clinic.appointment.created", nextId);
    await audit(tx, actor, "clinic.appointment.rescheduled", appointmentId);
    return nextId;
  });
}

export async function scheduleMakeup(
  db: postgres.Sql,
  actor: Actor,
  missedId: string,
  input: MakeupAppointmentInput,
): Promise<string> {
  await assertRole(CONSULTORIO_ROLES);
  return runClinicTransaction(db, async (tx) => {
    const missed = await loadAppointment(tx, missedId, true);
    if (missed.status !== "missed_notified") {
      throw new ClinicRuleError("makeup-not-allowed");
    }
    if (await activeMakeupId(tx, missedId)) {
      throw new ClinicRuleError("makeup-taken");
    }
    if (missed.package_id) {
      await assertPackageAcceptsSession(tx, missed.package_id, missed.patient_id);
    }
    const id = await insertAppointment(tx, actor, {
      patientId: missed.patient_id,
      packageId: missed.package_id,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      modality: input.modality,
      seriesId: null,
      notes: input.notes,
      makeupOfId: missedId,
    });
    await audit(tx, actor, "clinic.appointment.created", id);
    return id;
  });
}

export async function undoAppointmentStatus(
  db: postgres.Sql,
  actor: Actor,
  appointmentId: string,
  options?: { now?: Date },
): Promise<void> {
  await assertRole(CONSULTORIO_ROLES);
  const now = options?.now ?? new Date();
  await runClinicTransaction(db, async (tx) => {
    const current = await loadAppointment(tx, appointmentId, true);
    if (!canUndoAppointmentStatus(current.status)) {
      throw new ClinicRuleError("invalid-transition");
    }
    const changedAt = asDate(current.status_changed_at);
    if (!changedAt || !sameClinicDay(changedAt, now)) {
      throw new ClinicRuleError("undo-not-allowed");
    }
    if (current.status === "missed_notified" && (await activeMakeupId(tx, current.id))) {
      throw new ClinicRuleError("undo-not-allowed");
    }
    if (current.makeup_of_id) {
      const origin = await loadAppointment(tx, current.makeup_of_id, true);
      if (origin.status !== "missed_notified") {
        throw new ClinicRuleError("undo-not-allowed");
      }
    }
    if (!occupiesPackageSlot(current.status) && current.package_id) {
      await assertPackageAcceptsSession(tx, current.package_id, current.patient_id);
    }
    if (current.status === "cancelled") {
      await tx`
        update clinic.appointments
        set
          status = 'scheduled'::clinic.appointment_status,
          status_changed_at = now(),
          cancel_reason = null
        where id = ${appointmentId}::uuid
      `;
    } else {
      await tx`
        update clinic.appointments
        set
          status = 'scheduled'::clinic.appointment_status,
          status_changed_at = now()
        where id = ${appointmentId}::uuid
      `;
    }
    await audit(tx, actor, "clinic.appointment.status_changed", appointmentId, {
      from: current.status,
      to: "scheduled",
      undo: true,
    });
  });
}

type NamedAppointmentRow = AppointmentRow & {
  full_name: string;
  preferred_name: string | null;
};

function mapNamedAppointment(row: NamedAppointmentRow): AppointmentListItem {
  return {
    ...mapAppointment(row),
    patientName: row.preferred_name?.trim() || row.full_name,
  };
}

async function slotConflicts(
  db: Database,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  const rows = await db<{ taken: boolean }[]>`
    select exists (
      select 1
      from clinic.appointments
      where status in ('scheduled', 'completed')
        and starts_at < ${endsAt}
        and ends_at > ${startsAt}
    ) as taken
  `;
  return Boolean(rows[0]?.taken);
}

export async function clinicDateTime(
  db: Database,
  date: string,
  time: string,
  durationMinutes: number,
): Promise<{ startsAt: Date; endsAt: Date }> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<{ starts_at: Date; ends_at: Date }[]>`
    select
      timezone(
        'America/Sao_Paulo',
        ${date}::date + ${time}::time
      ) as starts_at,
      timezone(
        'America/Sao_Paulo',
        ${date}::date + ${time}::time
      ) + make_interval(mins => ${durationMinutes}) as ends_at
  `;
  const slot = rows[0];
  if (!slot) throw new ClinicRuleError("not-found");
  return { startsAt: slot.starts_at, endsAt: slot.ends_at };
}

export async function clinicWeeklySlots(
  db: Database,
  date: string,
  time: string,
  durationMinutes: number,
  weeks: number,
): Promise<{ startsAt: Date; endsAt: Date }[]> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<{ starts_at: Date; ends_at: Date }[]>`
    select
      timezone(
        'America/Sao_Paulo',
        (${date}::date + (week.n * 7)) + ${time}::time
      ) as starts_at,
      timezone(
        'America/Sao_Paulo',
        (${date}::date + (week.n * 7)) + ${time}::time
      ) + make_interval(mins => ${durationMinutes}) as ends_at
    from generate_series(0, ${weeks - 1}) as week(n)
    order by week.n
  `;
  return rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at }));
}

export async function clinicDayRange(
  db: Database,
  date: string,
  days: number,
): Promise<{ from: Date; to: Date }> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<{ range_from: Date; range_to: Date }[]>`
    select
      timezone('America/Sao_Paulo', ${date}::date::timestamp) as range_from,
      timezone(
        'America/Sao_Paulo',
        (${date}::date + ${days}::int)::timestamp
      ) as range_to
  `;
  const range = rows[0];
  if (!range) throw new ClinicRuleError("not-found");
  return { from: range.range_from, to: range.range_to };
}

export async function listAgendaAppointments(
  db: Database,
  range: { from: Date; to: Date },
): Promise<AppointmentListItem[]> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<NamedAppointmentRow[]>`
    select
      a.id, a.patient_id, a.package_id, a.starts_at, a.ends_at, a.modality, a.series_id,
      a.status, a.makeup_of_id, a.rescheduled_to_id, a.notes, a.cancel_reason,
      a.status_changed_at, a.reminder_sent_at, a.created_at, a.updated_at, a.created_by,
      p.full_name, p.preferred_name
    from clinic.appointments a
    join clinic.patients p on p.id = a.patient_id
    where a.starts_at < ${range.to}
      and a.ends_at > ${range.from}
    order by a.starts_at, a.id
  `;
  return rows.map(mapNamedAppointment);
}

export async function listPatientAppointments(
  db: Database,
  patientId: string,
): Promise<AppointmentRecord[]> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<AppointmentRow[]>`
    select id, patient_id, package_id, starts_at, ends_at, modality, series_id, status,
      makeup_of_id, rescheduled_to_id, notes, cancel_reason, status_changed_at,
      reminder_sent_at, created_at, updated_at, created_by
    from clinic.appointments
    where patient_id = ${patientId}::uuid
    order by starts_at desc, id
  `;
  return rows.map(mapAppointment);
}

export async function getAppointmentDetail(
  db: Database,
  appointmentId: string,
): Promise<AppointmentDetail> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<(NamedAppointmentRow & { has_active_makeup: boolean })[]>`
    select
      a.id, a.patient_id, a.package_id, a.starts_at, a.ends_at, a.modality, a.series_id,
      a.status, a.makeup_of_id, a.rescheduled_to_id, a.notes, a.cancel_reason,
      a.status_changed_at, a.reminder_sent_at, a.created_at, a.updated_at, a.created_by,
      p.full_name, p.preferred_name,
      exists (
        select 1
        from clinic.appointments makeup
        where makeup.makeup_of_id = a.id
          and makeup.status not in ('cancelled', 'rescheduled')
      ) as has_active_makeup
    from clinic.appointments a
    join clinic.patients p on p.id = a.patient_id
    where a.id = ${appointmentId}::uuid
  `;
  if (!rows[0]) throw new ClinicRuleError("not-found");
  return {
    ...mapNamedAppointment(rows[0]),
    hasActiveMakeup: Boolean(rows[0].has_active_makeup),
  };
}

export async function previewAppointmentSeries(
  db: Database,
  slots: { startsAt: Date; endsAt: Date }[],
): Promise<SeriesSlotPreview[]> {
  await assertRole(CONSULTORIO_ROLES);
  const preview: SeriesSlotPreview[] = [];
  for (const slot of slots) {
    preview.push({
      ...slot,
      conflict: await slotConflicts(db, slot.startsAt, slot.endsAt),
    });
  }
  return preview;
}

export async function createAppointmentSeries(
  db: postgres.Sql,
  actor: Actor,
  input: CreateAppointmentInput & { slots: { startsAt: Date; endsAt: Date }[] },
  options: { skipConflicts: boolean; unlinkedCount?: number },
): Promise<string[]> {
  await assertRole(CONSULTORIO_ROLES);
  return runClinicTransaction(db, async (tx) => {
    await assertPatientExists(tx, input.patientId);
    const preview: SeriesSlotPreview[] = [];
    for (const slot of input.slots) {
      preview.push({
        ...slot,
        conflict: await slotConflicts(tx, slot.startsAt, slot.endsAt),
      });
    }
    const free = preview.filter((slot) => !slot.conflict);
    if (!options.skipConflicts && preview.some((slot) => slot.conflict)) {
      throw new ClinicRuleError("series-conflict");
    }
    if (free.length === 0) throw new ClinicRuleError("series-conflict");
    let remaining = 0;
    if (input.packageId) {
      const pkg = await tx<
        {
          id: string;
          patient_id: string;
          total_sessions: number;
          closed_at: Date | string | null;
        }[]
      >`
        select id, patient_id, total_sessions, closed_at
        from clinic.packages
        where id = ${input.packageId}::uuid
        for update
      `;
      const current = pkg[0];
      if (!current) throw new ClinicRuleError("not-found");
      if (current.patient_id !== input.patientId) {
        throw new ClinicRuleError("package-patient-mismatch");
      }
      if (current.closed_at) throw new ClinicRuleError("package-exhausted");
      const occupied = await occupiedForPackage(tx, input.packageId);
      remaining = remainingSessions(current.total_sessions, occupied);
      if (remaining <= 0) throw new ClinicRuleError("package-exhausted");
      const overflow = Math.max(0, free.length - remaining);
      if (overflow > 0 && overflow !== (options.unlinkedCount ?? 0)) {
        throw new ClinicRuleError("package-overflow", overflow);
      }
    }
    const seriesId = crypto.randomUUID();
    const ids: string[] = [];
    let linked = 0;
    for (const slot of free) {
      const usePackage = Boolean(input.packageId) && linked < remaining;
      const id = await insertAppointment(tx, actor, {
        patientId: input.patientId,
        packageId: usePackage ? input.packageId : null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        modality: input.modality,
        seriesId,
        notes: input.notes,
      });
      if (usePackage) linked += 1;
      await audit(tx, actor, "clinic.appointment.created", id);
      ids.push(id);
    }
    return ids;
  });
}

async function lockPackage(
  tx: postgres.TransactionSql,
  packageId: string,
): Promise<void> {
  const rows = await tx<{ id: string }[]>`
    select id
    from clinic.packages
    where id = ${packageId}::uuid
    for update
  `;
  if (!rows[0]) throw new ClinicRuleError("not-found");
}

export async function setAppointmentPackage(
  db: postgres.Sql,
  actor: Actor,
  appointmentId: string,
  packageId: string | null,
): Promise<void> {
  await assertRole(CONSULTORIO_ROLES);
  await runClinicTransaction(db, async (tx) => {
    const current = await loadAppointment(tx, appointmentId, true);
    if (current.status !== "scheduled") {
      throw new ClinicRuleError("invalid-transition");
    }
    if (current.makeup_of_id) throw new ClinicRuleError("makeup-not-allowed");
    if (packageId !== null && current.package_id === packageId) return;
    if (packageId === null && !current.package_id) {
      throw new ClinicRuleError("invalid-transition");
    }
    if (current.package_id) {
      await lockPackage(tx, current.package_id);
      await tx`
        update clinic.appointments
        set package_id = null
        where id = ${appointmentId}::uuid
      `;
    }
    if (packageId === null) return;
    await assertPackageAcceptsSession(tx, packageId, current.patient_id);
    await tx`
      update clinic.appointments
      set package_id = ${packageId}::uuid
      where id = ${appointmentId}::uuid
    `;
  });
}
