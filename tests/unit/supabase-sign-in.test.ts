import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  sessionIdFromAccessToken,
  signInWithSupabase,
} from "@/modules/identity/supabase-sign-in";

function accessToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

describe("sessão do Supabase no login", () => {
  it("lê o session_id do token de acesso", () => {
    expect(sessionIdFromAccessToken(accessToken({ session_id: "sess-1" }))).toBe(
      "sess-1",
    );
    expect(sessionIdFromAccessToken(accessToken({}))).toBeNull();
    expect(sessionIdFromAccessToken("sem-ponto")).toBeNull();
  });

  it("encerra a sessão quando o token não traz session_id", async () => {
    let signedOut = false;
    const client = {
      auth: {
        signInWithPassword: async () => ({
          error: null,
          data: {
            user: { id: "user-1" },
            session: { access_token: accessToken({ sub: "user-1" }) },
          },
        }),
        signOut: async () => {
          signedOut = true;
          return { error: null };
        },
      },
    } as unknown as SupabaseClient;

    await expect(
      signInWithSupabase(client, "pessoa@example.com", "senha"),
    ).resolves.toBeNull();
    expect(signedOut).toBe(true);
  });
});
