import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import {
  REMINDER_DAILY_LIMIT,
  sendAppointmentReminders,
} from "../../src/modules/clinic/reminders";

const STAFF_ID = "d1111111-1111-4111-8111-111111111111";
const PATIENT_ID = "d2222222-2222-4222-8222-222222222222";
const OTHER_PATIENT_ID = "d2222222-2222-4222-8222-222222222223";
const GUARDIAN_ID = "d3333333-3333-4333-8333-333333333333";
const MUTED_GUARDIAN_ID = "d3333333-3333-4333-8333-333333333334";
const SECOND_GUARDIAN_ID = "d3333333-3333-4333-8333-333333333335";
const NOW = new Date("2027-08-14T15:00:00.000Z");
const TOMORROW_EIGHT = new Date("2027-08-15T11:00:00.000Z");
const TOMORROW_TEN = new Date("2027-08-15T13:00:00.000Z");
const TODAY = new Date("2027-08-14T16:00:00.000Z");
const DAY_AFTER = new Date("2027-08-16T11:00:00.000Z");
const FROM = "Adrielli Flores <nao-responda@adrielliflores.com.br>";

describe("rotina de lembretes", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let runtimeB: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    runtimeB = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${STAFF_ID}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${STAFF_ID}::uuid, 'STAFF', 'reminders@example.com', 'Staff')
    `;
    await runtime.begin(async (transaction) => {
      await transaction`
        insert into clinic.patients (id, full_name, preferred_name, birth_date, created_by)
        values (
          ${PATIENT_ID}::uuid, 'Paciente Lembrete', 'Nani', '2018-01-02', ${STAFF_ID}::uuid
        )
      `;
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (
          ${OTHER_PATIENT_ID}::uuid, 'Outro Lembrete', '2017-03-04', ${STAFF_ID}::uuid
        )
      `;
      await transaction`
        insert into clinic.guardians (
          id, full_name, relationship, phone, email, receives_reminders
        )
        values (
          ${GUARDIAN_ID}::uuid, 'Responsavel Lembrete', 'MOTHER', '11933334444',
          'responsavel.lembrete@example.com', true
        )
      `;
      await transaction`
        insert into clinic.guardians (
          id, full_name, relationship, phone, email, receives_reminders
        )
        values (
          ${MUTED_GUARDIAN_ID}::uuid, 'Responsavel Sem Lembrete', 'FATHER', '11933335555',
          'sem.lembrete@example.com', false
        )
      `;
      await transaction`
        insert into clinic.guardians (
          id, full_name, relationship, phone, email, receives_reminders
        )
        values (
          ${SECOND_GUARDIAN_ID}::uuid, 'Segundo Responsavel', 'FATHER', '11933336666',
          'segundo.lembrete@example.com', true
        )
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values
          (${PATIENT_ID}::uuid, ${GUARDIAN_ID}::uuid, true),
          (${OTHER_PATIENT_ID}::uuid, ${MUTED_GUARDIAN_ID}::uuid, true)
      `;
    });
    await runtime`
      update clinic.settings
      set
        reminder_send_hour = 9,
        location_name = 'Sala 1',
        location_address = 'Rua das Flores, 10'
      where id = 1
    `;
  });

  afterEach(async () => {
    await owner`alter table audit.audit_log disable trigger audit_log_immutable`;
    await owner`
      delete from audit.audit_log
      where action = 'clinic.reminder.sent'
        and entity_id in (
          ${GUARDIAN_ID}::uuid, ${MUTED_GUARDIAN_ID}::uuid, ${SECOND_GUARDIAN_ID}::uuid
        )
    `;
    await owner`alter table audit.audit_log enable trigger audit_log_immutable`;
    await owner`delete from identity.staff_email_mfa_challenges where user_id = ${STAFF_ID}::uuid`;
    await owner`delete from clinic.appointments where created_by = ${STAFF_ID}::uuid`;
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    try {
      await owner`
        delete from clinic.patient_guardians
        where guardian_id = ${SECOND_GUARDIAN_ID}::uuid
      `;
    } finally {
      await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
    }
  });

  afterAll(async () => {
    await owner`alter table audit.audit_log disable trigger audit_log_immutable`;
    await owner`
      delete from audit.audit_log
      where action = 'clinic.reminder.sent'
        and entity_id in (
          ${GUARDIAN_ID}::uuid, ${MUTED_GUARDIAN_ID}::uuid, ${SECOND_GUARDIAN_ID}::uuid
        )
    `;
    await owner`alter table audit.audit_log enable trigger audit_log_immutable`;
    await owner`delete from identity.staff_email_mfa_challenges where user_id = ${STAFF_ID}::uuid`;
    await owner`delete from clinic.appointments where created_by = ${STAFF_ID}::uuid`;
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
      await owner`
        delete from clinic.guardians
        where id in (
          ${GUARDIAN_ID}::uuid, ${MUTED_GUARDIAN_ID}::uuid, ${SECOND_GUARDIAN_ID}::uuid
        )
      `;
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
    await runtimeB.end({ timeout: 5 });
  });

  it("A5: só o dia seguinte e só quem aceitou", async () => {
    const tomorrow = crypto.randomUUID();
    const extra = crypto.randomUUID();
    const today = crypto.randomUUID();
    const later = crypto.randomUUID();
    const muted = crypto.randomUUID();
    await insertAppointment(
      runtime,
      tomorrow,
      PATIENT_ID,
      TOMORROW_EIGHT,
      "nota clínica TDAH",
    );
    await insertAppointment(runtime, extra, PATIENT_ID, TOMORROW_TEN, null);
    await insertAppointment(runtime, today, PATIENT_ID, TODAY, null);
    await insertAppointment(runtime, later, PATIENT_ID, DAY_AFTER, null);
    await insertAppointment(
      runtime,
      muted,
      OTHER_PATIENT_ID,
      new Date("2027-08-15T15:00:00.000Z"),
      null,
    );
    const inbox: { to: string; text: string; html: string }[] = [];
    const result = await runReminders(runtime, async ({ message }) => {
      inbox.push({ to: message.to, text: message.text, html: message.html });
    });
    expect(result.ok).toBe(true);
    expect(result.sentEmails).toBe(1);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.to).toBe("responsavel.lembrete@example.com");
    expect(inbox[0]?.text).toContain("Nani");
    expect(inbox[0]?.text).toContain("08:00");
    expect(inbox[0]?.text).toContain("10:00");
    expect(inbox[0]?.text).not.toMatch(/TDAH|nota clínica/i);
    expect(inbox[0]?.html).not.toMatch(/TDAH|nota clínica/i);
    expect(await sentAt(runtime, tomorrow)).not.toBeNull();
    expect(await sentAt(runtime, extra)).not.toBeNull();
    expect(await sentAt(runtime, today)).toBeNull();
    expect(await sentAt(runtime, later)).toBeNull();
    expect(await sentAt(runtime, muted)).toBeNull();
    const audits = await runtime<{ total: number }[]>`
      select count(*)::int as total
      from audit.audit_log
      where action = 'clinic.reminder.sent' and entity_id = ${GUARDIAN_ID}::uuid
    `;
    expect(audits[0]?.total).toBe(1);
  });

  it("cada responsável que aceitou recebe o e-mail da mesma sessão", async () => {
    const appointmentId = crypto.randomUUID();
    await runtime`
      insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
      values (${PATIENT_ID}::uuid, ${SECOND_GUARDIAN_ID}::uuid, false)
    `;
    await insertAppointment(runtime, appointmentId, PATIENT_ID, TOMORROW_EIGHT, null);
    const inbox: string[] = [];
    const result = await runReminders(runtime, async ({ message }) => {
      inbox.push(message.to);
    });
    expect(result.ok).toBe(true);
    expect(result.sentEmails).toBe(2);
    expect(inbox.sort()).toEqual([
      "responsavel.lembrete@example.com",
      "segundo.lembrete@example.com",
    ]);
    expect(await sentAt(runtime, appointmentId)).not.toBeNull();
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    try {
      await owner`
        delete from clinic.patient_guardians
        where guardian_id = ${SECOND_GUARDIAN_ID}::uuid
      `;
    } finally {
      await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
    }
  });

  it("duas execuções em paralelo enviam uma vez só", async () => {
    const appointmentId = crypto.randomUUID();
    await insertAppointment(runtime, appointmentId, PATIENT_ID, TOMORROW_EIGHT, null);
    let sends = 0;
    const send = async () => {
      sends += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
    };
    const [first, second] = await Promise.all([
      runReminders(runtime, send),
      runReminders(runtimeB, send),
    ]);
    const results = [first, second];
    expect(results.filter((item) => item.sentEmails === 1)).toHaveLength(1);
    expect(results.filter((item) => item.sentEmails === 0)).toHaveLength(1);
    expect(sends).toBe(1);
    expect(await sentAt(runtime, appointmentId)).not.toBeNull();
  });

  it("falha no envio não marca a sessão", async () => {
    const appointmentId = crypto.randomUUID();
    await insertAppointment(runtime, appointmentId, PATIENT_ID, TOMORROW_EIGHT, null);
    const result = await runReminders(runtime, async () => {
      throw new Error("Falha ao enviar e-mail de MFA");
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("send-failed");
    expect(result.sentEmails).toBe(0);
    expect(await sentAt(runtime, appointmentId)).toBeNull();
    const audits = await runtime<{ total: number }[]>`
      select count(*)::int as total
      from audit.audit_log
      where action = 'clinic.reminder.sent' and entity_id = ${GUARDIAN_ID}::uuid
    `;
    expect(audits[0]?.total).toBe(0);
  });

  it("para na cota de 80 e-mails do dia", async () => {
    const appointmentId = crypto.randomUUID();
    await insertAppointment(runtime, appointmentId, PATIENT_ID, TOMORROW_EIGHT, null);
    await owner.begin(async (transaction) => {
      for (let index = 0; index < REMINDER_DAILY_LIMIT; index += 1) {
        await transaction`
          insert into identity.staff_email_mfa_challenges (
            user_id, session_id, code_hmac, expires_at, created_at
          )
          values (
            ${STAFF_ID}::uuid,
            ${crypto.randomUUID()}::uuid,
            ${"a".repeat(64)},
            ${NOW}::timestamptz + interval '10 minutes',
            ${NOW}::timestamptz
          )
        `;
      }
    });
    let sends = 0;
    const result = await runReminders(runtime, async () => {
      sends += 1;
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("quota");
    expect(result.quota).toBe(REMINDER_DAILY_LIMIT);
    expect(sends).toBe(0);
    expect(await sentAt(runtime, appointmentId)).toBeNull();
  });
});

async function runReminders(
  sql: ReturnType<typeof postgres>,
  sendEmail: (input: {
    message: { to: string; subject: string; text: string; html: string };
  }) => Promise<void>,
) {
  return sendAppointmentReminders({
    sql,
    now: NOW,
    from: FROM,
    transport: "memory",
    whatsappUrl: "https://wa.me/5511999999999",
    sendEmail,
  });
}

async function insertAppointment(
  sql: ReturnType<typeof postgres>,
  id: string,
  patientId: string,
  startsAt: Date,
  notes: string | null,
) {
  const endsAt = new Date(startsAt.getTime() + 50 * 60_000);
  await sql`
    insert into clinic.appointments (
      id, patient_id, starts_at, ends_at, notes, created_by
    )
    values (
      ${id}::uuid,
      ${patientId}::uuid,
      ${startsAt},
      ${endsAt},
      ${notes},
      ${STAFF_ID}::uuid
    )
  `;
}

async function sentAt(
  sql: ReturnType<typeof postgres>,
  id: string,
): Promise<Date | string | null> {
  const rows = await sql<{ reminder_sent_at: Date | string | null }[]>`
    select reminder_sent_at from clinic.appointments where id = ${id}::uuid
  `;
  return rows[0]?.reminder_sent_at ?? null;
}
