import postgres from "postgres";

import { pruneCalendarFeedRequests } from "./calendar-feed-prune.ts";
import {
  sendAppointmentReminders,
  type ReminderRunResult,
  type ReminderSendEmail,
} from "./reminders.ts";
import { EMAIL_MFA_DEFAULT_FROM, memoryTransportEnabled } from "../identity/email-mfa.ts";
import { sendStaffEmail } from "../identity/email-transport.ts";

export const REMINDER_JOB_DEADLINE_MS = 20_000;

export type ReminderJobReason = ReminderRunResult["reason"] | "disabled";

export type ReminderJobResult = Omit<ReminderRunResult, "reason"> & {
  reason: ReminderJobReason;
  prunedFeedRequests: number;
};

type JobEnv = Record<string, string | undefined>;

const emptyJob = {
  sentEmails: 0,
  markedAppointments: 0,
  quota: 0,
  appointmentIds: [] as string[],
  prunedFeedRequests: 0,
};

export function remindersLockAllows(env: JobEnv): boolean {
  return env.APP_ENV === "production" && env.REMINDERS_ENABLED?.trim() === "true";
}

export function disabledReminderResult(): ReminderJobResult {
  return {
    ok: true,
    skipped: true,
    reason: "disabled",
    ...emptyJob,
  };
}

export function deadlineReminderResult(): ReminderJobResult {
  return {
    ok: false,
    skipped: true,
    reason: "deadline",
    ...emptyJob,
  };
}

export function publicLogMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha ao enviar lembretes.";
  if (/@/.test(message) || /re_/i.test(message) || /postgres(ql)?:\/\//i.test(message)) {
    return "Falha ao enviar lembretes.";
  }
  return message;
}

export async function runReminderJobWithDeadline(input: {
  run: () => Promise<ReminderJobResult>;
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReminderJobResult> {
  const deadlineMs = input.deadlineMs ?? REMINDER_JOB_DEADLINE_MS;
  const sleep =
    input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  return Promise.race([
    input.run(),
    sleep(deadlineMs).then(() => deadlineReminderResult()),
  ]);
}

export async function runReminderJob(input: {
  env: JobEnv;
  sendEmail?: ReminderSendEmail;
  now?: Date;
  nowMs?: () => number;
  deadlineMs?: number;
  onError?: (message: string) => void;
}): Promise<ReminderJobResult> {
  const appEnv = required(input.env, "APP_ENV");
  if (appEnv !== "staging" && appEnv !== "production") {
    throw new Error("APP_ENV precisa ser staging ou production.");
  }

  const databaseUrl = required(input.env, "DATABASE_URL");
  const from =
    optional(input.env, "REMINDER_EMAIL_FROM") ??
    optional(input.env, "MFA_EMAIL_FROM") ??
    EMAIL_MFA_DEFAULT_FROM;
  if (!from.toLowerCase().includes("@adrielliflores.com.br")) {
    throw new Error("Remetente fora do domínio.");
  }

  const transport = memoryTransportEnabled({
    APP_ENV: appEnv,
    MFA_EMAIL_TRANSPORT: optional(input.env, "MFA_EMAIL_TRANSPORT"),
  })
    ? "memory"
    : "resend";
  if (transport === "resend" && !optional(input.env, "RESEND_API_KEY")) {
    throw new Error("RESEND_API_KEY ausente.");
  }

  const started = (input.nowMs ?? Date.now)();
  const deadlineAt = input.deadlineMs == null ? undefined : started + input.deadlineMs;

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
  });

  try {
    let prunedFeedRequests = 0;
    try {
      prunedFeedRequests = await pruneCalendarFeedRequests(sql);
    } catch (error) {
      input.onError?.(publicLogMessage(error));
    }
    const whatsappUrl = await loadWhatsappUrl(sql);
    const result = await sendAppointmentReminders({
      sql,
      now: input.now,
      nowMs: input.nowMs,
      deadlineAt,
      from,
      transport,
      apiKey: optional(input.env, "RESEND_API_KEY"),
      whatsappUrl,
      sendEmail: input.sendEmail ?? sendStaffEmail,
    });
    return { ...result, prunedFeedRequests };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function loadWhatsappUrl(db: postgres.Sql): Promise<string | null> {
  const rows = await db<{ whatsapp_number: string | null }[]>`
    select whatsapp_number from content.site_settings where id = 1
  `;
  const digits = (rows[0]?.whatsapp_number ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function required(env: JobEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

function optional(env: JobEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}
