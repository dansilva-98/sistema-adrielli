import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EMAIL_MFA_CLEANUP_MS, EMAIL_MFA_TTL_MS } from "@/modules/identity/email-mfa";
import { LOGIN_WINDOW_MS, STAFF_MAX_MS } from "@/modules/identity/staff-session";

describe("limpeza de identity", () => {
  it("as janelas de login e do código cabem nos prazos de limpeza", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    expect(LOGIN_WINDOW_MS).toBeLessThan(30 * dayMs);
    expect(EMAIL_MFA_TTL_MS).toBeLessThan(dayMs);
    expect(EMAIL_MFA_CLEANUP_MS).toBeLessThanOrEqual(dayMs);
    expect(STAFF_MAX_MS).toBeLessThan(dayMs);
  });

  it("a migration 0019 dá DELETE só em linhas antigas", () => {
    const sql = readFileSync(
      "src/db/migrations/0019_identity_prune_old_rows.sql",
      "utf8",
    );
    expect(sql).toContain(
      'GRANT DELETE ON TABLE "identity"."login_attempts" TO app_runtime',
    );
    expect(sql).toContain(
      'DROP POLICY "app_runtime_delete" ON "identity"."staff_email_mfa_challenges"',
    );
    expect(sql).toContain("\"attempted_at\" < now() - interval '30 days'");
    expect(sql).toContain("\"created_at\" < now() - interval '1 day'");
    expect(sql).toContain("consumed_at");
    expect(sql).toContain("expires_at");
    expect(sql).not.toMatch(/ON DELETE cascade/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
