import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";

const STAFF_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PATIENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const GUARDIAN_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const ATTACHMENT_ID = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const VALID_CPF = "52998224725";
const TABLES = [
  "patients",
  "guardians",
  "patient_guardians",
  "patient_attachments",
] as const;

describe("tabelas de pacientes", () => {
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
      values (${STAFF_ID}::uuid, 'STAFF', 'clinic-staff@example.com', 'Staff')
    `;
  });

  afterAll(async () => {
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    await owner`delete from clinic.patient_attachments where uploaded_by = ${STAFF_ID}::uuid`;
    await owner`delete from clinic.patient_guardians where patient_id = ${PATIENT_ID}::uuid`;
    await owner`delete from clinic.patients where created_by = ${STAFF_ID}::uuid`;
    await owner`delete from clinic.guardians where id = ${GUARDIAN_ID}::uuid`;
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner?.end({ timeout: 5 });
    await runtime?.end({ timeout: 5 });
  });

  it("nega as tabelas da clínica a anon e authenticated", async () => {
    const grants = await owner<{ grantee: string }[]>`
      select grantee
      from information_schema.role_table_grants
      where table_schema = 'clinic'
        and grantee in ('anon', 'authenticated', 'PUBLIC')
    `;
    expect(grants).toEqual([]);
    for (const role of ["anon", "authenticated"]) {
      for (const table of TABLES) {
        await expect(
          owner.begin(async (transaction) => {
            await transaction.unsafe(`SET LOCAL ROLE ${role}`);
            await transaction.unsafe(`SELECT 1 FROM clinic.${table}`);
          }),
        ).rejects.toThrow(/permission denied|permissão negada/i);
      }
    }
  });

  it("dá ao app_runtime leitura e escrita sem exclusão de paciente ou anexo", async () => {
    const expected = {
      patients: ["INSERT", "SELECT", "UPDATE"],
      guardians: ["INSERT", "SELECT", "UPDATE"],
      patient_guardians: ["DELETE", "INSERT", "SELECT", "UPDATE"],
      patient_attachments: ["INSERT", "SELECT", "UPDATE"],
    } as const;
    for (const table of TABLES) {
      const grants = await owner<{ privilege_type: string }[]>`
        select privilege_type
        from information_schema.role_table_grants
        where table_schema = 'clinic'
          and table_name = ${table}
          and grantee = 'app_runtime'
        order by privilege_type
      `;
      expect(grants.map((row) => row.privilege_type)).toEqual([...expected[table]]);
    }
  });

  it("recusa paciente sem responsável e aceita o par na mesma transação", async () => {
    await expect(
      runtime.begin(async (transaction) => {
        await transaction`
          insert into clinic.patients (id, full_name, birth_date, created_by)
          values (${PATIENT_ID}::uuid, 'Ana', '2018-01-02', ${STAFF_ID}::uuid)
        `;
      }),
    ).rejects.toThrow(/patient must have a guardian/);

    await runtime.begin(async (transaction) => {
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, cpf, created_by)
        values (${PATIENT_ID}::uuid, 'João da Silva', '2018-01-02', ${VALID_CPF}, ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.guardians (id, full_name, relationship, phone, cpf)
        values (${GUARDIAN_ID}::uuid, 'Maria da Silva', 'MOTHER', '11987654321', null)
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_ID}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
    });

    const found = await runtime<{ full_name_search: string }[]>`
      select full_name_search
      from clinic.patients
      where full_name_search = clinic.fold_search('joao da silva')
    `;
    expect(found).toHaveLength(1);

    await expect(
      runtime`delete from clinic.patient_guardians where patient_id = ${PATIENT_ID}::uuid`,
    ).rejects.toThrow(/patient must have a guardian/);
    await expect(
      runtime`
        insert into clinic.patients (full_name, birth_date, cpf, created_by)
        values ('Outro', '2019-02-03', ${VALID_CPF}, ${STAFF_ID}::uuid)
      `,
    ).rejects.toThrow(/patients_cpf_unique|duplicate key/);
    await expect(
      runtime`
        insert into clinic.guardians (full_name, relationship, phone)
        values ('Sem dígito', 'FATHER', '11 98765-4321')
      `,
    ).rejects.toThrow(/guardians_phone_digits/);
    await expect(
      runtime`
        insert into clinic.patients (full_name, birth_date, cpf, created_by)
        values ('Cpf', '2019-02-03', '11111111111', ${STAFF_ID}::uuid)
      `,
    ).rejects.toThrow(/patients_cpf_valid/);
  });

  it("grava anexo no caminho do paciente e cria o bucket privado", async () => {
    const path = `patients/${PATIENT_ID}/${ATTACHMENT_ID}.pdf`;
    await runtime`
      insert into clinic.patient_attachments (
        id, patient_id, storage_path, original_name, mime_type, size_bytes, sha256, category, uploaded_by
      ) values (
        ${ATTACHMENT_ID}::uuid,
        ${PATIENT_ID}::uuid,
        ${path},
        'laudo.pdf',
        'application/pdf',
        1200,
        ${"a".repeat(64)},
        'CLINICAL_REPORT',
        ${STAFF_ID}::uuid
      )
    `;
    await expect(
      runtime`
        insert into clinic.patient_attachments (
          patient_id, storage_path, original_name, mime_type, size_bytes, sha256, category, uploaded_by
        ) values (
          ${PATIENT_ID}::uuid,
          'patients/outro/arquivo.pdf',
          'laudo.pdf',
          'application/pdf',
          1200,
          ${"b".repeat(64)},
          'CLINICAL_REPORT',
          ${STAFF_ID}::uuid
        )
      `,
    ).rejects.toThrow(/patient_attachments_storage_path/);

    const buckets = await owner<{ present: boolean }[]>`
      select to_regclass('storage.buckets') is not null as present
    `;
    if (buckets[0]?.present) {
      const rows = await owner<{ public: boolean; file_size_limit: string }[]>`
        select public, file_size_limit::text
        from storage.buckets
        where id = 'clinic-private'
      `;
      expect(rows[0]?.public).toBe(false);
      expect(rows[0]?.file_size_limit).toBe("10485760");
    }
  });
});
