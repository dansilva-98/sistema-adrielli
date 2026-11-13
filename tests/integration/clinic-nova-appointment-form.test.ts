import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/identity/server/guard", () => ({
  assertRole: async () => {},
  requireStaff: async () => {
    throw new Error("requireStaff");
  },
  StaffAccessError: class StaffAccessError extends Error {
    reason = "forbidden";
  },
}));

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import {
  readNewAppointmentForm,
  readPatientAgenda,
} from "../../src/modules/clinic/server/agenda-read";
import type { Actor } from "../../src/modules/clinic/patients";

const STAFF_ID = "e1111111-1111-4111-8111-111111111111";
const PATIENT_ID = "e2222222-2222-4222-8222-222222222222";
const GUARDIAN_ID = "e3333333-3333-4333-8333-333333333333";
const ACTOR: Actor = { userId: STAFF_ID, ip: null };

function withoutPipeline(client: postgres.Sql): postgres.Sql {
  // Recusa tagged query sobreposta no mesmo cliente (max: 1). Não é o pooler real.
  let pending = 0;
  return new Proxy(client, {
    apply(target, thisArg, args) {
      if (pending > 0) throw new Error("Connection closed.");
      pending += 1;
      try {
        const result = Reflect.apply(target, thisArg, args) as Promise<unknown>;
        return Promise.resolve(result).finally(() => {
          pending -= 1;
        });
      } catch (error) {
        pending -= 1;
        throw error;
      }
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as postgres.Sql;
}

describe("formulário de nova sessão", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${STAFF_ID}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${STAFF_ID}::uuid, 'STAFF', 'agenda-nova-form@example.com', 'Staff')
    `;
    await runtime.begin(async (transaction) => {
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (${PATIENT_ID}::uuid, 'Paciente Nova Sessao', '2018-03-04', ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.guardians (id, full_name, relationship, phone)
        values (${GUARDIAN_ID}::uuid, 'Responsavel Nova Sessao', 'MOTHER', '11900001311')
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_ID}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
    });
  });

  afterAll(async () => {
    await owner`alter table audit.audit_log disable trigger audit_log_immutable`;
    await owner`delete from audit.audit_log where actor_user_id = ${STAFF_ID}::uuid`;
    await owner`alter table audit.audit_log enable trigger audit_log_immutable`;
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    try {
      await owner`delete from clinic.patient_guardians where patient_id = ${PATIENT_ID}::uuid`;
      await owner`delete from clinic.patients where id = ${PATIENT_ID}::uuid`;
      await owner`delete from clinic.guardians where id = ${GUARDIAN_ID}::uuid`;
    } finally {
      await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
    }
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
  });

  it("carrega settings, ficha e pacotes sem abrir duas queries ao mesmo tempo", async () => {
    const db = withoutPipeline(runtime);
    const result = await readNewAppointmentForm(db, ACTOR, PATIENT_ID);
    expect(result.patient?.id).toBe(PATIENT_ID);
    expect(result.settings.defaultDurationMinutes).toBeGreaterThan(0);
    expect(result.packages).toEqual([]);
  });

  it("lê a agenda do paciente sem abrir duas queries ao mesmo tempo", async () => {
    const db = withoutPipeline(runtime);
    const result = await readPatientAgenda(PATIENT_ID, db);
    expect(result.appointments).toEqual([]);
    expect(result.packages).toEqual([]);
  });
});
