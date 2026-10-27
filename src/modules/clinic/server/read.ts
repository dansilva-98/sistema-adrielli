import "server-only";

import { headers } from "next/headers";

import { sql } from "@/db/client";
import {
  listPatients,
  loadPatient,
  searchGuardians,
  type GuardianMatch,
  type PatientListItem,
  type PatientRecord,
} from "@/modules/clinic/patients";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { assertRole, requireStaff } from "@/modules/identity/server/guard";
import { clientIp } from "@/modules/identity/staff-session";

export async function readPatientList(filter: {
  query: string;
  archived: boolean;
}): Promise<PatientListItem[]> {
  await assertRole(CONSULTORIO_ROLES);
  return listPatients(sql, filter);
}

export async function readPatient(patientId: string): Promise<PatientRecord | null> {
  await assertRole(CONSULTORIO_ROLES);
  const access = await requireStaff({ roles: CONSULTORIO_ROLES });
  const headerStore = await headers();
  return loadPatient(
    sql,
    { userId: access.userId, ip: clientIp(headerStore) },
    patientId,
  );
}

export async function readGuardianSearch(
  patientId: string,
  query: string,
): Promise<GuardianMatch[]> {
  await assertRole(CONSULTORIO_ROLES);
  return searchGuardians(sql, patientId, query);
}
