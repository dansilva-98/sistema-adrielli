import { describe, expect, it } from "vitest";

import { clientIp } from "@/modules/identity/staff-session";

function headers(values: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name: string) {
      return name in values ? values[name] : null;
    },
  };
}

describe("clientIp", () => {
  it("ignora o X-Forwarded-For forjado quando a Netlify informa o IP", () => {
    expect(
      clientIp(
        headers({
          "x-forwarded-for": "203.0.113.9",
          "x-nf-client-connection-ip": "198.51.100.10",
        }),
      ),
    ).toBe("198.51.100.10");
  });

  it("não usa o X-Forwarded-For quando o cabeçalho da Netlify vem vazio ou inválido", () => {
    expect(
      clientIp(
        headers({
          "x-forwarded-for": "203.0.113.9",
          "x-nf-client-connection-ip": "",
        }),
      ),
    ).toBeNull();
    expect(
      clientIp(
        headers({
          "x-forwarded-for": "203.0.113.9",
          "x-nf-client-connection-ip": "not-an-ip",
        }),
      ),
    ).toBeNull();
  });

  it("usa o primeiro X-Forwarded-For fora da Netlify", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.10" }))).toBe(
      "203.0.113.9",
    );
  });
});
