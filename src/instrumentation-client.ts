import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: appEnv,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
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
  integrations(integrations) {
    return integrations.filter(
      (integration) => !integration.name.toLowerCase().includes("replay"),
    );
  },
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});
