import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";

const STAFF_ID = "a1111111-1111-4111-8111-111111111111";
const PATIENT_ID = "a2222222-2222-4222-8222-222222222222";
const PATIENT_2_ID = "a2222222-2222-4222-8222-222222222223";
const GUARDIAN_ID = "a3333333-3333-4333-8333-333333333333";
const TABLES = ["settings", "packages", "appointments"] as const;

describe("tabelas da agenda", () => {
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
      values (${STAFF_ID}::uuid, 'STAFF', 'agenda-tables@example.com', 'Staff')
    `;
    await runtime.begin(async (transaction) => {
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (${PATIENT_ID}::uuid, 'Paciente Agenda', '2018-01-02', ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.guardians (id, full_name, relationship, phone)
        values (${GUARDIAN_ID}::uuid, 'Responsavel Agenda', 'MOTHER', '11911112222')
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_ID}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (${PATIENT_2_ID}::uuid, 'Outro Paciente Agenda', '2017-03-04', ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_2_ID}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
    });
  });

  afterAll(async () => {
    await owner`delete from clinic.appointments where created_by = ${STAFF_ID}::uuid`;
    await owner`
      delete from clinic.packages
      where patient_id in (${PATIENT_ID}::uuid, ${PATIENT_2_ID}::uuid)
    `;
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    try {
      await owner`
        delete from clinic.patient_guardians
        where patient_id in (${PATIENT_ID}::uuid, ${PATIENT_2_ID}::uuid)
      `;
      await owner`delete from clinic.patients where id in (${PATIENT_ID}::uuid, ${PATIENT_2_ID}::uuid)`;
      await owner`delete from clinic.guardians where id = ${GUARDIAN_ID}::uuid`;
    } finally {
      await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
    }
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
  });

  it("nega as tabelas da agenda a anon e authenticated", async () => {
    const grants = await owner<{ grantee: string }[]>`
      select grantee
      from information_schema.role_table_grants
      where table_schema = 'clinic'
        and table_name in ('settings', 'packages', 'appointments')
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

  it("dá ao app_runtime leitura e escrita sem exclusão", async () => {
    const expected = {
      settings: ["SELECT", "UPDATE"],
      packages: ["INSERT", "SELECT", "UPDATE"],
      appointments: ["INSERT", "SELECT", "UPDATE"],
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

  it("mantém settings como linha única com duração 50 e btree_gist em extensions", async () => {
    const settings = await runtime<
      { id: number; default_duration_minutes: number; reminder_send_hour: number }[]
    >`
      select id, default_duration_minutes, reminder_send_hour
      from clinic.settings
      where id = 1
    `;
    expect(settings).toEqual([
      { id: 1, default_duration_minutes: 50, reminder_send_hour: 9 },
    ]);
    await expect(owner`insert into clinic.settings (id) values (2)`).rejects.toThrow(
      /settings_id_singleton/,
    );
    await expect(
      runtime`
        update clinic.settings
        set reminder_send_hour = 24
        where id = 1
      `,
    ).rejects.toThrow(/settings_reminder_send_hour/);

    const extension = await owner<{ nspname: string }[]>`
      select n.nspname
      from pg_extension as e
      join pg_namespace as n on n.oid = e.extnamespace
      where e.extname = 'btree_gist'
    `;
    expect(extension[0]?.nspname).toBe("extensions");

    const exclusion = await owner<{ definition: string }[]>`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'appointments_no_overlap'
    `;
    expect(exclusion[0]?.definition.toLowerCase()).toContain("exclude using gist");
    expect(exclusion[0]?.definition).toContain("tstzrange");
    expect(exclusion[0]?.definition).toContain("scheduled");
    expect(exclusion[0]?.definition).toContain("completed");
  });

  it("recusa sobreposição de scheduled ou completed e aceita faixa adjacente", async () => {
    const start = new Date("2027-03-01T11:00:00.000Z");
    const mid = new Date("2027-03-01T11:50:00.000Z");
    const end = new Date("2027-03-01T12:40:00.000Z");
    await runtime`
      insert into clinic.appointments (
        patient_id, starts_at, ends_at, created_by
      ) values (
        ${PATIENT_ID}::uuid, ${start}, ${mid}, ${STAFF_ID}::uuid
      )
    `;
    await expect(
      runtime`
        insert into clinic.appointments (
          patient_id, starts_at, ends_at, created_by
        ) values (
          ${PATIENT_2_ID}::uuid, ${start}, ${mid}, ${STAFF_ID}::uuid
        )
      `,
    ).rejects.toThrow(/appointments_no_overlap|exclusion/);

    const adjacent = await runtime<{ id: string }[]>`
      insert into clinic.appointments (
        patient_id, starts_at, ends_at, created_by
      ) values (
        ${PATIENT_2_ID}::uuid, ${mid}, ${end}, ${STAFF_ID}::uuid
      )
      returning id
    `;
    expect(adjacent).toHaveLength(1);

    await runtime`
      update clinic.appointments
      set status = 'cancelled'
      where patient_id = ${PATIENT_ID}::uuid
        and starts_at = ${start}
    `;
    const overlappingCancelled = await runtime<{ id: string }[]>`
      insert into clinic.appointments (
        patient_id, starts_at, ends_at, created_by
      ) values (
        ${PATIENT_ID}::uuid, ${start}, ${mid}, ${STAFF_ID}::uuid
      )
      returning id
    `;
    expect(overlappingCancelled).toHaveLength(1);
  });

  it("aplica checks de horário, pacote, reposição única e vínculo de remarcação", async () => {
    await expect(
      runtime`
        insert into clinic.appointments (
          patient_id, starts_at, ends_at, created_by
        ) values (
          ${PATIENT_ID}::uuid,
          ${new Date("2027-03-02T11:00:00.000Z")},
          ${new Date("2027-03-02T11:00:00.000Z")},
          ${STAFF_ID}::uuid
        )
      `,
    ).rejects.toThrow(/appointments_time_order/);

    await expect(
      runtime`
        insert into clinic.packages (patient_id, total_sessions, starts_on)
        values (${PATIENT_ID}::uuid, 0, '2027-03-01')
      `,
    ).rejects.toThrow(/packages_total_sessions/);
    await expect(
      runtime`
        insert into clinic.packages (patient_id, total_sessions, starts_on, price_cents)
        values (${PATIENT_ID}::uuid, 1, '2027-03-01', -1)
      `,
    ).rejects.toThrow(/packages_price_cents/);

    const missed = await runtime<{ id: string }[]>`
      insert into clinic.appointments (
        patient_id, starts_at, ends_at, status, created_by
      ) values (
        ${PATIENT_ID}::uuid,
        ${new Date("2027-03-03T11:00:00.000Z")},
        ${new Date("2027-03-03T11:50:00.000Z")},
        'missed_notified',
        ${STAFF_ID}::uuid
      )
      returning id
    `;
    const missedId = missed[0]!.id;
    await runtime`
      insert into clinic.appointments (
        patient_id, starts_at, ends_at, makeup_of_id, created_by
      ) values (
        ${PATIENT_ID}::uuid,
        ${new Date("2027-03-04T11:00:00.000Z")},
        ${new Date("2027-03-04T11:50:00.000Z")},
        ${missedId}::uuid,
        ${STAFF_ID}::uuid
      )
    `;
    await expect(
      runtime`
        insert into clinic.appointments (
          patient_id, starts_at, ends_at, makeup_of_id, created_by
        ) values (
          ${PATIENT_ID}::uuid,
          ${new Date("2027-03-05T11:00:00.000Z")},
          ${new Date("2027-03-05T11:50:00.000Z")},
          ${missedId}::uuid,
          ${STAFF_ID}::uuid
        )
      `,
    ).rejects.toThrow(/appointments_makeup_of_unique|duplicate key/);

    await expect(
      runtime`
        insert into clinic.appointments (
          patient_id, starts_at, ends_at, rescheduled_to_id, created_by
        ) values (
          ${PATIENT_ID}::uuid,
          ${new Date("2027-03-06T11:00:00.000Z")},
          ${new Date("2027-03-06T11:50:00.000Z")},
          ${missedId}::uuid,
          ${STAFF_ID}::uuid
        )
      `,
    ).rejects.toThrow(/appointments_rescheduled_link/);
  });
});
