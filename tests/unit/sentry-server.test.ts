import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock("@sentry/nextjs", () => sentry);

import {
  onRequestError,
  reportRequestError,
  reportServerError,
  SENTRY_FLUSH_MS,
} from "@/lib/sentry-server";
import { readOrEmpty } from "@/modules/content/queries";

const request = {
  path: "/consultorio/agenda",
  method: "GET",
  headers: { accept: "text/html" },
};

const context = {
  routerKind: "App Router" as const,
  routePath: "/consultorio/agenda",
  routeType: "render" as const,
  renderSource: "react-server-components" as const,
  revalidateReason: undefined,
};

const NEXT_REQUEST_CONTEXT = Symbol.for("@next/request-context");

function installWaitUntil(waitUntil: (task: Promise<unknown>) => void) {
  const previous = (globalThis as unknown as Record<symbol, unknown>)[
    NEXT_REQUEST_CONTEXT
  ];
  (globalThis as unknown as Record<symbol, unknown>)[NEXT_REQUEST_CONTEXT] = {
    get: () => ({ waitUntil }),
  };
  return () => {
    (globalThis as unknown as Record<symbol, unknown>)[NEXT_REQUEST_CONTEXT] = previous;
  };
}

describe("relato de erro no servidor", () => {
  beforeEach(() => {
    sentry.captureException.mockReset();
    sentry.captureRequestError.mockReset();
    sentry.flush.mockReset();
    sentry.flush.mockResolvedValue(true);
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[NEXT_REQUEST_CONTEXT];
    vi.useRealTimers();
  });

  it("onRequestError captura e só termina depois do flush", async () => {
    const order: string[] = [];
    sentry.captureRequestError.mockImplementation(() => {
      order.push("capture");
    });
    sentry.flush.mockImplementation(async () => {
      order.push("flush");
      return true;
    });

    await onRequestError(new Error("falha controlada"), request, context);

    expect(sentry.captureRequestError).toHaveBeenCalledTimes(1);
    expect(sentry.captureRequestError.mock.calls[0]?.[2]).toEqual({
      routerKind: "App Router",
      routePath: "/consultorio/agenda",
      routeType: "render",
    });
    expect(sentry.flush).toHaveBeenCalledWith(SENTRY_FLUSH_MS);
    expect(order).toEqual(["capture", "flush"]);
  });

  it("reportServerError captura e faz flush", async () => {
    const error = new Error("ação falhou");
    await reportServerError(error);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(sentry.flush).toHaveBeenCalledWith(SENTRY_FLUSH_MS);
  });

  it("não resolve onRequestError antes do flush terminar", async () => {
    let release!: (value: boolean) => void;
    sentry.flush.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    let finished = false;
    const pending = Promise.resolve(
      onRequestError(new Error("falha controlada"), request, context),
    ).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(sentry.captureRequestError).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);
    release(true);
    await pending;
    expect(finished).toBe(true);
  });

  it("registra o flush no waitUntil do Next antes de a promise do hook terminar", async () => {
    const waitUntil = vi.fn();
    const restore = installWaitUntil(waitUntil);
    let release!: (value: boolean) => void;
    sentry.flush.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    try {
      const pending = Promise.resolve(
        onRequestError(new Error("falha controlada"), request, context),
      );
      await Promise.resolve();
      expect(waitUntil).toHaveBeenCalledTimes(1);
      const tracked = waitUntil.mock.calls[0]?.[0];
      expect(tracked).toBeInstanceOf(Promise);
      expect(sentry.captureRequestError).toHaveBeenCalledTimes(1);
      release(true);
      await pending;
      await tracked;
    } finally {
      restore();
    }
  });

  it("não lança se o flush falhar", async () => {
    sentry.flush.mockRejectedValue(new Error("fila fechada"));
    await expect(reportServerError(new Error("ação falhou"))).resolves.toBeUndefined();
    await expect(
      reportRequestError(new Error("rota falhou"), request, context),
    ).resolves.toBeUndefined();
  });

  it("não lança se a captura falhar", async () => {
    sentry.captureException.mockImplementation(() => {
      throw new Error("sdk");
    });
    sentry.captureRequestError.mockImplementation(() => {
      throw new Error("sdk");
    });
    await expect(reportServerError(new Error("ação falhou"))).resolves.toBeUndefined();
    await expect(
      reportRequestError(new Error("rota falhou"), request, context),
    ).resolves.toBeUndefined();
    expect(sentry.flush).not.toHaveBeenCalled();
  });

  it("as leituras públicas registram o flush sem esperar", () => {
    expect(readFileSync("src/modules/content/server/public.ts", "utf8")).toContain(
      "reportServerError(error, { wait: false })",
    );
  });

  it("readOrEmpty devolve o vazio sem esperar o flush", async () => {
    vi.useFakeTimers();
    const waitUntil = vi.fn();
    const restore = installWaitUntil(waitUntil);
    sentry.flush.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(true), SENTRY_FLUSH_MS);
        }),
    );
    try {
      const started = Date.now();
      const value = await readOrEmpty(
        async () => {
          throw new Error("banco indisponível");
        },
        [] as string[],
        (error) => reportServerError(error, { wait: false }),
      );
      expect(Date.now() - started).toBe(0);
      expect(value).toEqual([]);
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
      expect(waitUntil).toHaveBeenCalledTimes(1);
      const tracked = waitUntil.mock.calls[0]?.[0] as Promise<unknown>;
      let flushed = false;
      void tracked.then(() => {
        flushed = true;
      });
      await Promise.resolve();
      expect(flushed).toBe(false);
      await vi.advanceTimersByTimeAsync(SENTRY_FLUSH_MS);
      expect(flushed).toBe(true);
    } finally {
      restore();
    }
  });

  it("no padrão o reportServerError só termina depois do flush", async () => {
    vi.useFakeTimers();
    sentry.flush.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(true), SENTRY_FLUSH_MS);
        }),
    );
    let finished = false;
    const pending = reportServerError(new Error("ação falhou")).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(SENTRY_FLUSH_MS);
    await pending;
    expect(finished).toBe(true);
  });

  it("não lança se o waitUntil do Next falhar", async () => {
    const restore = installWaitUntil(() => {
      throw new Error("contexto");
    });
    try {
      await expect(reportServerError(new Error("ação falhou"))).resolves.toBeUndefined();
      expect(sentry.flush).toHaveBeenCalledWith(SENTRY_FLUSH_MS);
    } finally {
      restore();
    }
  });
});
