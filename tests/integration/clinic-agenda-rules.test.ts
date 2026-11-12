import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/identity/server/guard", () => ({
  assertRole: async () => {},
  requireStaff: async () => {
    throw new Error("requireStaff");
  },
  StaffAccessError: class StaffAccessError extends Error {
    reason = "forbidden";
  },
}));

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import { parseCancelReason } from "../../src/modules/clinic/agenda-schema";
import { updateAgendaSettings } from "../../src/modules/clinic/agenda-settings";
import {
  cancelAppointment,
  changeAppointmentStatus,
  createAppointment,
  getAppointment,
  rescheduleAppointment,
  scheduleMakeup,
  undoAppointmentStatus,
} from "../../src/modules/clinic/appointments";
import type { Actor } from "../../src/modules/clinic/patients";
import {
  closePackage,
  createPackage,
  getPackageBalance,
} from "../../src/modules/clinic/packages";

const STAFF_ID = "b1111111-1111-4111-8111-111111111111";
const PATIENT_ID = "b2222222-2222-4222-8222-222222222222";
const OTHER_PATIENT_ID = "b2222222-2222-4222-8222-222222222223";
const GUARDIAN_ID = "b3333333-3333-4333-8333-333333333333";
const ACTOR: Actor = { userId: STAFF_ID, ip: null };

function slot(day: string, hour: number, minutes = 50): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`);
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
  return { startsAt, endsAt };
}

describe("regras da agenda e do pacote", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${STAFF_ID}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${STAFF_ID}::uuid, 'STAFF', 'agenda-rules@example.com', 'Staff')
    `;
    await runtime.begin(async (transaction) => {
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (${PATIENT_ID}::uuid, 'Paciente Regras', '2018-01-02', ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.guardians (id, full_name, relationship, phone)
        values (${GUARDIAN_ID}::uuid, 'Responsavel Regras', 'MOTHER', '11922223333')
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_ID}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (${OTHER_PATIENT_ID}::uuid, 'Outro Paciente Regras', '2016-05-06', ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${OTHER_PATIENT_ID}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
    });
  });

  afterAll(async () => {
    await owner`alter table audit.audit_log disable trigger audit_log_immutable`;
    await owner`delete from audit.audit_log where actor_user_id = ${STAFF_ID}::uuid`;
    await owner`alter table audit.audit_log enable trigger audit_log_immutable`;
    await owner`delete from clinic.appointments where created_by = ${STAFF_ID}::uuid`;
    await owner`
      delete from clinic.packages
      where patient_id in (${PATIENT_ID}::uuid, ${OTHER_PATIENT_ID}::uuid)
    `;
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    try {
      await owner`
        delete from clinic.patient_guardians
        where patient_id in (${PATIENT_ID}::uuid, ${OTHER_PATIENT_ID}::uuid)
      `;
      await owner`
        delete from clinic.patients
        where id in (${PATIENT_ID}::uuid, ${OTHER_PATIENT_ID}::uuid)
      `;
      await owner`delete from clinic.guardians where id = ${GUARDIAN_ID}::uuid`;
    } finally {
      await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
    }
    await owner`
      update clinic.settings
      set
        default_duration_minutes = 50,
        location_name = '',
        location_address = '',
        reminder_send_hour = 9,
        updated_by = null
      where id = 1
    `;
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
  });

  it("A3: conta o pacote por status e gera reposição na falta avisada", async () => {
    const packageId = await createPackage(runtime, ACTOR, {
      patientId: PATIENT_ID,
      totalSessions: 3,
      startsOn: "2027-04-01",
      expiresOn: null,
      priceCents: 150000,
      notes: null,
    });
    const otherPackageId = await createPackage(runtime, ACTOR, {
      patientId: OTHER_PATIENT_ID,
      totalSessions: 1,
      startsOn: "2027-04-01",
      expiresOn: null,
      priceCents: null,
      notes: null,
    });

    await expect(
      createAppointment(runtime, ACTOR, {
        patientId: PATIENT_ID,
        packageId: otherPackageId,
        ...slot("2027-04-01", 11),
        modality: "in_person",
        seriesId: null,
        notes: null,
      }),
    ).rejects.toMatchObject({
      name: "ClinicRuleError",
      code: "package-patient-mismatch",
    });

    const first = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId,
      ...slot("2027-04-01", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    const second = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId,
      ...slot("2027-04-01", 13),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    const third = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId,
      ...slot("2027-04-01", 15),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await expect(
      createAppointment(runtime, ACTOR, {
        patientId: PATIENT_ID,
        packageId,
        ...slot("2027-04-01", 17),
        modality: "in_person",
        seriesId: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "package-exhausted" });

    let balance = await getPackageBalance(runtime, packageId);
    expect(balance).toMatchObject({
      occupied: 3,
      consumed: 0,
      scheduled: 3,
      remaining: 0,
      pendingMakeups: 0,
    });

    await changeAppointmentStatus(runtime, ACTOR, first, "completed");
    await changeAppointmentStatus(runtime, ACTOR, second, "missed_unnotified");
    await changeAppointmentStatus(runtime, ACTOR, third, "missed_notified");
    balance = await getPackageBalance(runtime, packageId);
    expect(balance).toMatchObject({
      occupied: 2,
      consumed: 2,
      scheduled: 0,
      remaining: 1,
      pendingMakeups: 1,
    });

    const makeupId = await scheduleMakeup(runtime, ACTOR, third, {
      ...slot("2027-04-08", 11),
      modality: "online",
      notes: null,
    });
    const makeup = await getAppointment(runtime, makeupId);
    expect(makeup.packageId).toBe(packageId);
    expect(makeup.makeupOfId).toBe(third);
    expect(makeup.modality).toBe("online");
    balance = await getPackageBalance(runtime, packageId);
    expect(balance.pendingMakeups).toBe(0);
    expect(balance.occupied).toBe(3);
    expect(balance.remaining).toBe(0);

    await expect(
      scheduleMakeup(runtime, ACTOR, third, {
        ...slot("2027-04-09", 11),
        modality: "in_person",
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "makeup-taken" });
    await expect(
      scheduleMakeup(runtime, ACTOR, first, {
        ...slot("2027-04-09", 13),
        modality: "in_person",
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "makeup-not-allowed" });

    await closePackage(runtime, ACTOR, packageId);
    await expect(
      createAppointment(runtime, ACTOR, {
        patientId: PATIENT_ID,
        packageId,
        ...slot("2027-04-10", 11),
        modality: "in_person",
        seriesId: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "package-exhausted" });

    const created = await owner<{ action: string; total: number }[]>`
      select action, count(*)::int as total
      from audit.audit_log
      where actor_user_id = ${STAFF_ID}::uuid
        and metadata = '{}'::jsonb
        and action in (
          'clinic.package.created',
          'clinic.package.closed',
          'clinic.appointment.created',
          'clinic.appointment.status_changed'
        )
      group by action
      order by action
    `;
    expect(created).toEqual([
      { action: "clinic.appointment.created", total: 4 },
      { action: "clinic.appointment.status_changed", total: 3 },
      { action: "clinic.package.closed", total: 1 },
      { action: "clinic.package.created", total: 2 },
    ]);
  });

  it("A4: remarcar preserva o histórico e não muda a ocupação do pacote", async () => {
    const packageId = await createPackage(runtime, ACTOR, {
      patientId: PATIENT_ID,
      totalSessions: 1,
      startsOn: "2027-05-01",
      expiresOn: "2027-12-01",
      priceCents: 0,
      notes: "um",
    });
    const originalId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId,
      ...slot("2027-05-01", 11),
      modality: "in_person",
      seriesId: "c4444444-4444-4444-8444-444444444444",
      notes: "original",
    });
    const before = await getPackageBalance(runtime, packageId);
    expect(before.occupied).toBe(1);

    const nextId = await rescheduleAppointment(runtime, ACTOR, originalId, {
      ...slot("2027-05-02", 14),
      notes: "nova",
    });
    const original = await getAppointment(runtime, originalId);
    const next = await getAppointment(runtime, nextId);
    expect(original.status).toBe("rescheduled");
    expect(original.rescheduledToId).toBe(nextId);
    expect(next.status).toBe("scheduled");
    expect(next.packageId).toBe(packageId);
    expect(next.modality).toBe("in_person");
    expect(next.seriesId).toBe("c4444444-4444-4444-8444-444444444444");
    expect(next.notes).toBe("nova");
    const after = await getPackageBalance(runtime, packageId);
    expect(after.occupied).toBe(1);
    expect(after.scheduled).toBe(1);

    await expect(
      rescheduleAppointment(runtime, ACTOR, originalId, {
        ...slot("2027-05-03", 11),
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "invalid-transition" });
    await expect(
      changeAppointmentStatus(runtime, ACTOR, nextId, "completed"),
    ).resolves.toBeUndefined();
    await expect(
      changeAppointmentStatus(runtime, ACTOR, nextId, "cancelled"),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "invalid-transition" });

    const extra = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2027-05-04", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await cancelAppointment(runtime, ACTOR, extra);
    const cancelled = await getAppointment(runtime, extra);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBeNull();
    expect(cancelled.statusChangedAt).toBeTruthy();

    const overlap = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2027-05-04", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await expect(
      createAppointment(runtime, ACTOR, {
        patientId: OTHER_PATIENT_ID,
        packageId: null,
        ...slot("2027-05-04", 11),
        modality: "in_person",
        seriesId: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "overlap" });
    expect(overlap).toBeTruthy();

    const historyAudit = await owner<{ action: string; total: number }[]>`
      select action, count(*)::int as total
      from audit.audit_log
      where actor_user_id = ${STAFF_ID}::uuid
        and metadata = '{}'::jsonb
        and entity_id in (${originalId}::uuid, ${nextId}::uuid, ${extra}::uuid)
        and action in (
          'clinic.appointment.created',
          'clinic.appointment.rescheduled',
          'clinic.appointment.cancelled',
          'clinic.appointment.status_changed'
        )
      group by action
      order by action
    `;
    expect(historyAudit).toEqual([
      { action: "clinic.appointment.cancelled", total: 1 },
      { action: "clinic.appointment.created", total: 3 },
      { action: "clinic.appointment.rescheduled", total: 1 },
      { action: "clinic.appointment.status_changed", total: 1 },
    ]);
  });

  it("reposição herda o pacote, ocupa a vaga e recusa a terceira sessão", async () => {
    const packageId = await createPackage(runtime, ACTOR, {
      patientId: PATIENT_ID,
      totalSessions: 2,
      startsOn: "2028-01-01",
      expiresOn: "2020-01-01",
      priceCents: null,
      notes: null,
    });
    const completedId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId,
      ...slot("2028-01-01", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    const missedId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId,
      ...slot("2028-01-01", 13),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await changeAppointmentStatus(runtime, ACTOR, completedId, "completed");
    await changeAppointmentStatus(runtime, ACTOR, missedId, "missed_notified");
    const makeupId = await scheduleMakeup(runtime, ACTOR, missedId, {
      ...slot("2028-01-08", 11),
      modality: "in_person",
      notes: null,
    });
    const makeup = await getAppointment(runtime, makeupId);
    expect(makeup.packageId).toBe(packageId);
    const balance = await getPackageBalance(runtime, packageId);
    expect(balance).toMatchObject({
      occupied: 2,
      remaining: 0,
      pendingMakeups: 0,
    });
    await expect(
      createAppointment(runtime, ACTOR, {
        patientId: PATIENT_ID,
        packageId,
        ...slot("2028-01-09", 11),
        modality: "in_person",
        seriesId: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "package-exhausted" });
  });

  it("remarcar a reposição copia o vínculo e cancelar libera outra", async () => {
    const missedId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2028-02-01", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await changeAppointmentStatus(runtime, ACTOR, missedId, "missed_notified");
    const firstMakeup = await scheduleMakeup(runtime, ACTOR, missedId, {
      ...slot("2028-02-08", 11),
      modality: "online",
      notes: "primeira",
    });
    const nextId = await rescheduleAppointment(runtime, ACTOR, firstMakeup, {
      ...slot("2028-02-09", 14),
      notes: "remarcada",
    });
    const original = await getAppointment(runtime, firstMakeup);
    const next = await getAppointment(runtime, nextId);
    expect(original.status).toBe("rescheduled");
    expect(next.makeupOfId).toBe(missedId);
    expect(next.modality).toBe("online");
    await expect(
      scheduleMakeup(runtime, ACTOR, missedId, {
        ...slot("2028-02-10", 11),
        modality: "in_person",
        notes: null,
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "makeup-taken" });

    await cancelAppointment(runtime, ACTOR, nextId, "viagem");
    const cancelled = await getAppointment(runtime, nextId);
    expect(cancelled.cancelReason).toBe("viagem");
    const replacement = await scheduleMakeup(runtime, ACTOR, missedId, {
      ...slot("2028-02-11", 11),
      modality: "in_person",
      notes: null,
    });
    expect(replacement).toBeTruthy();
    expect(() => parseCancelReason("x".repeat(201))).toThrow();
  });

  it("desfaz no mesmo dia e recusa no dia seguinte, com reposição ativa ou horário ocupado", async () => {
    const completedId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2028-03-01", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await changeAppointmentStatus(runtime, ACTOR, completedId, "completed");
    await undoAppointmentStatus(runtime, ACTOR, completedId);
    const restored = await getAppointment(runtime, completedId);
    expect(restored.status).toBe("scheduled");
    const undoAudit = await owner<
      { action: string; metadata: { from: string; to: string; undo: boolean } }[]
    >`
      select action, metadata
      from audit.audit_log
      where entity_id = ${completedId}::uuid
        and action = 'clinic.appointment.status_changed'
        and metadata ? 'undo'
    `;
    expect(undoAudit).toEqual([
      {
        action: "clinic.appointment.status_changed",
        metadata: { from: "completed", to: "scheduled", undo: true },
      },
    ]);

    await changeAppointmentStatus(runtime, ACTOR, completedId, "completed");
    await owner`
      update clinic.appointments
      set status_changed_at = ${new Date("2026-12-02T02:59:00.000Z")}
      where id = ${completedId}::uuid
    `;
    await expect(
      undoAppointmentStatus(runtime, ACTOR, completedId, {
        now: new Date("2026-12-02T03:01:00.000Z"),
      }),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "undo-not-allowed" });

    const missedId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2028-03-02", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await changeAppointmentStatus(runtime, ACTOR, missedId, "missed_notified");
    await scheduleMakeup(runtime, ACTOR, missedId, {
      ...slot("2028-03-09", 11),
      modality: "in_person",
      notes: null,
    });
    await expect(undoAppointmentStatus(runtime, ACTOR, missedId)).rejects.toMatchObject({
      name: "ClinicRuleError",
      code: "undo-not-allowed",
    });

    const originalId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2028-03-03", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await rescheduleAppointment(runtime, ACTOR, originalId, {
      ...slot("2028-03-04", 11),
      notes: null,
    });
    await expect(undoAppointmentStatus(runtime, ACTOR, originalId)).rejects.toMatchObject(
      { name: "ClinicRuleError", code: "invalid-transition" },
    );

    const cancelledId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2028-03-05", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await cancelAppointment(runtime, ACTOR, cancelledId);
    await createAppointment(runtime, ACTOR, {
      patientId: OTHER_PATIENT_ID,
      packageId: null,
      ...slot("2028-03-05", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await expect(
      undoAppointmentStatus(runtime, ACTOR, cancelledId),
    ).rejects.toMatchObject({ name: "ClinicRuleError", code: "overlap" });
  });

  it("recusa desfazer a reposição se a falta de origem já não for avisada", async () => {
    const missedId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2028-04-01", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await changeAppointmentStatus(runtime, ACTOR, missedId, "missed_notified");
    const makeupId = await scheduleMakeup(runtime, ACTOR, missedId, {
      ...slot("2028-04-08", 11),
      modality: "in_person",
      notes: null,
    });
    await cancelAppointment(runtime, ACTOR, makeupId, "viagem");
    await undoAppointmentStatus(runtime, ACTOR, missedId);
    const origin = await getAppointment(runtime, missedId);
    expect(origin.status).toBe("scheduled");
    await expect(undoAppointmentStatus(runtime, ACTOR, makeupId)).rejects.toMatchObject({
      name: "ClinicRuleError",
      code: "undo-not-allowed",
    });
    const makeup = await getAppointment(runtime, makeupId);
    expect(makeup.status).toBe("cancelled");
    expect(makeup.makeupOfId).toBe(missedId);
  });

  it("limpa o motivo ao desfazer o cancelamento", async () => {
    const appointmentId = await createAppointment(runtime, ACTOR, {
      patientId: PATIENT_ID,
      packageId: null,
      ...slot("2028-05-01", 11),
      modality: "in_person",
      seriesId: null,
      notes: null,
    });
    await cancelAppointment(runtime, ACTOR, appointmentId, "feriado");
    const cancelled = await getAppointment(runtime, appointmentId);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("feriado");
    await undoAppointmentStatus(runtime, ACTOR, appointmentId);
    const restored = await getAppointment(runtime, appointmentId);
    expect(restored.status).toBe("scheduled");
    expect(restored.cancelReason).toBeNull();
  });

  it("grava clinic.settings.updated ao salvar a configuração", async () => {
    await updateAgendaSettings(runtime, ACTOR, {
      defaultDurationMinutes: 40,
      locationName: "Sala",
      locationAddress: "Rua",
      reminderSendHour: 8,
    });
    const rows = await owner<
      { action: string; entity_id: string | null; metadata: object }[]
    >`
      select action, entity_id, metadata
      from audit.audit_log
      where actor_user_id = ${STAFF_ID}::uuid
        and action = 'clinic.settings.updated'
    `;
    expect(rows).toEqual([
      { action: "clinic.settings.updated", entity_id: null, metadata: {} },
    ]);
  });
});
