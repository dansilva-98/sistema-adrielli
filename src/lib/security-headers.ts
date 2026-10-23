export type SecurityHeaderEnv = {
  appEnv: "development" | "staging" | "production";
  supabaseUrl: string;
  sentryDsn: string;
  publicSentryDsn: string;
  isDev: boolean;
};

export type SecurityHeader = {
  key: string;
  value: string;
};

function originOf(value: string): string {
  return new URL(value).origin;
}

export function buildContentSecurityPolicy(env: SecurityHeaderEnv): string {
  const connectSources = [
    "'self'",
    originOf(env.supabaseUrl),
    originOf(env.sentryDsn),
    originOf(env.publicSentryDsn),
  ];
  const uniqueConnect = [...new Set(connectSources)].join(" ");
  const scriptSrc = env.isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${originOf(env.supabaseUrl)}`,
    "font-src 'self'",
    `connect-src ${uniqueConnect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ].join("; ");
}

export function buildSecurityHeaders(env: SecurityHeaderEnv): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(env) },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];

  if (env.appEnv === "production" || env.appEnv === "staging") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}
