import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/db/audit-actions";

const T1_7_ACTIONS = [
  "user.bootstrap",
  "auth.login.success",
  "auth.login.failure",
  "auth.logout",
  "auth.session.expired",
  "auth.mfa.enrolled",
  "auth.mfa.failure",
  "auth.password.reset",
  "user.invited",
  "user.role.granted",
  "user.role.revoked",
  "user.disabled",
  "user.enabled",
  "access.denied",
] as const;

describe("ações de auditoria", () => {
  it("mantém a lista da T1.7 no check da migration", () => {
    const sql = readFileSync("src/db/migrations/0003_identity_tables.sql", "utf8");
    for (const action of T1_7_ACTIONS) {
      expect(sql).toContain(`'${action}'`);
    }
  });

  it("inclui os eventos de conteúdo no check e cria o bucket público", () => {
    const sql = readFileSync("src/db/migrations/0006_content_tables.sql", "utf8");
    for (const action of AUDIT_ACTIONS.filter(
      (action) => !action.startsWith("clinic."),
    )) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(AUDIT_ACTIONS.filter((action) => !action.startsWith("clinic."))).toHaveLength(
      T1_7_ACTIONS.length + 11,
    );
    expect(sql).toContain("'site-public'");
    expect(sql).toContain("4194304");
    expect(sql).toContain("'image/jpeg'");
    expect(sql).toContain("'image/png'");
    expect(sql).toContain("'image/webp'");
    expect(sql.toLowerCase()).toContain("on conflict (id) do nothing");
  });

  it("inclui os eventos da clínica e cria o bucket privado", () => {
    const sql = readFileSync("src/db/migrations/0009_clinic_patients.sql", "utf8");
    for (const action of AUDIT_ACTIONS) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(sql).toContain('"clinic"."patient_attachments"');
    expect(sql).toContain("CREATE EXTENSION unaccent WITH SCHEMA extensions");
    expect(sql).toContain("extensions.unaccent");
    expect(sql).toContain("'clinic-private'");
    expect(sql).toContain("10485760");
    expect(sql).toContain("false");
    expect(sql).toContain("'application/pdf'");
    expect(sql.toLowerCase()).toContain("on conflict (id) do nothing");
    expect(sql.toLowerCase()).not.toContain("on delete cascade");
  });
});
