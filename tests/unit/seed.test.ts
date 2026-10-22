import { describe, expect, it } from "vitest";

import { assertSeedAllowed } from "../../src/db/seed";

describe("db:seed", () => {
  it("recusa ambiente que não seja development", () => {
    expect(() => assertSeedAllowed("production")).toThrow(/development/);
    expect(() => assertSeedAllowed("staging")).toThrow(/development/);
    expect(() => assertSeedAllowed(undefined)).toThrow(/development/);
    expect(() => assertSeedAllowed("development")).not.toThrow();
  });
});
