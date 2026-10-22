import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

describe("scrubSentryEvent", () => {
  it("remove corpo, cookies, autorização, query string e campos sensíveis", () => {
    const original = {
      request: {
        url: "https://anaaprender.example/equipe/entrar?token=abc&email=pessoa@example.com",
        query_string: "token=abc",
        data: { password: "segredo", note: "manter" },
        cookies: { session: "cookie-secreto" },
        headers: {
          Authorization: "Bearer segredo",
          Cookie: "session=cookie-secreto",
          "Content-Type": "application/json",
        },
      },
      extra: {
        email: "pessoa@example.com",
        phone: "11999999999",
        cpf: "00000000000",
        nested: { code: "123456", token: "abc", ok: true },
      },
      user: { email: "pessoa@example.com", id: "user-1" },
      message: "falha em https://anaaprender.example/rota?password=segredo",
    };

    const scrubbed = scrubSentryEvent(original);
    const serialized = JSON.stringify(scrubbed);

    expect(original.request.data.password).toBe("segredo");
    expect(scrubbed.request.data).toBeUndefined();
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.query_string).toBeUndefined();
    expect(scrubbed.request.headers.Authorization).toBeUndefined();
    expect(scrubbed.request.headers.Cookie).toBeUndefined();
    expect(scrubbed.request.headers["Content-Type"]).toBe("application/json");
    expect(scrubbed.request.url).toBe("https://anaaprender.example/equipe/entrar");
    expect(scrubbed.extra.email).toBeUndefined();
    expect(scrubbed.extra.phone).toBeUndefined();
    expect(scrubbed.extra.cpf).toBeUndefined();
    expect(scrubbed.extra.nested.code).toBeUndefined();
    expect(scrubbed.extra.nested.token).toBeUndefined();
    expect(scrubbed.extra.nested.ok).toBe(true);
    expect(scrubbed.user.email).toBeUndefined();
    expect(scrubbed.user.id).toBe("user-1");
    expect(serialized).not.toContain("pessoa@example.com");
    expect(serialized).not.toContain("Bearer segredo");
    expect(serialized).not.toContain("cookie-secreto");
    expect(serialized).not.toContain("password=segredo");
    expect(scrubbed.message).toBe("falha em https://anaaprender.example/rota");
  });
});
