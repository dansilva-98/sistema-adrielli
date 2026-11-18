import { afterEach, describe, expect, it, vi } from "vitest";

import { sendSentryEnvelope } from "@/lib/sentry-envelope";
import { handleClinicReminders } from "@/modules/clinic/reminder-function";
import type { ReminderJobResult } from "@/modules/clinic/reminder-job";

const okResult: ReminderJobResult = {
  ok: true,
  skipped: false,
  reason: null,
  sentEmails: 0,
  markedAppointments: 0,
  quota: 0,
  appointmentIds: [],
  prunedFeedRequests: 0,
};

describe("função agendada de lembretes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("não chama o job sem REMINDERS_ENABLED ou fora da produção", async () => {
    const runJob = vi.fn();
    const locked = [
      { APP_ENV: "production" },
      { APP_ENV: "production", REMINDERS_ENABLED: "false" },
      { APP_ENV: "staging", REMINDERS_ENABLED: "true" },
    ];
    for (const env of locked) {
      runJob.mockReset();
      const response = await handleClinicReminders(env, { runJob });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        skipped: true,
        reason: "disabled",
      });
      expect(runJob).not.toHaveBeenCalled();
    }
  });

  it("envia o envelope do Sentry uma vez na falha, sem dado pessoal", async () => {
    const sendSentry = vi.fn<typeof sendSentryEnvelope>(async () => undefined);
    const runJob = vi.fn(async () => {
      throw new Error("smtp recusou pessoa@example.com postgres://secret");
    });
    const response = await handleClinicReminders(
      {
        APP_ENV: "production",
        REMINDERS_ENABLED: "true",
        SENTRY_DSN: "https://public@o0.ingest.sentry.io/1",
      },
      { runJob, sendSentry },
    );
    expect(response.status).toBe(500);
    expect(sendSentry).toHaveBeenCalledTimes(1);
    const payload = sendSentry.mock.calls.at(0)?.at(0);
    expect(payload?.error).toBeInstanceOf(Error);
    expect(JSON.stringify(payload)).not.toMatch(/pessoa@example.com|postgres:\/\//);
  });

  it("envia o Sentry quando a cota estoura, sem falhar o HTTP", async () => {
    const sendSentry = vi.fn<typeof sendSentryEnvelope>(async () => undefined);
    const runJob = vi.fn(async () => ({
      ...okResult,
      ok: false,
      skipped: false,
      reason: "quota" as const,
      quota: 80,
    }));
    const response = await handleClinicReminders(
      {
        APP_ENV: "production",
        REMINDERS_ENABLED: "true",
        SENTRY_DSN: "https://public@o0.ingest.sentry.io/1",
      },
      { runJob, sendSentry },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reason: "quota" });
    expect(sendSentry).toHaveBeenCalledTimes(1);
    const payload = sendSentry.mock.calls.at(0)?.at(0);
    expect(payload?.error).toBeInstanceOf(Error);
    expect((payload?.error as Error).message).toBe("Cota diária de lembretes atingida.");
  });

  it("não envia o Sentry no prazo", async () => {
    const sendSentry = vi.fn<typeof sendSentryEnvelope>(async () => undefined);
    const runJob = vi.fn(async () => ({
      ...okResult,
      ok: false,
      skipped: true,
      reason: "deadline" as const,
    }));
    const response = await handleClinicReminders(
      {
        APP_ENV: "production",
        REMINDERS_ENABLED: "true",
        SENTRY_DSN: "https://public@o0.ingest.sentry.io/1",
      },
      { runJob, sendSentry },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reason: "deadline" });
    expect(sendSentry).not.toHaveBeenCalled();
  });
});
