import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";

import { parseClientEnv, parseServerEnv } from "./src/lib/env";
import { buildSecurityHeaders } from "./src/lib/security-headers";

if (!process.env.APP_ENV) {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

const serverEnv = parseServerEnv(process.env);
const clientEnv = parseClientEnv(process.env);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  env: {
    NEXT_PUBLIC_APP_ENV: serverEnv.APP_ENV,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          appEnv: serverEnv.APP_ENV,
          supabaseUrl: clientEnv.NEXT_PUBLIC_SUPABASE_URL,
          sentryDsn: serverEnv.SENTRY_DSN,
          publicSentryDsn: clientEnv.NEXT_PUBLIC_SENTRY_DSN,
          isDev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;
