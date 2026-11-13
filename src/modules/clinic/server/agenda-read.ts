import "server-only";

import type postgres from "postgres";

import { sql } from "@/db/client";
import {
  clinicDayRange,
  getAppointmentDetail,
  listAgendaAppointments,
  listPatientAppointments,
  type AppointmentDetail,
  type AppointmentListItem,
  type AppointmentRecord,
} from "@/modules/clinic/appointments";
import { getAgendaSettings, type AgendaSettings } from "@/modules/clinic/agenda-settings";
import {
  agendaBoardDays,
  agendaBoardStart,
  type AgendaView,
} from "@/modules/clinic/agenda-view";
import { listPatientPackages, type PackageBalance } from "@/modules/clinic/packages";
import { loadPatient, type Actor, type PatientRecord } from "@/modules/clinic/patients";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { assertRole } from "@/modules/identity/server/guard";

type Database = postgres.Sql | postgres.TransactionSql;

export type { AgendaView };

export async function readAgendaBoard(input: {
  view: AgendaView;
  date: string;
}): Promise<AppointmentListItem[]> {
  await assertRole(CONSULTORIO_ROLES);
  const start = agendaBoardStart(input.view, input.date);
  const range = await clinicDayRange(sql, start, agendaBoardDays(input.view));
  return listAgendaAppointments(sql, range);
}

export async function readAppointmentDetail(
  appointmentId: string,
): Promise<AppointmentDetail> {
  await assertRole(CONSULTORIO_ROLES);
  return getAppointmentDetail(sql, appointmentId);
}

export async function readPatientAgenda(
  patientId: string,
  db: Database = sql,
): Promise<{
  appointments: AppointmentRecord[];
  packages: PackageBalance[];
}> {
  await assertRole(CONSULTORIO_ROLES);
  const appointments = await listPatientAppointments(db, patientId);
  const packages = await listPatientPackages(db, patientId);
  return { appointments, packages };
}

export async function readAgendaSettings(): Promise<AgendaSettings> {
  await assertRole(CONSULTORIO_ROLES);
  return getAgendaSettings(sql);
}

export async function readPatientPackages(patientId: string): Promise<PackageBalance[]> {
  await assertRole(CONSULTORIO_ROLES);
  return listPatientPackages(sql, patientId);
}

export async function readNewAppointmentForm(
  db: Database,
  actor: Actor,
  patientId: string,
): Promise<{
  settings: AgendaSettings;
  patient: PatientRecord | null;
  packages: PackageBalance[];
}> {
  await assertRole(CONSULTORIO_ROLES);
  const settings = await getAgendaSettings(db);
  const patient = await loadPatient(db, actor, patientId);
  const packages = await listPatientPackages(db, patientId);
  return { settings, patient, packages };
}
