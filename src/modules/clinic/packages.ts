import type postgres from "postgres";

import { recordAudit } from "@/modules/audit/record";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { assertRole } from "@/modules/identity/server/guard";

import type { CreatePackageInput } from "./agenda-schema";
import { remainingSessions } from "./package-balance";
import { ClinicRuleError, type Actor } from "./patients";
import { runClinicTransaction } from "./run-transaction";

type Database = postgres.Sql | postgres.TransactionSql;

type PackageRow = {
  id: string;
  patient_id: string;
  total_sessions: number;
  starts_on: string | Date;
  expires_on: string | Date | null;
  price_cents: number | null;
  notes: string | null;
  closed_at: Date | string | null;
  occupied: number;
  consumed: number;
  scheduled: number;
  pending_makeups: number;
};

export type PackageBalance = {
  id: string;
  patientId: string;
  totalSessions: number;
  startsOn: string;
  expiresOn: string | null;
  priceCents: number | null;
  notes: string | null;
  closedAt: Date | string | null;
  occupied: number;
  consumed: number;
  scheduled: number;
  remaining: number;
  pendingMakeups: number;
};

function dateText(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const year = String(value.getUTCFullYear());
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

function mapPackage(row: PackageRow): PackageBalance {
  return {
    id: row.id,
    patientId: row.patient_id,
    totalSessions: row.total_sessions,
    startsOn: dateText(row.starts_on),
    expiresOn: row.expires_on === null ? null : dateText(row.expires_on),
    priceCents: row.price_cents,
    notes: row.notes,
    closedAt: row.closed_at,
    occupied: row.occupied,
    consumed: row.consumed,
    scheduled: row.scheduled,
    remaining: remainingSessions(row.total_sessions, row.occupied),
    pendingMakeups: row.pending_makeups,
  };
}

export async function getPackage(
  db: Database,
  packageId: string,
): Promise<PackageBalance> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<PackageRow[]>`
    select
      p.id,
      p.patient_id,
      p.total_sessions,
      p.starts_on,
      p.expires_on,
      p.price_cents,
      p.notes,
      p.closed_at,
      (
        select count(*)::int
        from clinic.appointments occupied
        where occupied.package_id = p.id
          and occupied.status in ('scheduled', 'completed', 'missed_unnotified')
      ) as occupied,
      (
        select count(*)::int
        from clinic.appointments consumed
        where consumed.package_id = p.id
          and consumed.status in ('completed', 'missed_unnotified')
      ) as consumed,
      (
        select count(*)::int
        from clinic.appointments scheduled
        where scheduled.package_id = p.id
          and scheduled.status = 'scheduled'
      ) as scheduled,
      (
        select count(*)::int
        from clinic.appointments missed
        where missed.package_id = p.id
          and missed.status = 'missed_notified'
          and not exists (
            select 1
            from clinic.appointments makeup
            where makeup.makeup_of_id = missed.id
              and makeup.status not in ('cancelled', 'rescheduled')
          )
      ) as pending_makeups
    from clinic.packages p
    where p.id = ${packageId}::uuid
  `;
  if (!rows[0]) throw new ClinicRuleError("not-found");
  return mapPackage(rows[0]);
}

export async function getPackageBalance(
  db: Database,
  packageId: string,
): Promise<PackageBalance> {
  await assertRole(CONSULTORIO_ROLES);
  return getPackage(db, packageId);
}

export async function listPatientPackages(
  db: Database,
  patientId: string,
): Promise<PackageBalance[]> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<PackageRow[]>`
    select
      p.id,
      p.patient_id,
      p.total_sessions,
      p.starts_on,
      p.expires_on,
      p.price_cents,
      p.notes,
      p.closed_at,
      (
        select count(*)::int
        from clinic.appointments occupied
        where occupied.package_id = p.id
          and occupied.status in ('scheduled', 'completed', 'missed_unnotified')
      ) as occupied,
      (
        select count(*)::int
        from clinic.appointments consumed
        where consumed.package_id = p.id
          and consumed.status in ('completed', 'missed_unnotified')
      ) as consumed,
      (
        select count(*)::int
        from clinic.appointments scheduled
        where scheduled.package_id = p.id
          and scheduled.status = 'scheduled'
      ) as scheduled,
      (
        select count(*)::int
        from clinic.appointments missed
        where missed.package_id = p.id
          and missed.status = 'missed_notified'
          and not exists (
            select 1
            from clinic.appointments makeup
            where makeup.makeup_of_id = missed.id
              and makeup.status not in ('cancelled', 'rescheduled')
          )
      ) as pending_makeups
    from clinic.packages p
    where p.patient_id = ${patientId}::uuid
    order by p.starts_on desc, p.created_at desc
  `;
  return rows.map(mapPackage);
}

export async function createPackage(
  db: postgres.Sql,
  actor: Actor,
  input: CreatePackageInput,
): Promise<string> {
  await assertRole(CONSULTORIO_ROLES);
  return runClinicTransaction(db, async (tx) => {
    const patient = await tx<{ id: string }[]>`
      select id from clinic.patients where id = ${input.patientId}::uuid
    `;
    if (!patient[0]) throw new ClinicRuleError("not-found");
    const rows = await tx<{ id: string }[]>`
      insert into clinic.packages (
        patient_id, total_sessions, starts_on, expires_on, price_cents, notes
      )
      values (
        ${input.patientId}::uuid,
        ${input.totalSessions},
        ${input.startsOn}::date,
        ${input.expiresOn}::date,
        ${input.priceCents},
        ${input.notes}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new ClinicRuleError("not-found");
    await recordAudit(
      {
        action: "clinic.package.created",
        actorUserId: actor.userId,
        entityType: "package",
        entityId: id,
        ip: actor.ip,
        metadata: {},
      },
      tx,
    );
    return id;
  });
}

export async function closePackage(
  db: postgres.Sql,
  actor: Actor,
  packageId: string,
): Promise<void> {
  await assertRole(CONSULTORIO_ROLES);
  await runClinicTransaction(db, async (tx) => {
    const rows = await tx<{ id: string; closed_at: Date | string | null }[]>`
      select id, closed_at
      from clinic.packages
      where id = ${packageId}::uuid
      for update
    `;
    if (!rows[0]) throw new ClinicRuleError("not-found");
    if (rows[0].closed_at) return;
    await tx`
      update clinic.packages
      set closed_at = now()
      where id = ${packageId}::uuid
    `;
    await recordAudit(
      {
        action: "clinic.package.closed",
        actorUserId: actor.userId,
        entityType: "package",
        entityId: packageId,
        ip: actor.ip,
        metadata: {},
      },
      tx,
    );
  });
}
