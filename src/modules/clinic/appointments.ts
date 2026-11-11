import type postgres from "postgres";

import { recordAudit } from "@/modules/audit/record";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { assertRole } from "@/modules/identity/server/guard";

import type {
  CreateAppointmentInput,
  MakeupAppointmentInput,
  RescheduleAppointmentInput,
} from "./agenda-schema";
import {
  canChangeAppointmentStatus,
  type AppointmentModality,
  type AppointmentStatus,
  type StatusChangeFromScheduled,
} from "./appointment-status";
import { packageHasSlot } from "./package-balance";
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
  reminderSentAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
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
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
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
): Promise<void> {
  await recordAudit(
    {
      action,
      actorUserId: actor.userId,
      entityType: "appointment",
      entityId,
      ip: actor.ip,
      metadata: {},
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
          makeup_of_id, rescheduled_to_id, notes, reminder_sent_at, created_at, updated_at,
          created_by
        from clinic.appointments
        where id = ${appointmentId}::uuid
        for update
      `
    : await db<AppointmentRow[]>`
        select id, patient_id, package_id, starts_at, ends_at, modality, series_id, status,
          makeup_of_id, rescheduled_to_id, notes, reminder_sent_at, created_at, updated_at,
          created_by
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
      makeup_of_id, rescheduled_to_id, notes, reminder_sent_at, created_at, updated_at,
      created_by
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
): Promise<void> {
  await assertRole(CONSULTORIO_ROLES);
  await runClinicTransaction(db, async (tx) => {
    const current = await loadAppointment(tx, appointmentId, true);
    if (!canChangeAppointmentStatus(current.status, nextStatus)) {
      throw new ClinicRuleError("invalid-transition");
    }
    await tx`
      update clinic.appointments
      set status = ${nextStatus}::clinic.appointment_status
      where id = ${appointmentId}::uuid
    `;
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
): Promise<void> {
  await assertRole(CONSULTORIO_ROLES);
  await changeAppointmentStatus(db, actor, appointmentId, "cancelled");
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
      set status = 'rescheduled'::clinic.appointment_status
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
    const existing = await tx<{ id: string }[]>`
      select id from clinic.appointments where makeup_of_id = ${missedId}::uuid
    `;
    if (existing[0]) throw new ClinicRuleError("makeup-taken");
    const id = await insertAppointment(tx, actor, {
      patientId: missed.patient_id,
      packageId: null,
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
