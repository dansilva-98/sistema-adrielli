import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("backup local", () => {
  it("inclui os dados de auth usados pela identidade", () => {
    const source = readFileSync("scripts/backup-local-db.mjs", "utf8");
    expect(source).toContain('"users"');
    expect(source).toContain('"identities"');
    expect(source).toContain('"mfa_factors"');
    expect(source).toContain('"--schema", "auth"');
  });
});
