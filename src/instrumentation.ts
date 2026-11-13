import * as Sentry from "@sentry/nextjs";

import { serverEnv } from "@/lib/env.server";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

function initSentry(dsn: string | undefined, environment: string | undefined) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initSentry(serverEnv.SENTRY_DSN, serverEnv.APP_ENV);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    initSentry(process.env.SENTRY_DSN, process.env.APP_ENV);
  }
}

export { onRequestError } from "@/lib/sentry-server";
