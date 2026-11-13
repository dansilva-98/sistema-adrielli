import postgres from "postgres";

import { sendAppointmentReminders } from "../src/modules/clinic/reminders.ts";
import {
  EMAIL_MFA_DEFAULT_FROM,
  memoryTransportEnabled,
} from "../src/modules/identity/email-mfa.ts";
import { sendStaffEmail } from "../src/modules/identity/email-transport.ts";

async function main(): Promise<void> {
  const appEnv = required("APP_ENV");
  if (appEnv !== "staging" && appEnv !== "production") {
    throw new Error("APP_ENV precisa ser staging ou production.");
  }

  const databaseUrl = required("DATABASE_URL");
  const from =
    optional("REMINDER_EMAIL_FROM") ??
    optional("MFA_EMAIL_FROM") ??
    EMAIL_MFA_DEFAULT_FROM;
  if (!from.toLowerCase().includes("@adrielliflores.com.br")) {
    throw new Error("Remetente fora do domínio.");
  }

  const transport = memoryTransportEnabled({
    APP_ENV: appEnv,
    MFA_EMAIL_TRANSPORT: optional("MFA_EMAIL_TRANSPORT"),
  })
    ? "memory"
    : "resend";
  if (transport === "resend" && !optional("RESEND_API_KEY")) {
    throw new Error("RESEND_API_KEY ausente.");
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
  });

  try {
    const whatsappUrl = await loadWhatsappUrl(sql);
    const result = await sendAppointmentReminders({
      sql,
      from,
      transport,
      apiKey: optional("RESEND_API_KEY"),
      whatsappUrl,
      sendEmail: sendStaffEmail,
    });
    console.log(
      JSON.stringify({
        ok: result.ok,
        skipped: result.skipped,
        reason: result.reason,
        sentEmails: result.sentEmails,
        markedAppointments: result.markedAppointments,
        quota: result.quota,
        appointmentIds: result.appointmentIds,
      }),
    );
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(publicLogMessage(error));
    process.exitCode = 1;
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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function publicLogMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha ao enviar lembretes.";
  if (/@/.test(message) || /re_/i.test(message) || /postgres(ql)?:\/\//i.test(message)) {
    return "Falha ao enviar lembretes.";
  }
  return message;
}

void main();
