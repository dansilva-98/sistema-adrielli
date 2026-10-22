import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migration de privilégios", () => {
  it("revoga anon e authenticated nos cinco schemas", () => {
    const sql = readFileSync("src/db/migrations/0001_restrict_api_roles.sql", "utf8");
    for (const schema of ["identity", "content", "commerce", "clinic", "audit"]) {
      expect(sql).toContain(`'${schema}'`);
    }
    expect(sql).toContain("REVOKE ALL ON SCHEMA");
    expect(sql).toContain("anon, authenticated");
    expect(sql).toContain("ALTER DEFAULT PRIVILEGES");
    expect(sql).toContain("pg_has_role(current_user, owner_name, 'MEMBER')");
  });
});
