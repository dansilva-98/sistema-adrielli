import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "@/lib/security-headers";

const base = {
  supabaseUrl: "http://127.0.0.1:54321",
  sentryDsn: "https://public@o0.ingest.sentry.io/0",
  publicSentryDsn: "https://public@o0.ingest.us.sentry.io/1",
  isDev: false,
};

function header(appEnv: "development" | "staging" | "production", name: string) {
  return buildSecurityHeaders({ ...base, appEnv, isDev: appEnv === "development" }).find(
    (item) => item.key === name,
  )?.value;
}

describe("security headers", () => {
  it("envia os cabeçalhos obrigatórios e a CSP inicial", () => {
    const csp = header("staging", "Content-Security-Policy") ?? "";
    expect(header("staging", "X-Content-Type-Options")).toBe("nosniff");
    expect(header("staging", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("staging", "Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("http://127.0.0.1:54321");
    expect(csp).toContain("https://o0.ingest.sentry.io");
    expect(csp).toContain("https://o0.ingest.us.sentry.io");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("só envia HSTS em staging e produção", () => {
    expect(header("development", "Strict-Transport-Security")).toBeUndefined();
    expect(header("staging", "Strict-Transport-Security")).toContain("max-age=31536000");
    expect(header("production", "Strict-Transport-Security")).toContain(
      "includeSubDomains",
    );
  });
});
