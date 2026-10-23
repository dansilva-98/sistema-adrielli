import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("backup local", () => {
  it("inclui os dados de auth usados pela identidade", () => {
    const source = readFileSync("scripts/backup-local-db.mjs", "utf8");
    expect(source).toContain('"users"');
    expect(source).toContain('"identities"');
    expect(source).toContain('"mfa_factors"');
    expect(source).toContain('"--schema", "auth"');
    const authSchema = source.indexOf('"-- auth schema"');
    const authData = source.indexOf('"-- auth data"');
    const appSchema = source.indexOf('"-- schema"');
    const appData = source.indexOf('"-- data"');
    expect(authSchema).toBeGreaterThan(-1);
    expect(authSchema).toBeLessThan(authData);
    expect(authData).toBeLessThan(appSchema);
    expect(appSchema).toBeLessThan(appData);
  });
});
