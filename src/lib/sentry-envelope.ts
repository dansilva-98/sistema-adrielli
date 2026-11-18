import { scrubSentryEvent } from "./sentry-scrub.ts";

export const SENTRY_ENVELOPE_TIMEOUT_MS = 2000;

type SentryDsn = {
  publicKey: string;
  envelopeUrl: string;
};

export function parseSentryDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn.trim());
    const publicKey = decodeURIComponent(url.username);
    const projectId = url.pathname.replace(/^\/+/, "").split("/")[0];
    if (!publicKey || !projectId || !url.host) return null;
    return {
      publicKey,
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

export async function sendSentryEnvelope(input: {
  dsn: string;
  error: unknown;
  environment?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<void> {
  const parsed = parseSentryDsn(input.dsn);
  if (!parsed) return;
  const error = input.error;
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const event = scrubSentryEvent({
    event_id: eventId,
    timestamp: (input.now ?? Date.now)() / 1000,
    platform: "node",
    environment: input.environment,
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : "Error",
          value: error instanceof Error ? error.message : "Falha ao enviar lembretes.",
        },
      ],
    },
    tags: { job: "clinic-reminders" },
  });
  const header = JSON.stringify({
    event_id: eventId,
    sent_at: new Date((input.now ?? Date.now)()).toISOString(),
  });
  const item = JSON.stringify({ type: "event" });
  const body = `${header}\n${item}\n${JSON.stringify(event)}\n`;
  const fetchImpl = input.fetchImpl ?? fetch;
  await fetchImpl(parsed.envelopeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=adrielli-flores/0.1.0`,
    },
    body,
    signal: AbortSignal.timeout(SENTRY_ENVELOPE_TIMEOUT_MS),
  });
}
