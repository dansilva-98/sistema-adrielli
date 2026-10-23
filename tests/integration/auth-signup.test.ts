import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { describe, expect, it } from "vitest";

import { parseClientEnv } from "@/lib/env";

describe("cadastro aberto do Auth", () => {
  it("recusa POST /auth/v1/signup com a chave pública", async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const client = parseClientEnv(process.env);
    const response = await fetch(
      new URL("/auth/v1/signup", client.NEXT_PUBLIC_SUPABASE_URL),
      {
        method: "POST",
        headers: {
          apikey: client.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${client.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `cadastro-${crypto.randomUUID()}@example.com`,
          password: "correta-senha-12",
        }),
      },
    );

    expect(response.ok).toBe(false);
    const body: unknown = await response.json();
    const text = JSON.stringify(body);
    expect(text).toMatch(/signup_disabled|Signups not allowed/i);
    expect(text).not.toContain("access_token");
  });
});
