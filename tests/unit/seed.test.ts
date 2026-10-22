import { describe, expect, it } from "vitest";

import {
  assertLocalDatabaseAllowed,
  assertSeedAllowed,
  assertTestDatabaseUrl,
} from "../../src/db/seed";

const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const remoteDatabaseUrl = "postgresql://postgres:postgres@db.example.com:6543/postgres";

describe("guarda do banco local", () => {
  it("recusa staging, production e host remoto sem abrir conexão", () => {
    expect(() => assertLocalDatabaseAllowed("staging", localDatabaseUrl)).toThrow(
      /development/,
    );
    expect(() => assertLocalDatabaseAllowed("production", localDatabaseUrl)).toThrow(
      /development/,
    );
    expect(() => assertLocalDatabaseAllowed(undefined, localDatabaseUrl)).toThrow(
      /development/,
    );
    expect(() => assertLocalDatabaseAllowed("development", remoteDatabaseUrl)).toThrow(
      /127\.0\.0\.1 ou localhost/,
    );
    expect(() =>
      assertSeedAllowed(
        "development",
        "postgresql://postgres:postgres@localhost/postgres",
      ),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabaseAllowed("development", localDatabaseUrl),
    ).not.toThrow();
  });

  it("recusa TEST_DATABASE_URL apontando para o banco postgres", () => {
    const testDatabaseUrl =
      "postgresql://postgres:postgres@127.0.0.1:54322/ana_aprender_test";
    expect(() => assertTestDatabaseUrl("development", localDatabaseUrl)).toThrow(
      /ana_aprender_test/,
    );
    expect(() => assertTestDatabaseUrl("staging", testDatabaseUrl)).toThrow(
      /development/,
    );
    expect(() => assertTestDatabaseUrl("development", testDatabaseUrl)).not.toThrow();
  });
});
