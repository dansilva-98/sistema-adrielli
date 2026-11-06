import { afterEach, describe, expect, it, vi } from "vitest";

import { sendStaffEmail } from "@/modules/identity/email-transport";

const message = {
  to: "equipe@example.com",
  subject: "Seu código de acesso: 123456",
  text: "123456",
  html: "<p>123456</p>",
};

describe("envio de e-mail da equipe", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborta o fetch do Resend em 10 segundos", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return;
            const fail = () =>
              reject(new DOMException("The operation was aborted.", "TimeoutError"));
            if (signal.aborted) {
              fail();
              return;
            }
            signal.addEventListener("abort", fail, { once: true });
          }),
      ),
    );
    const pending = sendStaffEmail({
      message,
      from: "Adrielli Flores <nao-responda@adrielliflores.com.br>",
      transport: "resend",
      apiKey: "re_test",
    });
    const expectFailure = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await expectFailure;
  });
});
