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
  cancelAppointment,
  changeAppointmentStatus,
  createAppointment,
  createAppointmentSeries,
  scheduleMakeup,
  setAppointmentPackage,
} from "../../src/modules/clinic/appointments";
import type { Actor } from "../../src/modules/clinic/patients";
import { createPackage } from "../../src/modules/clinic/packages";

const STAFF_ID = "c1111111-1111-4111-8111-111111111111";
const PATIENT_A = "c2222222-2222-4222-8222-222222222221";
const PATIENT_B = "c2222222-2222-4222-8222-222222222222";
const GUARDIAN_ID = "c3333333-3333-4333-8333-333333333333";
const ACTOR: Actor = { userId: STAFF_ID, ip: null };
const LOOPS = 20;

function slot(index: number, hour: number): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(Date.UTC(2027, 5, 1 + index, hour, 0, 0, 0));
  return { startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000) };
}

function postgresCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresCode(error.cause);
  return "";
}

async function withoutDeadlock<T>(work: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (postgresCode(error) !== "40P01" || attempt === 4) throw error;
    }
  }
  throw lastError;
}

describe("concorrência da agenda (A1)", () => {
  let owner: ReturnType<typeof postgres>;
  let left: ReturnType<typeof postgres>;
  let right: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    left = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    right = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${STAFF_ID}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${STAFF_ID}::uuid, 'STAFF', 'agenda-concurrency@example.com', 'Staff')
    `;
    await owner.begin(async (transaction) => {
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (${PATIENT_A}::uuid, 'Paciente Concorrencia A', '2018-01-02', ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.guardians (id, full_name, relationship, phone)
        values (${GUARDIAN_ID}::uuid, 'Responsavel Concorrencia', 'MOTHER', '11933334444')
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_A}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
      await transaction`
        insert into clinic.patients (id, full_name, birth_date, created_by)
        values (${PATIENT_B}::uuid, 'Paciente Concorrencia B', '2017-02-03', ${STAFF_ID}::uuid)
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_B}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
    });
  });

  afterAll(async () => {
    await owner`alter table audit.audit_log disable trigger audit_log_immutable`;
    await owner`delete from audit.audit_log where actor_user_id = ${STAFF_ID}::uuid`;
    await owner`alter table audit.audit_log enable trigger audit_log_immutable`;
    await owner`delete from clinic.appointments where created_by = ${STAFF_ID}::uuid`;
    await owner`
      delete from clinic.packages
      where patient_id in (${PATIENT_A}::uuid, ${PATIENT_B}::uuid)
    `;
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    try {
      await owner`
        delete from clinic.patient_guardians
        where patient_id in (${PATIENT_A}::uuid, ${PATIENT_B}::uuid)
      `;
      await owner`delete from clinic.patients where id in (${PATIENT_A}::uuid, ${PATIENT_B}::uuid)`;
      await owner`delete from clinic.guardians where id = ${GUARDIAN_ID}::uuid`;
    } finally {
      await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
    }
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner.end({ timeout: 5 });
    await left.end({ timeout: 5 });
    await right.end({ timeout: 5 });
  });

  it(
    "INSERT sobrepostos: um grava e o outro recebe 23P01",
    { timeout: 60_000 },
    async () => {
      for (let index = 0; index < LOOPS; index += 1) {
        const { startsAt, endsAt } = slot(index, 11);
        const results = await Promise.allSettled([
          withoutDeadlock(
            () => left`
              insert into clinic.appointments (patient_id, starts_at, ends_at, created_by)
              values (${PATIENT_A}::uuid, ${startsAt}, ${endsAt}, ${STAFF_ID}::uuid)
            `,
          ),
          withoutDeadlock(
            () => right`
              insert into clinic.appointments (patient_id, starts_at, ends_at, created_by)
              values (${PATIENT_B}::uuid, ${startsAt}, ${endsAt}, ${STAFF_ID}::uuid)
            `,
          ),
        ]);
        const ok = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(ok, `loop ${index}`).toHaveLength(1);
        expect(failed, `loop ${index}`).toHaveLength(1);
        const reason = (failed[0] as PromiseRejectedResult).reason;
        expect(
          postgresCode(reason) === "23P01" ||
            String(reason).includes("appointments_no_overlap"),
        ).toBe(true);
      }
    },
  );

  it(
    "createAppointment sobrepostos: um grava e o outro recebe overlap",
    { timeout: 60_000 },
    async () => {
      for (let index = 0; index < LOOPS; index += 1) {
        const { startsAt, endsAt } = slot(index, 13);
        const results = await Promise.allSettled([
          withoutDeadlock(() =>
            createAppointment(left, ACTOR, {
              patientId: PATIENT_A,
              packageId: null,
              startsAt,
              endsAt,
              modality: "in_person",
              seriesId: null,
              notes: null,
            }),
          ),
          withoutDeadlock(() =>
            createAppointment(right, ACTOR, {
              patientId: PATIENT_B,
              packageId: null,
              startsAt,
              endsAt,
              modality: "in_person",
              seriesId: null,
              notes: null,
            }),
          ),
        ]);
        const ok = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(ok, `loop ${index}`).toHaveLength(1);
        expect(failed, `loop ${index}`).toHaveLength(1);
        expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
          name: "ClinicRuleError",
          code: "overlap",
        });
      }
    },
  );

  it(
    "último horário do pacote: um grava e o outro recebe package-exhausted",
    { timeout: 60_000 },
    async () => {
      for (let index = 0; index < LOOPS; index += 1) {
        const packageId = await createPackage(left, ACTOR, {
          patientId: PATIENT_A,
          totalSessions: 1,
          startsOn: "2027-06-01",
          expiresOn: null,
          priceCents: null,
          notes: null,
        });
        const first = slot(index, 15);
        const second = slot(index, 17);
        const results = await Promise.allSettled([
          withoutDeadlock(() =>
            createAppointment(left, ACTOR, {
              patientId: PATIENT_A,
              packageId,
              ...first,
              modality: "in_person",
              seriesId: null,
              notes: null,
            }),
          ),
          withoutDeadlock(() =>
            createAppointment(right, ACTOR, {
              patientId: PATIENT_A,
              packageId,
              ...second,
              modality: "in_person",
              seriesId: null,
              notes: null,
            }),
          ),
        ]);
        const ok = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(ok, `loop ${index}`).toHaveLength(1);
        expect(failed, `loop ${index}`).toHaveLength(1);
        expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
          name: "ClinicRuleError",
          code: "package-exhausted",
        });
      }
    },
  );

  it(
    "duas reposições da mesma falta: uma grava e a outra recebe makeup-taken",
    { timeout: 60_000 },
    async () => {
      for (let index = 0; index < LOOPS; index += 1) {
        const missedId = await createAppointment(left, ACTOR, {
          patientId: PATIENT_A,
          packageId: null,
          ...slot(index, 19),
          modality: "in_person",
          seriesId: null,
          notes: null,
        });
        await changeAppointmentStatus(left, ACTOR, missedId, "missed_notified");
        const results = await Promise.allSettled([
          withoutDeadlock(() =>
            scheduleMakeup(left, ACTOR, missedId, {
              ...slot(index + 40, 11),
              modality: "in_person",
              notes: null,
            }),
          ),
          withoutDeadlock(() =>
            scheduleMakeup(right, ACTOR, missedId, {
              ...slot(index + 40, 13),
              modality: "in_person",
              notes: null,
            }),
          ),
        ]);
        const ok = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(ok, `loop ${index}`).toHaveLength(1);
        expect(failed, `loop ${index}`).toHaveLength(1);
        expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
          name: "ClinicRuleError",
          code: "makeup-taken",
        });
      }
    },
  );

  it(
    "depois de cancelar a reposição, duas novas em paralelo: uma grava e a outra recebe makeup-taken",
    { timeout: 60_000 },
    async () => {
      for (let index = 0; index < LOOPS; index += 1) {
        const missedId = await createAppointment(left, ACTOR, {
          patientId: PATIENT_A,
          packageId: null,
          ...slot(index, 21),
          modality: "in_person",
          seriesId: null,
          notes: null,
        });
        await changeAppointmentStatus(left, ACTOR, missedId, "missed_notified");
        const firstMakeup = await scheduleMakeup(left, ACTOR, missedId, {
          ...slot(index + 80, 15),
          modality: "in_person",
          notes: null,
        });
        await cancelAppointment(left, ACTOR, firstMakeup);
        const results = await Promise.allSettled([
          withoutDeadlock(() =>
            scheduleMakeup(left, ACTOR, missedId, {
              ...slot(index + 120, 11),
              modality: "in_person",
              notes: null,
            }),
          ),
          withoutDeadlock(() =>
            scheduleMakeup(right, ACTOR, missedId, {
              ...slot(index + 120, 13),
              modality: "in_person",
              notes: null,
            }),
          ),
        ]);
        const ok = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(ok, `loop ${index}`).toHaveLength(1);
        expect(failed, `loop ${index}`).toHaveLength(1);
        expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
          name: "ClinicRuleError",
          code: "makeup-taken",
        });
      }
    },
  );

  it(
    "dois vínculos na última vaga: um grava e o outro recebe package-exhausted",
    { timeout: 60_000 },
    async () => {
      for (let index = 0; index < LOOPS; index += 1) {
        const packageId = await createPackage(left, ACTOR, {
          patientId: PATIENT_A,
          totalSessions: 1,
          startsOn: "2027-06-01",
          expiresOn: null,
          priceCents: null,
          notes: null,
        });
        const firstId = await createAppointment(left, ACTOR, {
          patientId: PATIENT_A,
          packageId: null,
          ...slot(index, 7),
          modality: "in_person",
          seriesId: null,
          notes: null,
        });
        const secondId = await createAppointment(left, ACTOR, {
          patientId: PATIENT_A,
          packageId: null,
          ...slot(index, 8),
          modality: "in_person",
          seriesId: null,
          notes: null,
        });
        const results = await Promise.allSettled([
          withoutDeadlock(() => setAppointmentPackage(left, ACTOR, firstId, packageId)),
          withoutDeadlock(() => setAppointmentPackage(right, ACTOR, secondId, packageId)),
        ]);
        const ok = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(ok, `loop ${index}`).toHaveLength(1);
        expect(failed, `loop ${index}`).toHaveLength(1);
        expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
          name: "ClinicRuleError",
          code: "package-exhausted",
        });
      }
    },
  );

  it(
    "série e vínculo na última vaga: um grava e o outro recebe package-exhausted",
    { timeout: 60_000 },
    async () => {
      for (let index = 0; index < LOOPS; index += 1) {
        const packageId = await createPackage(left, ACTOR, {
          patientId: PATIENT_A,
          totalSessions: 1,
          startsOn: "2027-06-01",
          expiresOn: null,
          priceCents: null,
          notes: null,
        });
        const linkedId = await createAppointment(left, ACTOR, {
          patientId: PATIENT_A,
          packageId: null,
          ...slot(index, 4),
          modality: "in_person",
          seriesId: null,
          notes: null,
        });
        const seriesSlot = slot(index, 5);
        const results = await Promise.allSettled([
          withoutDeadlock(() =>
            createAppointmentSeries(
              left,
              ACTOR,
              {
                patientId: PATIENT_A,
                packageId,
                ...seriesSlot,
                modality: "in_person",
                seriesId: null,
                notes: null,
                slots: [seriesSlot],
              },
              { skipConflicts: false },
            ),
          ),
          withoutDeadlock(() => setAppointmentPackage(right, ACTOR, linkedId, packageId)),
        ]);
        const ok = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(ok, `loop ${index}`).toHaveLength(1);
        expect(failed, `loop ${index}`).toHaveLength(1);
        expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
          name: "ClinicRuleError",
          code: "package-exhausted",
        });
      }
    },
  );

  it("trocas cruzadas de pacote terminam sem deadlock", { timeout: 60_000 }, async () => {
    for (let index = 0; index < LOOPS; index += 1) {
      const packageA = await createPackage(left, ACTOR, {
        patientId: PATIENT_A,
        totalSessions: 2,
        startsOn: "2027-06-01",
        expiresOn: null,
        priceCents: null,
        notes: null,
      });
      const packageB = await createPackage(left, ACTOR, {
        patientId: PATIENT_A,
        totalSessions: 2,
        startsOn: "2027-06-01",
        expiresOn: null,
        priceCents: null,
        notes: null,
      });
      const firstId = await createAppointment(left, ACTOR, {
        patientId: PATIENT_A,
        packageId: packageA,
        ...slot(index, 9),
        modality: "in_person",
        seriesId: null,
        notes: null,
      });
      const secondId = await createAppointment(left, ACTOR, {
        patientId: PATIENT_A,
        packageId: packageB,
        ...slot(index, 10),
        modality: "in_person",
        seriesId: null,
        notes: null,
      });
      const results = await Promise.allSettled([
        withoutDeadlock(() => setAppointmentPackage(left, ACTOR, firstId, packageB)),
        withoutDeadlock(() => setAppointmentPackage(right, ACTOR, secondId, packageA)),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
        `loop ${index}`,
      ).toHaveLength(2);
    }
  });
});
