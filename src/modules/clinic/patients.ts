import type postgres from "postgres";

import { recordAudit } from "@/modules/audit/record";

import type { AttachmentCategory, GuardianRelationship } from "./format";
import { searchText } from "./format";
import type { CreatePatientInput, GuardianInput, PatientInput } from "./schema";

type Database = postgres.Sql | postgres.TransactionSql;

export type Actor = {
  userId: string;
  ip: string | null;
};

export class ClinicRuleError extends Error {
  readonly code:
    | "duplicate"
    | "duplicate-cpf"
    | "invalid-cpf"
    | "invalid-phone"
    | "last-guardian"
    | "already-linked"
    | "not-found"
    | "type"
    | "size";

  constructor(code: ClinicRuleError["code"]) {
    super(code);
    this.name = "ClinicRuleError";
    this.code = code;
  }
}

export type PatientListItem = {
  id: string;
  fullName: string;
  preferredName: string | null;
  birthDate: string;
  guardianName: string | null;
  guardianPhone: string | null;
};

export type PatientGuardian = {
  id: string;
  fullName: string;
  relationship: GuardianRelationship;
  phone: string;
  email: string | null;
  cpf: string | null;
  receivesReminders: boolean;
  isPrimary: boolean;
};

export type PatientAttachment = {
  id: string;
  originalName: string;
  category: AttachmentCategory;
  createdAt: Date | string;
  sizeBytes: number;
  uploadedBy: string;
};

export type PatientRecord = PatientInput & {
  id: string;
  archivedAt: string | null;
  guardians: PatientGuardian[];
  attachments: PatientAttachment[];
};

export type GuardianMatch = {
  id: string;
  fullName: string;
  relationship: GuardianRelationship;
  phone: string;
};

function dateText(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const year = String(value.getFullYear());
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

function mapDatabaseError(error: unknown): ClinicRuleError | null {
  if (error instanceof ClinicRuleError) return error;
  if (!(error instanceof Error)) return null;
  const message = error.message;
  if (message.includes("patient must have a guardian")) {
    return new ClinicRuleError("last-guardian");
  }
  if (
    message.includes("patients_cpf_unique") ||
    message.includes("guardians_cpf_unique")
  ) {
    return new ClinicRuleError("duplicate-cpf");
  }
  if (message.includes("patients_cpf_valid") || message.includes("guardians_cpf_valid")) {
    return new ClinicRuleError("invalid-cpf");
  }
  if (message.includes("guardians_phone_digits"))
    return new ClinicRuleError("invalid-phone");
  if (message.includes("patient_guardians_pkey")) {
    return new ClinicRuleError("already-linked");
  }
  return null;
}

async function transaction<T>(
  db: postgres.Sql,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  try {
    return (await db.begin(async (tx) => work(tx))) as T;
  } catch (error) {
    const mapped = mapDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

async function audit(
  db: Database,
  actor: Actor,
  action:
    | "clinic.patient.created"
    | "clinic.patient.updated"
    | "clinic.patient.archived"
    | "clinic.patient.restored"
    | "clinic.patient.viewed"
    | "clinic.guardian.linked"
    | "clinic.guardian.unlinked"
    | "clinic.guardian.updated",
  entityType: "patient" | "guardian",
  entityId: string,
): Promise<void> {
  await recordAudit(
    {
      action,
      actorUserId: actor.userId,
      entityType,
      entityId,
      ip: actor.ip,
      metadata: {},
    },
    db,
  );
}

export async function listPatients(
  db: Database,
  filter: { query: string; archived: boolean },
): Promise<PatientListItem[]> {
  const query = searchText(filter.query);
  const digits = query.replace(/\D/g, "");
  const rows = await db<
    {
      id: string;
      full_name: string;
      preferred_name: string | null;
      birth_date: string | Date;
      guardian_name: string | null;
      guardian_phone: string | null;
    }[]
  >`
    select
      p.id,
      p.full_name,
      p.preferred_name,
      p.birth_date,
      g.full_name as guardian_name,
      g.phone as guardian_phone
    from clinic.patients p
    left join clinic.patient_guardians link
      on link.patient_id = p.id and link.is_primary
    left join clinic.guardians g on g.id = link.guardian_id
    where (
      ${filter.archived}::boolean = true and p.archived_at is not null
      or ${filter.archived}::boolean = false and p.archived_at is null
    )
      and (
        ${query} = ''
        or p.full_name_search like '%' || clinic.fold_search(${query}) || '%'
        or exists (
          select 1
          from clinic.patient_guardians other_link
          join clinic.guardians other_guardian
            on other_guardian.id = other_link.guardian_id
          where other_link.patient_id = p.id
            and (
              other_guardian.full_name_search like '%' || clinic.fold_search(${query}) || '%'
              or (${digits} <> '' and other_guardian.phone like '%' || ${digits} || '%')
            )
        )
      )
    order by p.full_name_search asc, p.id asc
  `;
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    preferredName: row.preferred_name,
    birthDate: dateText(row.birth_date),
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
  }));
}

async function duplicateId(
  db: Database,
  fullName: string,
  birthDate: string,
): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    select id
    from clinic.patients
    where full_name_search = clinic.fold_search(${fullName})
      and birth_date = ${birthDate}
    limit 1
  `;
  return rows[0]?.id ?? null;
}

async function insertGuardian(db: Database, guardian: GuardianInput): Promise<string> {
  const rows = await db<{ id: string }[]>`
    insert into clinic.guardians (
      full_name, relationship, phone, email, cpf, receives_reminders
    ) values (
      ${guardian.fullName},
      ${guardian.relationship}::clinic.guardian_relationship,
      ${guardian.phone},
      ${guardian.email},
      ${guardian.cpf},
      ${guardian.receivesReminders}
    )
    returning id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("Falha ao gravar o responsável.");
  return id;
}

export async function createPatient(
  db: postgres.Sql,
  actor: Actor,
  input: CreatePatientInput,
): Promise<string> {
  return transaction(db, async (tx) => {
    if (!input.confirmDuplicate) {
      const existing = await duplicateId(tx, input.fullName, input.birthDate);
      if (existing) throw new ClinicRuleError("duplicate");
    }
    const patients = await tx<{ id: string }[]>`
      insert into clinic.patients (
        full_name, preferred_name, birth_date, cpf, school, school_grade,
        referral_source, notes, address_text, created_by
      ) values (
        ${input.fullName},
        ${input.preferredName},
        ${input.birthDate},
        ${input.cpf},
        ${input.school},
        ${input.schoolGrade},
        ${input.referralSource},
        ${input.notes},
        ${input.addressText},
        ${actor.userId}::uuid
      )
      returning id
    `;
    const patientId = patients[0]?.id;
    if (!patientId) throw new Error("Falha ao gravar o paciente.");
    const guardianId = await insertGuardian(tx, input.guardian);
    await tx`
      insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
      values (${patientId}::uuid, ${guardianId}::uuid, true)
    `;
    await audit(tx, actor, "clinic.patient.created", "patient", patientId);
    await audit(tx, actor, "clinic.guardian.linked", "guardian", guardianId);
    return patientId;
  });
}

export async function updatePatient(
  db: postgres.Sql,
  actor: Actor,
  patientId: string,
  input: PatientInput,
): Promise<void> {
  await transaction(db, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update clinic.patients
      set full_name = ${input.fullName},
          preferred_name = ${input.preferredName},
          birth_date = ${input.birthDate},
          cpf = ${input.cpf},
          school = ${input.school},
          school_grade = ${input.schoolGrade},
          referral_source = ${input.referralSource},
          notes = ${input.notes},
          address_text = ${input.addressText}
      where id = ${patientId}::uuid
      returning id
    `;
    if (!rows[0]) throw new ClinicRuleError("not-found");
    await audit(tx, actor, "clinic.patient.updated", "patient", patientId);
  });
}

export async function archivePatient(
  db: postgres.Sql,
  actor: Actor,
  patientId: string,
): Promise<void> {
  await transaction(db, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update clinic.patients
      set archived_at = coalesce(archived_at, now())
      where id = ${patientId}::uuid
      returning id
    `;
    if (!rows[0]) throw new ClinicRuleError("not-found");
    await audit(tx, actor, "clinic.patient.archived", "patient", patientId);
  });
}

export async function restorePatient(
  db: postgres.Sql,
  actor: Actor,
  patientId: string,
): Promise<void> {
  await transaction(db, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update clinic.patients
      set archived_at = null
      where id = ${patientId}::uuid
      returning id
    `;
    if (!rows[0]) throw new ClinicRuleError("not-found");
    await audit(tx, actor, "clinic.patient.restored", "patient", patientId);
  });
}

export async function loadPatient(
  db: Database,
  actor: Actor,
  patientId: string,
): Promise<PatientRecord | null> {
  const rows = await db<
    {
      id: string;
      full_name: string;
      preferred_name: string | null;
      birth_date: string | Date;
      cpf: string | null;
      school: string | null;
      school_grade: string | null;
      referral_source: string | null;
      notes: string | null;
      address_text: string | null;
      archived_at: Date | string | null;
    }[]
  >`
    select
      id, full_name, preferred_name, birth_date, cpf, school, school_grade,
      referral_source, notes, address_text, archived_at
    from clinic.patients
    where id = ${patientId}::uuid
  `;
  const patient = rows[0];
  if (!patient) return null;
  const guardians = await db<
    {
      id: string;
      full_name: string;
      relationship: GuardianRelationship;
      phone: string;
      email: string | null;
      cpf: string | null;
      receives_reminders: boolean;
      is_primary: boolean;
    }[]
  >`
    select
      g.id, g.full_name, g.relationship, g.phone, g.email, g.cpf,
      g.receives_reminders, link.is_primary
    from clinic.patient_guardians link
    join clinic.guardians g on g.id = link.guardian_id
    where link.patient_id = ${patientId}::uuid
    order by link.is_primary desc, g.full_name_search asc
  `;
  const attachments = await db<
    {
      id: string;
      original_name: string;
      category: AttachmentCategory;
      created_at: Date | string;
      size_bytes: number;
      uploaded_by_name: string | null;
    }[]
  >`
    select
      a.id, a.original_name, a.category, a.created_at, a.size_bytes,
      u.display_name as uploaded_by_name
    from clinic.patient_attachments a
    left join identity.users u on u.id = a.uploaded_by
    where a.patient_id = ${patientId}::uuid
      and a.deleted_at is null
    order by a.created_at desc
  `;
  await audit(db, actor, "clinic.patient.viewed", "patient", patientId);
  return {
    id: patient.id,
    fullName: patient.full_name,
    preferredName: patient.preferred_name,
    birthDate: dateText(patient.birth_date),
    cpf: patient.cpf,
    school: patient.school,
    schoolGrade: patient.school_grade,
    referralSource: patient.referral_source,
    notes: patient.notes,
    addressText: patient.address_text,
    archivedAt: patient.archived_at ? String(patient.archived_at) : null,
    guardians: guardians.map((guardian) => ({
      id: guardian.id,
      fullName: guardian.full_name,
      relationship: guardian.relationship,
      phone: guardian.phone,
      email: guardian.email,
      cpf: guardian.cpf,
      receivesReminders: guardian.receives_reminders,
      isPrimary: guardian.is_primary,
    })),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.original_name,
      category: attachment.category,
      createdAt: attachment.created_at,
      sizeBytes: attachment.size_bytes,
      uploadedBy: attachment.uploaded_by_name ?? "Equipe",
    })),
  };
}

export async function searchGuardians(
  db: Database,
  patientId: string,
  query: string,
): Promise<GuardianMatch[]> {
  const text = searchText(query);
  const digits = text.replace(/\D/g, "");
  if (text.length < 2 && digits.length < 3) return [];
  return db<GuardianMatch[]>`
    select g.id, g.full_name as "fullName", g.relationship, g.phone
    from clinic.guardians g
    where not exists (
      select 1
      from clinic.patient_guardians link
      where link.patient_id = ${patientId}::uuid
        and link.guardian_id = g.id
    )
      and (
        g.full_name_search like '%' || clinic.fold_search(${text}) || '%'
        or (${digits} <> '' and g.phone like '%' || ${digits} || '%')
      )
    order by g.full_name_search asc
    limit 8
  `;
}

export async function addGuardian(
  db: postgres.Sql,
  actor: Actor,
  patientId: string,
  guardian: GuardianInput,
): Promise<void> {
  await transaction(db, async (tx) => {
    const patient = await tx<{ id: string }[]>`
      select id from clinic.patients where id = ${patientId}::uuid
    `;
    if (!patient[0]) throw new ClinicRuleError("not-found");
    const guardianId = await insertGuardian(tx, guardian);
    const primary = await tx<{ present: boolean }[]>`
      select exists (
        select 1 from clinic.patient_guardians
        where patient_id = ${patientId}::uuid and is_primary
      ) as present
    `;
    await tx`
      insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
      values (${patientId}::uuid, ${guardianId}::uuid, ${primary[0]?.present !== true})
    `;
    await audit(tx, actor, "clinic.guardian.linked", "guardian", guardianId);
  });
}

export async function linkGuardian(
  db: postgres.Sql,
  actor: Actor,
  patientId: string,
  guardianId: string,
): Promise<void> {
  await transaction(db, async (tx) => {
    const primary = await tx<{ present: boolean }[]>`
      select exists (
        select 1 from clinic.patient_guardians
        where patient_id = ${patientId}::uuid and is_primary
      ) as present
    `;
    await tx`
      insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
      values (
        ${patientId}::uuid,
        ${guardianId}::uuid,
        ${primary[0]?.present !== true}
      )
    `;
    await audit(tx, actor, "clinic.guardian.linked", "guardian", guardianId);
  });
}

export async function setPrimaryGuardian(
  db: postgres.Sql,
  actor: Actor,
  patientId: string,
  guardianId: string,
): Promise<void> {
  await transaction(db, async (tx) => {
    const linked = await tx<{ guardian_id: string }[]>`
      select guardian_id
      from clinic.patient_guardians
      where patient_id = ${patientId}::uuid
        and guardian_id = ${guardianId}::uuid
    `;
    if (!linked[0]) throw new ClinicRuleError("not-found");
    await tx`
      update clinic.patient_guardians
      set is_primary = false
      where patient_id = ${patientId}::uuid
        and is_primary
    `;
    await tx`
      update clinic.patient_guardians
      set is_primary = true
      where patient_id = ${patientId}::uuid
        and guardian_id = ${guardianId}::uuid
    `;
    await audit(tx, actor, "clinic.guardian.updated", "guardian", guardianId);
  });
}

export async function unlinkGuardian(
  db: postgres.Sql,
  actor: Actor,
  patientId: string,
  guardianId: string,
): Promise<void> {
  await transaction(db, async (tx) => {
    const rows = await tx<{ guardian_id: string; is_primary: boolean }[]>`
      select guardian_id, is_primary
      from clinic.patient_guardians
      where patient_id = ${patientId}::uuid
    `;
    if (rows.length <= 1) throw new ClinicRuleError("last-guardian");
    if (!rows.some((row) => row.guardian_id === guardianId)) {
      throw new ClinicRuleError("not-found");
    }
    await tx`
      delete from clinic.patient_guardians
      where patient_id = ${patientId}::uuid
        and guardian_id = ${guardianId}::uuid
    `;
    const stillPrimary = rows.some(
      (row) => row.guardian_id !== guardianId && row.is_primary,
    );
    if (!stillPrimary) {
      await tx`
        update clinic.patient_guardians
        set is_primary = true
        where patient_id = ${patientId}::uuid
          and guardian_id = (
            select guardian_id
            from clinic.patient_guardians
            where patient_id = ${patientId}::uuid
            order by guardian_id
            limit 1
          )
      `;
    }
    await audit(tx, actor, "clinic.guardian.unlinked", "guardian", guardianId);
  });
}
