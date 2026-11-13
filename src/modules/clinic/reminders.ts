import type postgres from "postgres";

import { recordAudit } from "../audit/record.ts";
import type { StaffEmailMessage } from "../identity/email-transport.ts";
import { formatClinicClock, formatClinicDate, todayInClinic } from "./format.ts";

export const REMINDER_DAILY_LIMIT = 80;

type Database = postgres.Sql | postgres.TransactionSql;

export type ReminderSendEmail = (input: {
  message: StaffEmailMessage;
  from: string;
  transport: "memory" | "resend";
  apiKey?: string;
}) => Promise<void>;

export type ReminderCandidate = {
  appointmentId: string;
  guardianId: string;
  guardianEmail: string;
  fullName: string;
  preferredName: string | null;
  startsAt: Date;
};

export type ReminderRunResult = {
  ok: boolean;
  skipped: boolean;
  reason: "before-send-hour" | "quota" | "send-failed" | "none" | null;
  sentEmails: number;
  markedAppointments: number;
  quota: number;
  appointmentIds: string[];
};

type ClockBounds = {
  range_start: Date;
  range_end: Date;
  day_start: Date;
  day_end: Date;
};

type SettingsRow = {
  reminder_send_hour: number;
  location_name: string;
  location_address: string;
};

type CandidateRow = {
  appointment_id: string;
  guardian_id: string;
  email: string;
  full_name: string;
  preferred_name: string | null;
  starts_at: Date | string;
};

type LockedSession = {
  id: string;
  starts_at: Date | string;
  full_name: string;
  preferred_name: string | null;
};

export function treatmentName(fullName: string, preferredName: string | null): string {
  const preferred = preferredName?.trim();
  return preferred || fullName.trim();
}

export function clinicHourInSaoPaulo(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

export function isReminderHourReached(now: Date, reminderSendHour: number): boolean {
  return clinicHourInSaoPaulo(now) >= reminderSendHour;
}

export function groupByGuardian<T extends { guardianId: string }>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const current = groups.get(row.guardianId);
    if (current) current.push(row);
    else groups.set(row.guardianId, [row]);
  }
  return [...groups.values()];
}

export function buildReminderEmail(input: {
  sessions: { treatmentName: string; startsAt: Date }[];
  locationName: string;
  locationAddress: string;
  whatsappUrl: string | null;
}): { subject: string; text: string; html: string } {
  const sessions = [...input.sessions].sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  );
  const lines = sessions.map((session) => sessionLine(session));
  const location = locationLines(input.locationName, input.locationAddress);
  const whatsapp = input.whatsappUrl
    ? `Em caso de imprevisto, avise pelo WhatsApp: ${input.whatsappUrl}`
    : "Em caso de imprevisto, avise pelo WhatsApp.";
  const intro =
    sessions.length === 1
      ? `Lembramos da sessão de ${lines[0]}.`
      : "Lembramos das sessões de amanhã:";
  const textParts = ["Olá,", "", intro];
  if (sessions.length > 1) {
    textParts.push("", ...lines.map((line) => `- ${line}`));
  }
  if (location.length > 0) {
    textParts.push("", "Local:", ...location);
  }
  textParts.push("", whatsapp, "", "Adrielli Flores");
  const htmlItems =
    sessions.length === 1
      ? `<p>Lembramos da sessão de ${escapeHtml(lines[0] ?? "")}.</p>`
      : `<p>Lembramos das sessões de amanhã:</p><ul>${sessions
          .map((session) => `<li>${escapeHtml(sessionLine(session))}</li>`)
          .join("")}</ul>`;
  const htmlLocation =
    location.length > 0
      ? `<p>Local:</p><p>${location.map((line) => escapeHtml(line)).join("<br>")}</p>`
      : "";
  const htmlWhatsapp = input.whatsappUrl
    ? `<p>Em caso de imprevisto, avise pelo WhatsApp: <a href="${escapeHtml(input.whatsappUrl)}">${escapeHtml(input.whatsappUrl)}</a></p>`
    : "<p>Em caso de imprevisto, avise pelo WhatsApp.</p>";
  return {
    subject: "Lembrete de sessão — Adrielli Flores",
    text: textParts.join("\n"),
    html: `<p>Olá,</p>${htmlItems}${htmlLocation}${htmlWhatsapp}<p>Adrielli Flores</p>`,
  };
}

export async function sendAppointmentReminders(input: {
  sql: postgres.Sql;
  now?: Date;
  from: string;
  transport: "memory" | "resend";
  apiKey?: string;
  whatsappUrl: string | null;
  sendEmail: ReminderSendEmail;
}): Promise<ReminderRunResult> {
  const now = input.now ?? new Date();
  const empty: ReminderRunResult = {
    ok: true,
    skipped: false,
    reason: "none",
    sentEmails: 0,
    markedAppointments: 0,
    quota: 0,
    appointmentIds: [],
  };
  const settings = await loadSettings(input.sql);
  if (!settings) return empty;
  if (!isReminderHourReached(now, settings.reminder_send_hour)) {
    return { ...empty, skipped: true, reason: "before-send-hour" };
  }
  const clock = await loadClock(input.sql, now);
  const initialQuota = await loadQuota(input.sql, clock);
  const candidates = await loadCandidates(input.sql, clock);
  if (candidates.length === 0) {
    return { ...empty, quota: initialQuota };
  }

  try {
    const outcome = await input.sql.begin(async (tx) =>
      sendLockedBatch(tx, {
        candidates,
        clock,
        settings,
        from: input.from,
        transport: input.transport,
        apiKey: input.apiKey,
        whatsappUrl: input.whatsappUrl,
        sendEmail: input.sendEmail,
        now,
      }),
    );
    return {
      ok: !outcome.quotaHit && outcome.failed === false,
      skipped: false,
      reason: outcome.quotaHit
        ? "quota"
        : outcome.failed
          ? "send-failed"
          : outcome.sentEmails === 0
            ? "none"
            : null,
      sentEmails: outcome.sentEmails,
      markedAppointments: outcome.appointmentIds.length,
      quota: outcome.quota,
      appointmentIds: outcome.appointmentIds,
    };
  } catch {
    return {
      ...empty,
      ok: false,
      reason: "send-failed",
      quota: initialQuota,
    };
  }
}

async function sendLockedBatch(
  tx: postgres.TransactionSql,
  input: {
    candidates: ReminderCandidate[];
    clock: ClockBounds;
    settings: SettingsRow;
    from: string;
    transport: "memory" | "resend";
    apiKey?: string;
    whatsappUrl: string | null;
    sendEmail: ReminderSendEmail;
    now: Date;
  },
): Promise<{
  sentEmails: number;
  appointmentIds: string[];
  quota: number;
  quotaHit: boolean;
  failed: boolean;
}> {
  const guardianIds = [...new Set(input.candidates.map((row) => row.guardianId))].sort();
  const lockedGuardians = await tx<{ id: string; email: string }[]>`
    select id, email
    from clinic.guardians
    where id in ${tx(guardianIds)}
      and receives_reminders = true
      and email is not null
      and btrim(email) <> ''
    order by id
    for no key update skip locked
  `;
  const lockedGuardianIds = new Set(lockedGuardians.map((row) => row.id));
  const emailByGuardian = new Map(
    lockedGuardians.map((row) => [row.id, row.email.trim()] as const),
  );
  const blockedAppointments = new Set(
    input.candidates
      .filter((row) => !lockedGuardianIds.has(row.guardianId))
      .map((row) => row.appointmentId),
  );
  const appointmentIds = [
    ...new Set(
      input.candidates
        .filter(
          (row) =>
            lockedGuardianIds.has(row.guardianId) &&
            !blockedAppointments.has(row.appointmentId),
        )
        .map((row) => row.appointmentId),
    ),
  ].sort();
  if (lockedGuardians.length === 0 || appointmentIds.length === 0) {
    return {
      sentEmails: 0,
      appointmentIds: [],
      quota: await loadQuota(tx, input.clock),
      quotaHit: false,
      failed: false,
    };
  }

  const lockedSessions = await tx<LockedSession[]>`
    select a.id, a.starts_at, p.full_name, p.preferred_name
    from clinic.appointments a
    join clinic.patients p on p.id = a.patient_id
    where a.id in ${tx(appointmentIds)}
      and a.status = 'scheduled'
      and a.reminder_sent_at is null
    order by a.id
    for update of a skip locked
  `;
  const sessionById = new Map(lockedSessions.map((row) => [row.id, row]));
  const pairs = input.candidates.filter(
    (row) => lockedGuardianIds.has(row.guardianId) && sessionById.has(row.appointmentId),
  );
  const groups = groupByGuardian(pairs);
  let quota = await loadQuota(tx, input.clock);
  const sentGuardianIds = new Set<string>();
  let quotaHit = false;

  for (const group of groups) {
    if (quota >= REMINDER_DAILY_LIMIT) {
      quotaHit = true;
      break;
    }
    const guardianId = group[0]?.guardianId;
    const email = guardianId ? emailByGuardian.get(guardianId) : undefined;
    if (!guardianId || !email) continue;
    const sessions = group
      .map((row) => sessionById.get(row.appointmentId))
      .filter((session): session is LockedSession => Boolean(session));
    if (sessions.length === 0) continue;
    await input.sendEmail({
      message: {
        to: email,
        ...buildReminderEmail({
          sessions: sessions.map((session) => ({
            treatmentName: treatmentName(session.full_name, session.preferred_name),
            startsAt: asDate(session.starts_at),
          })),
          locationName: input.settings.location_name,
          locationAddress: input.settings.location_address,
          whatsappUrl: input.whatsappUrl,
        }),
      },
      from: input.from,
      transport: input.transport,
      apiKey: input.apiKey,
    });
    await recordAudit(
      {
        action: "clinic.reminder.sent",
        entityType: "guardian",
        entityId: guardianId,
        metadata: {},
      },
      tx,
    );
    sentGuardianIds.add(guardianId);
    quota += 1;
  }

  const markedIds = lockedSessions
    .map((session) => session.id)
    .filter((appointmentId) => {
      const guardians = pairs
        .filter((row) => row.appointmentId === appointmentId)
        .map((row) => row.guardianId);
      return guardians.length > 0 && guardians.every((id) => sentGuardianIds.has(id));
    });
  if (markedIds.length > 0) {
    await tx`
      update clinic.appointments
      set reminder_sent_at = ${input.now}
      where id in ${tx(markedIds)}
        and reminder_sent_at is null
    `;
  }

  return {
    sentEmails: sentGuardianIds.size,
    appointmentIds: markedIds,
    quota,
    quotaHit: quotaHit && groups.length > sentGuardianIds.size,
    failed: false,
  };
}

async function loadSettings(sql: Database): Promise<SettingsRow | null> {
  const rows = await sql<SettingsRow[]>`
    select reminder_send_hour, location_name, location_address
    from clinic.settings
    where id = 1
  `;
  return rows[0] ?? null;
}

async function loadClock(sql: Database, now: Date): Promise<ClockBounds> {
  const rows = await sql<ClockBounds[]>`
    select
      (date_trunc('day', timezone('America/Sao_Paulo', ${now}::timestamptz))
        + interval '1 day') at time zone 'America/Sao_Paulo' as range_start,
      (date_trunc('day', timezone('America/Sao_Paulo', ${now}::timestamptz))
        + interval '2 day') at time zone 'America/Sao_Paulo' as range_end,
      date_trunc('day', timezone('America/Sao_Paulo', ${now}::timestamptz))
        at time zone 'America/Sao_Paulo' as day_start,
      (date_trunc('day', timezone('America/Sao_Paulo', ${now}::timestamptz))
        + interval '1 day') at time zone 'America/Sao_Paulo' as day_end
  `;
  const clock = rows[0];
  if (!clock) {
    throw new Error("Não foi possível calcular o dia do lembrete.");
  }
  return clock;
}

async function loadQuota(sql: Database, clock: ClockBounds): Promise<number> {
  const rows = await sql<{ mfa: number; reminders: number }[]>`
    select
      (
        select count(*)::int
        from identity.staff_email_mfa_challenges
        where created_at >= ${clock.day_start}
          and created_at < ${clock.day_end}
      ) as mfa,
      (
        select count(*)::int
        from audit.audit_log
        where action = 'clinic.reminder.sent'
          and occurred_at >= ${clock.day_start}
          and occurred_at < ${clock.day_end}
      ) as reminders
  `;
  return (rows[0]?.mfa ?? 0) + (rows[0]?.reminders ?? 0);
}

async function loadCandidates(
  sql: Database,
  clock: ClockBounds,
): Promise<ReminderCandidate[]> {
  const rows = await sql<CandidateRow[]>`
    select
      a.id as appointment_id,
      g.id as guardian_id,
      g.email,
      p.full_name,
      p.preferred_name,
      a.starts_at
    from clinic.appointments a
    join clinic.patients p on p.id = a.patient_id
    join clinic.patient_guardians pg on pg.patient_id = a.patient_id
    join clinic.guardians g on g.id = pg.guardian_id
    where a.status = 'scheduled'
      and a.reminder_sent_at is null
      and a.starts_at >= ${clock.range_start}
      and a.starts_at < ${clock.range_end}
      and g.receives_reminders = true
      and g.email is not null
      and btrim(g.email) <> ''
      and position('@' in g.email) > 1
    order by g.id, a.starts_at, a.id
  `;
  return rows.map((row) => ({
    appointmentId: row.appointment_id,
    guardianId: row.guardian_id,
    guardianEmail: row.email.trim(),
    fullName: row.full_name,
    preferredName: row.preferred_name,
    startsAt: asDate(row.starts_at),
  }));
}

function sessionLine(session: { treatmentName: string; startsAt: Date }): string {
  const date = formatClinicDate(todayInClinic(session.startsAt));
  const time = formatClinicClock(session.startsAt);
  return `${session.treatmentName}, ${date} às ${time}`;
}

function locationLines(name: string, address: string): string[] {
  return [name.trim(), address.trim()].filter((line) => line.length > 0);
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
