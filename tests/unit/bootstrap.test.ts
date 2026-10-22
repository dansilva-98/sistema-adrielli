import { describe, expect, it } from "vitest";

import {
  inviteStaffByEmail,
  readBootstrapEmail,
} from "@/modules/identity/bootstrap-super-admin";

describe("bootstrap do SUPER_ADMIN", () => {
  it("lê o e-mail do comando e recusa a chamada sem ele", () => {
    expect(readBootstrapEmail(["--email", "Admin@Example.com"])).toBe(
      "admin@example.com",
    );
    expect(() => readBootstrapEmail([])).toThrow(/Uso: pnpm admin:bootstrap/);
  });

  it("convida pela API admin e não revela a chave quando o convite falha", async () => {
    const secret = "service-role-test";
    let requestUrl = "";
    let authorization = "";
    const created = await inviteStaffByEmail({
      supabaseUrl: "http://127.0.0.1:54321",
      serviceRoleKey: secret,
      email: "admin@example.com",
      fetchImpl: async (url, init) => {
        requestUrl = String(url);
        const headers = new Headers(init?.headers);
        authorization = headers.get("Authorization") ?? "";
        return new Response(
          JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
          { status: 200 },
        );
      },
    });
    expect(created.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(requestUrl).toBe("http://127.0.0.1:54321/auth/v1/invite");
    expect(authorization).toBe(`Bearer ${secret}`);

    await expect(
      inviteStaffByEmail({
        supabaseUrl: "http://127.0.0.1:54321",
        serviceRoleKey: secret,
        email: "admin@example.com",
        fetchImpl: async () => new Response("nope", { status: 500 }),
      }),
    ).rejects.toThrow(/^Recusado: o convite no Supabase Auth falhou\.$/);
  });
});
