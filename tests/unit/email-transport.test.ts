import { afterEach, describe, expect, it, vi } from "vitest";

import { sendStaffEmail } from "@/modules/identity/email-transport";

describe("envio de e-mail da equipe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborta o fetch do Resend em 10 segundos", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendStaffEmail({
      message: {
        to: "equipe@example.com",
        subject: "Seu código de acesso: 123456",
        text: "123456",
        html: "<p>123456</p>",
      },
      from: "Adrielli Flores <nao-responda@adrielliflores.com.br>",
      transport: "resend",
      apiKey: "re_test",
    });
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
