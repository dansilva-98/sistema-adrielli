import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import type { Actor } from "../../src/modules/clinic/patients";
import { signStaffSession } from "../../src/modules/identity/staff-session";

const session = vi.hoisted(() => ({
  userId: null as string | null,
  accessToken: "",
  cookie: null as string | null,
  totp: [] as { id: string; status: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "staff_session" && session.cookie ? { value: session.cookie } : undefined,
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/server", () => ({
  connection: async () => {},
}));

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: session.userId ? { id: session.userId } : null },
      }),
      getSession: async () => ({
        data: {
          session: session.userId
            ? {
                user: { id: session.userId },
                access_token: session.accessToken,
              }
            : null,
        },
      }),
      mfa: {
        listFactors: async () => ({ data: { totp: session.totp } }),
      },
    },
  }),
}));

function accessToken(sessionId: string, aal: "aal1" | "aal2"): string {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId, aal })).toString(
    "base64url",
  );
  return `e30.${payload}.e30`;
}

function countSql(sql: postgres.Sql, hits: { n: number }): postgres.Sql {
  return new Proxy(sql, {
    apply(target, thisArg, args) {
      hits.n += 1;
      return Reflect.apply(target, thisArg, args);
    },
    get(target, property, receiver) {
      if (property === "begin") {
        return (...args: unknown[]) => {
          hits.n += 1;
          return Reflect.apply(target.begin, target, args);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as postgres.Sql;
}

describe("acesso à agenda sem papel clínico ou sem MFA (A8)", () => {
  const contentId = crypto.randomUUID();
  const clinicId = crypto.randomUUID();
  const dummyId = crypto.randomUUID();
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let secret = "";
  const hits = { n: 0 };

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    secret = process.env.STAFF_SESSION_SECRET ?? "";
    if (!testUrl || !migrationsUrl || !secret) {
      throw new Error("Recusado: URLs de teste ou segredo de sessão ausentes.");
    }
    process.env.DATABASE_URL = testUrl;
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    for (const [id, role] of [
      [contentId, "CONTENT_ADMIN"],
      [clinicId, "CLINIC_ADMIN"],
    ] as const) {
      await owner`insert into auth.users (id) values (${id}::uuid)`;
      await owner`
        insert into identity.users (id, kind, email, display_name)
        values (${id}::uuid, 'STAFF', ${`${id}@example.com`}, 'Equipe')
      `;
      await owner`
        insert into identity.user_roles (user_id, role)
        values (${id}::uuid, ${role}::identity.staff_role)
      `;
    }
  });

  afterAll(async () => {
    const ids = [contentId, clinicId];
    await owner`alter table audit.audit_log disable trigger audit_log_immutable`;
    await owner`delete from audit.audit_log where actor_user_id in ${owner(ids)}`;
    await owner`alter table audit.audit_log enable trigger audit_log_immutable`;
    await owner`delete from identity.staff_email_mfa_challenges where user_id in ${owner(ids)}`;
    await owner`delete from identity.staff_totp_factors where user_id in ${owner(ids)}`;
    await owner`delete from identity.user_roles where user_id in ${owner(ids)}`;
    await owner`delete from identity.users where id in ${owner(ids)}`;
    await owner`delete from auth.users where id in ${owner(ids)}`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
    const database = await import("../../src/db/client");
    await database.closeDatabase();
    delete (globalThis as { pg?: unknown }).pg;
    vi.resetModules();
  });

  async function exercise(reason: string): Promise<void> {
    delete (globalThis as { pg?: unknown }).pg;
    vi.resetModules();
    const settings = await import("../../src/modules/clinic/agenda-settings");
    const packages = await import("../../src/modules/clinic/packages");
    const appointments = await import("../../src/modules/clinic/appointments");
    const db = countSql(runtime, hits);
    const actor: Actor = { userId: clinicId, ip: null };
    const now = new Date("2027-07-01T11:00:00.000Z");
    const later = new Date("2027-07-01T11:50:00.000Z");
    const calls = [
      () => settings.getAgendaSettings(db),
      () =>
        settings.updateAgendaSettings(db, actor, {
          defaultDurationMinutes: 50,
          locationName: "Sala",
          locationAddress: "Rua",
          reminderSendHour: 9,
        }),
      () => packages.getPackage(db, dummyId),
      () => packages.getPackageBalance(db, dummyId),
      () => packages.listPatientPackages(db, dummyId),
      () =>
        packages.createPackage(db, actor, {
          patientId: dummyId,
          totalSessions: 1,
          startsOn: "2027-07-01",
          expiresOn: null,
          priceCents: null,
          notes: null,
        }),
      () => packages.closePackage(db, actor, dummyId),
      () => appointments.getAppointment(db, dummyId),
      () => appointments.listAppointments(db, { from: now, to: later }),
      () =>
        appointments.createAppointment(db, actor, {
          patientId: dummyId,
          packageId: null,
          startsAt: now,
          endsAt: later,
          modality: "in_person",
          seriesId: null,
          notes: null,
        }),
      () => appointments.changeAppointmentStatus(db, actor, dummyId, "completed"),
      () => appointments.cancelAppointment(db, actor, dummyId),
      () =>
        appointments.rescheduleAppointment(db, actor, dummyId, {
          startsAt: now,
          endsAt: later,
          notes: null,
        }),
      () =>
        appointments.scheduleMakeup(db, actor, dummyId, {
          startsAt: now,
          endsAt: later,
          modality: "in_person",
          notes: null,
        }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ name: "StaffAccessError", reason });
    }
  }

  async function auditCount(actorId: string, action: string): Promise<number> {
    const rows = await owner<{ total: number }[]>`
      select count(*)::int as total
      from audit.audit_log
      where actor_user_id = ${actorId}::uuid
        and action = ${action}
    `;
    return Number(rows[0]?.total ?? 0);
  }

  it("sem login, CONTENT_ADMIN, CLINIC_ADMIN sem MFA e TOTP desconhecido não leem nem gravam", async () => {
    const beforeAppointments = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.appointments
    `;
    const beforePackages = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.packages
    `;

    session.userId = null;
    session.accessToken = "";
    session.cookie = null;
    session.totp = [];
    await exercise("unauthenticated");

    const now = Date.now();
    const contentSession = crypto.randomUUID();
    session.userId = contentId;
    session.accessToken = accessToken(contentSession, "aal2");
    session.cookie = signStaffSession(
      {
        userId: contentId,
        sessionId: contentSession,
        startedAt: now,
        lastActivity: now,
      },
      secret,
    );
    session.totp = [];
    await exercise("forbidden");
    expect(await auditCount(contentId, "access.denied")).toBe(14);
    expect(await auditCount(contentId, "clinic.appointment.created")).toBe(0);

    const clinicSession = crypto.randomUUID();
    session.userId = clinicId;
    session.accessToken = accessToken(clinicSession, "aal1");
    session.cookie = signStaffSession(
      {
        userId: clinicId,
        sessionId: clinicSession,
        startedAt: now,
        lastActivity: now,
      },
      secret,
    );
    session.totp = [];
    await exercise("mfa-verify");
    expect(await auditCount(clinicId, "access.denied")).toBe(0);

    const unknownFactor = crypto.randomUUID();
    const unknownSession = crypto.randomUUID();
    session.userId = clinicId;
    session.accessToken = accessToken(unknownSession, "aal2");
    session.cookie = signStaffSession(
      {
        userId: clinicId,
        sessionId: unknownSession,
        startedAt: now,
        lastActivity: now,
      },
      secret,
    );
    session.totp = [{ id: unknownFactor, status: "verified" }];
    await exercise("mfa-verify");
    expect(await auditCount(clinicId, "clinic.appointment.created")).toBe(0);
    expect(hits.n).toBe(0);

    const afterAppointments = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.appointments
    `;
    const afterPackages = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.packages
    `;
    expect(afterAppointments[0]?.total).toBe(beforeAppointments[0]?.total);
    expect(afterPackages[0]?.total).toBe(beforePackages[0]?.total);
  });

  it("CLINIC_ADMIN com código de e-mail consumido ou TOTP conhecido lê a configuração", async () => {
    const now = Date.now();
    const emailSession = crypto.randomUUID();
    await owner`
      insert into identity.staff_email_mfa_challenges (
        user_id, session_id, code_hmac, attempts, expires_at, consumed_at
      ) values (
        ${clinicId}::uuid,
        ${emailSession}::uuid,
        'hmac',
        1,
        ${new Date(now + 60_000)},
        ${new Date()}
      )
    `;
    session.userId = clinicId;
    session.accessToken = accessToken(emailSession, "aal1");
    session.cookie = signStaffSession(
      {
        userId: clinicId,
        sessionId: emailSession,
        startedAt: now,
        lastActivity: now,
      },
      secret,
    );
    session.totp = [];
    delete (globalThis as { pg?: unknown }).pg;
    vi.resetModules();
    const settings = await import("../../src/modules/clinic/agenda-settings");
    const withEmail = await settings.getAgendaSettings(runtime);
    expect(withEmail.defaultDurationMinutes).toBe(50);

    const factorId = crypto.randomUUID();
    await owner`
      insert into identity.staff_totp_factors (factor_id, user_id)
      values (${factorId}::uuid, ${clinicId}::uuid)
    `;
    const totpSession = crypto.randomUUID();
    session.userId = clinicId;
    session.accessToken = accessToken(totpSession, "aal2");
    session.cookie = signStaffSession(
      {
        userId: clinicId,
        sessionId: totpSession,
        startedAt: now,
        lastActivity: now,
      },
      secret,
    );
    session.totp = [{ id: factorId, status: "verified" }];
    delete (globalThis as { pg?: unknown }).pg;
    vi.resetModules();
    const settingsAgain = await import("../../src/modules/clinic/agenda-settings");
    const withTotp = await settingsAgain.getAgendaSettings(runtime);
    expect(withTotp.reminderSendHour).toBe(9);
  });
});
