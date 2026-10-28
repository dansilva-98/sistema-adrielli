import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import {
  issueUploadReceipt,
  newAttachmentPath,
} from "../../src/modules/clinic/attachment-receipt";
import type { CreatePatientInput } from "../../src/modules/clinic/schema";
import type { ClinicObjectStore } from "../../src/modules/clinic/storage";
import { signStaffSession } from "../../src/modules/identity/staff-session";

const session = vi.hoisted(() => ({
  userId: null as string | null,
  accessToken: "",
  cookie: null as string | null,
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
        listFactors: async () => ({ data: { totp: [] } }),
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

describe("acesso ao consultório sem papel ou sem MFA", () => {
  const contentId = crypto.randomUUID();
  const clinicId = crypto.randomUUID();
  const patientId = crypto.randomUUID();
  const attachmentId = crypto.randomUUID();
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let secret = "";
  const hits = { n: 0 };
  const input: CreatePatientInput = {
    fullName: "Acesso Recusado",
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
      fullName: "Responsavel Recusado",
      relationship: "MOTHER",
      phone: "11988887777",
      email: null,
      cpf: null,
      receivesReminders: false,
    },
  };

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
    const patients = await import("../../src/modules/clinic/patients");
    const attachments = await import("../../src/modules/clinic/attachments");
    const db = countSql(runtime, hits);
    const actor = { userId: clinicId, ip: null };
    const now = Date.now();
    const store: ClinicObjectStore = {
      async createUpload() {
        hits.n += 1;
        throw new Error("storage");
      },
      async read() {
        hits.n += 1;
        throw new Error("storage");
      },
      async write() {
        hits.n += 1;
        throw new Error("storage");
      },
      async remove() {
        hits.n += 1;
        throw new Error("storage");
      },
      async signedDownload() {
        hits.n += 1;
        throw new Error("storage");
      },
    };
    const calls = [
      () => patients.listPatients(db, { query: "", archived: false }),
      () => patients.loadPatient(db, actor, patientId),
      () => patients.createPatient(db, actor, input),
      () =>
        attachments.prepareAttachmentUpload(
          db,
          actor,
          store,
          secret,
          { patientId, mime: "application/pdf", size: 12 },
          now,
        ),
      () =>
        attachments.confirmAttachmentUpload(db, actor, store, secret, {
          receipt: issueUploadReceipt(
            secret,
            {
              patientId,
              path: newAttachmentPath(patientId, "application/pdf"),
              mime: "application/pdf",
              actorId: actor.userId,
            },
            now,
          ),
          originalName: "laudo.pdf",
          category: "OTHER",
          now,
        }),
      () => attachments.openAttachment(db, actor, store, attachmentId),
      () => attachments.deleteAttachment(db, actor, attachmentId),
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

  it("sem login, CONTENT_ADMIN e sem MFA não leem nem gravam", async () => {
    const beforePatients = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.patients
    `;
    const beforeAttachments = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.patient_attachments
    `;

    session.userId = null;
    session.accessToken = "";
    session.cookie = null;
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
    await exercise("forbidden");
    expect(await auditCount(contentId, "access.denied")).toBe(7);
    expect(await auditCount(contentId, "clinic.patient.created")).toBe(0);

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
    await exercise("mfa-setup");
    expect(await auditCount(clinicId, "access.denied")).toBe(0);
    expect(await auditCount(clinicId, "clinic.patient.created")).toBe(0);
    const successes = await owner<{ total: number }[]>`
      select count(*)::int as total
      from audit.audit_log
      where action like 'clinic.%'
        and (
          actor_user_id is null
          or actor_user_id in ${owner([contentId, clinicId])}
        )
    `;
    expect(Number(successes[0]?.total ?? 0)).toBe(0);

    expect(hits.n).toBe(0);
    const afterPatients = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.patients
    `;
    const afterAttachments = await owner<{ total: number }[]>`
      select count(*)::int as total from clinic.patient_attachments
    `;
    expect(afterPatients[0]?.total).toBe(beforePatients[0]?.total);
    expect(afterAttachments[0]?.total).toBe(beforeAttachments[0]?.total);
  });
});
