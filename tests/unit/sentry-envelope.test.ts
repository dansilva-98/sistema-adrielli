import { describe, expect, it, vi } from "vitest";

import { parseSentryDsn, sendSentryEnvelope } from "@/lib/sentry-envelope";

describe("envelope do Sentry", () => {
  it("monta a URL do envelope a partir do DSN", () => {
    expect(parseSentryDsn("https://public@o0.ingest.sentry.io/1")).toEqual({
      publicKey: "public",
      envelopeUrl: "https://o0.ingest.sentry.io/api/1/envelope/",
    });
    expect(parseSentryDsn("")).toBeNull();
  });

  it("envia um evento limpo, sem e-mail nem URL de banco", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    await sendSentryEnvelope({
      dsn: "https://public@o0.ingest.sentry.io/1",
      error: new Error("smtp recusou pessoa@example.com postgres://u:p@host/db"),
      environment: "production",
      fetchImpl,
      now: () => 1_700_000_000_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls.at(0);
    expect(call?.[0]).toBe("https://o0.ingest.sentry.io/api/1/envelope/");
    const init = call?.[1] as RequestInit | undefined;
    const body = String(init?.body ?? "");
    expect(body).toContain('"job":"clinic-reminders"');
    expect(body).not.toContain("pessoa@example.com");
    expect(body).not.toContain("postgres://");
    expect(body).not.toContain("public@");
  });
});
