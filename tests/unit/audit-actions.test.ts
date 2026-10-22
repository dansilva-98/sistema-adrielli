import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/db/audit-actions";

describe("ações de auditoria", () => {
  it("mantém a lista da T1.7 no check da migration", () => {
    const sql = readFileSync("src/db/migrations/0003_identity_tables.sql", "utf8");
    for (const action of AUDIT_ACTIONS) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(AUDIT_ACTIONS).toHaveLength(14);
  });
});
