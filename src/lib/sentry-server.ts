import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

export const SENTRY_FLUSH_MS = 2000;

const NEXT_REQUEST_CONTEXT = Symbol.for("@next/request-context");

type NextWaitUntilStore = {
  get?: () => { waitUntil?: (task: Promise<unknown>) => void };
};

function registerBackgroundFlush(task: Promise<unknown>): void {
  try {
    const store = (
      globalThis as unknown as Record<symbol, NextWaitUntilStore | undefined>
    )[NEXT_REQUEST_CONTEXT];
    store?.get?.()?.waitUntil?.(task);
  } catch {
    return;
  }
}

export async function flushSentry(): Promise<void> {
  try {
    const pending = Promise.resolve(Sentry.flush(SENTRY_FLUSH_MS)).then(
      () => undefined,
      () => undefined,
    );
    registerBackgroundFlush(pending);
    await pending;
  } catch {
    return;
  }
}

export async function reportServerError(error: unknown): Promise<void> {
  try {
    Sentry.captureException(error);
  } catch {
    return;
  }
  await flushSentry();
}

export async function reportRequestError(
  error: Parameters<Instrumentation.onRequestError>[0],
  request: Parameters<Instrumentation.onRequestError>[1],
  context: Parameters<Instrumentation.onRequestError>[2],
): Promise<void> {
  try {
    Sentry.captureRequestError(error, request, {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    });
  } catch {
    return;
  }
  await flushSentry();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await reportRequestError(error, request, context);
};
