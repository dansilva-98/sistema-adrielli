import { sendSentryEnvelope } from "../../lib/sentry-envelope.ts";
import {
  disabledReminderResult,
  publicLogMessage,
  REMINDER_JOB_DEADLINE_MS,
  remindersLockAllows,
  runReminderJob,
  type ReminderJobResult,
} from "./reminder-job.ts";

export async function handleClinicReminders(
  env: Record<string, string | undefined>,
  deps: {
    runJob?: typeof runReminderJob;
    sendSentry?: typeof sendSentryEnvelope;
    log?: (message: string) => void;
    logError?: (message: string) => void;
  } = {},
): Promise<Response> {
  if (!remindersLockAllows(env)) {
    return json(disabledReminderResult());
  }

  const runJob = deps.runJob ?? runReminderJob;
  const log = deps.log ?? (() => undefined);
  const logError = deps.logError ?? (() => undefined);
  try {
    const result = await runJob({
      env,
      deadlineMs: REMINDER_JOB_DEADLINE_MS,
      onError: logError,
    });
    log(JSON.stringify(publicJobLog(result)));
    if (!result.ok && result.reason !== "deadline") {
      await reportFailure(
        env,
        new Error(
          result.reason === "quota"
            ? "Cota diária de lembretes atingida."
            : "Falha ao enviar lembretes.",
        ),
        deps.sendSentry,
      );
    }
    return json(publicJobLog(result), httpStatus(result));
  } catch (error) {
    logError(publicLogMessage(error));
    await reportFailure(env, error, deps.sendSentry);
    return json(
      publicJobLog({
        ok: false,
        skipped: false,
        reason: "send-failed",
        sentEmails: 0,
        markedAppointments: 0,
        quota: 0,
        appointmentIds: [],
        prunedFeedRequests: 0,
      }),
      500,
    );
  }
}

async function reportFailure(
  env: Record<string, string | undefined>,
  error: unknown,
  sendSentry: typeof sendSentryEnvelope = sendSentryEnvelope,
): Promise<void> {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    await sendSentry({
      dsn,
      error,
      environment: env.APP_ENV,
    });
  } catch {
    return;
  }
}

function publicJobLog(result: ReminderJobResult): ReminderJobResult {
  return {
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    sentEmails: result.sentEmails,
    markedAppointments: result.markedAppointments,
    quota: result.quota,
    appointmentIds: result.appointmentIds,
    prunedFeedRequests: result.prunedFeedRequests,
  };
}

function httpStatus(result: ReminderJobResult): number {
  return result.reason === "send-failed" ? 500 : 200;
}

function json(body: ReminderJobResult, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
