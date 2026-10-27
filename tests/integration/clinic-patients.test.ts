import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import {
  archivePatient,
  ClinicRuleError,
  createPatient,
  linkGuardian,
  listPatients,
  setPrimaryGuardian,
  unlinkGuardian,
  type Actor,
} from "../../src/modules/clinic/patients";

const STAFF_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const OTHER_GUARDIAN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const ACTOR: Actor = { userId: STAFF_ID, ip: null };

describe("cadastro de pacientes", () => {
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
    await owner`
      insert into auth.users (id) values (${STAFF_ID}::uuid)
      on conflict (id) do nothing
    `;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${STAFF_ID}::uuid, 'STAFF', 'clinic-patients-e72@example.com', 'Staff')
      on conflict (id) do nothing
    `;
  });

  afterAll(async () => {
    const patients = await owner<{ id: string }[]>`
      select id from clinic.patients where created_by = ${STAFF_ID}::uuid
    `;
    const patientIds = patients.map((row) => row.id);
    if (patientIds.length > 0) {
      await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
      const guardians = await owner<{ guardian_id: string }[]>`
        select guardian_id from clinic.patient_guardians
        where patient_id in ${owner(patientIds)}
      `;
      await owner`delete from clinic.patient_attachments where patient_id in ${owner(patientIds)}`;
      await owner`delete from clinic.patient_guardians where patient_id in ${owner(patientIds)}`;
      await owner`delete from clinic.patients where id in ${owner(patientIds)}`;
      const guardianIds = guardians.map((row) => row.guardian_id);
      if (guardianIds.length > 0) {
        await owner`delete from clinic.guardians where id in ${owner(guardianIds)}`;
      }
    }
    await owner`delete from clinic.guardians where id = ${OTHER_GUARDIAN}::uuid`;
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
  });

  it("busca sem acento, recusa o último responsável e arquiva", async () => {
    const patientId = await createPatient(runtime, ACTOR, {
      fullName: "João da Conceição",
      preferredName: null,
      birthDate: "2018-01-02",
      cpf: "52998224725",
      school: null,
      schoolGrade: null,
      referralSource: null,
      notes: null,
      addressText: null,
      confirmDuplicate: false,
      guardian: {
        fullName: "Maria da Conceição",
        relationship: "MOTHER",
        phone: "11987654321",
        email: null,
        cpf: null,
        receivesReminders: false,
      },
    });

    const byName = await listPatients(runtime, {
      query: "joao da conceicao",
      archived: false,
    });
    expect(byName.map((row) => row.id)).toContain(patientId);
    const byPhone = await listPatients(runtime, { query: "987654321", archived: false });
    expect(byPhone.map((row) => row.id)).toContain(patientId);

    await expect(
      createPatient(runtime, ACTOR, {
        fullName: "joao da conceicao",
        preferredName: null,
        birthDate: "2018-01-02",
        cpf: null,
        school: null,
        schoolGrade: null,
        referralSource: null,
        notes: null,
        addressText: null,
        confirmDuplicate: false,
        guardian: {
          fullName: "Paulo",
          relationship: "FATHER",
          phone: "11987654322",
          email: null,
          cpf: null,
          receivesReminders: false,
        },
      }),
    ).rejects.toBeInstanceOf(ClinicRuleError);

    const siblingId = await createPatient(runtime, ACTOR, {
      fullName: "joao da conceicao",
      preferredName: null,
      birthDate: "2018-01-02",
      cpf: null,
      school: null,
      schoolGrade: null,
      referralSource: null,
      notes: null,
      addressText: null,
      confirmDuplicate: true,
      guardian: {
        fullName: "Paulo",
        relationship: "FATHER",
        phone: "11987654322",
        email: null,
        cpf: null,
        receivesReminders: false,
      },
    });
    expect(siblingId).not.toBe(patientId);

    const primary = byName.find((row) => row.id === patientId);
    const guardianRows = await runtime<{ id: string }[]>`
      select guardian_id as id from clinic.patient_guardians
      where patient_id = ${patientId}::uuid and is_primary
    `;
    await expect(
      unlinkGuardian(runtime, ACTOR, patientId, guardianRows[0]!.id),
    ).rejects.toMatchObject({ code: "last-guardian" });

    await owner`
      insert into clinic.guardians (id, full_name, relationship, phone)
      values (${OTHER_GUARDIAN}::uuid, 'Ana Costa', 'GRANDMOTHER', '11987654323')
      on conflict (id) do nothing
    `;
    await linkGuardian(runtime, ACTOR, patientId, OTHER_GUARDIAN);
    await setPrimaryGuardian(runtime, ACTOR, patientId, OTHER_GUARDIAN);
    await unlinkGuardian(runtime, ACTOR, patientId, guardianRows[0]!.id);
    const after = await listPatients(runtime, { query: "ana costa", archived: false });
    expect(
      after.some((row) => row.id === patientId && row.guardianName === "Ana Costa"),
    ).toBe(true);

    await archivePatient(runtime, ACTOR, patientId);
    const active = await listPatients(runtime, {
      query: "joao da conceicao",
      archived: false,
    });
    const archived = await listPatients(runtime, {
      query: "joao da conceicao",
      archived: true,
    });
    expect(active.map((row) => row.id)).not.toContain(patientId);
    expect(archived.map((row) => row.id)).toContain(patientId);

    const viewed = await runtime<{ metadata: unknown }[]>`
      select metadata from audit.audit_log
      where action = 'clinic.patient.created' and entity_id = ${patientId}::uuid
    `;
    expect(viewed[0]?.metadata).toEqual({});
    expect(primary?.fullName).toBe("João da Conceição");
  });
});
