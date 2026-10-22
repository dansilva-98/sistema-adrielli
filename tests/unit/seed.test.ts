import { describe, expect, it } from "vitest";

import {
  assertLocalDatabaseAllowed,
  assertRuntimeDatabaseUrl,
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

  it("recusa TEST_DATABASE_URL apontando para postgres ou ana_aprender_test", () => {
    const testDatabaseUrl =
      "postgresql://postgres:postgres@127.0.0.1:54322/adrielli_flores_test";
    const anaAprenderUrl =
      "postgresql://postgres:postgres@127.0.0.1:54322/ana_aprender_test";
    expect(() => assertTestDatabaseUrl("development", localDatabaseUrl)).toThrow(
      /adrielli_flores_test/,
    );
    expect(() => assertTestDatabaseUrl("development", anaAprenderUrl)).toThrow(
      /adrielli_flores_test/,
    );
    expect(() => assertTestDatabaseUrl("staging", testDatabaseUrl)).toThrow(
      /development/,
    );
    expect(() => assertTestDatabaseUrl("development", testDatabaseUrl)).not.toThrow();
  });

  it("recusa URL de runtime que não usa o papel app_runtime", () => {
    const runtimeUrl =
      "postgresql://app_runtime:app-runtime-local@127.0.0.1:54322/adrielli_flores_test";
    expect(() => assertRuntimeDatabaseUrl("development", localDatabaseUrl)).toThrow(
      /app_runtime/,
    );
    expect(() => assertRuntimeDatabaseUrl("staging", runtimeUrl)).toThrow(/development/);
    expect(() => assertRuntimeDatabaseUrl("development", runtimeUrl)).not.toThrow();
  });
});
