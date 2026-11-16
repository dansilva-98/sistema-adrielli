import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { drizzle } from "drizzle-orm/postgres-js";
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
  CALENDAR_FEED_LIMIT,
  rotateCalendarFeedToken,
  serveAppointmentCalendar,
  serveCalendarFeed,
} from "../../src/modules/clinic/calendar-feed";
import { pruneCalendarFeedRequests } from "../../src/modules/clinic/calendar-feed-prune";
import {
  calendarFeedPath,
  generateCalendarToken,
} from "../../src/modules/clinic/calendar-token";
import type { Actor } from "../../src/modules/clinic/patients";

const STAFF_ID = "f1111111-1111-4111-8111-111111111111";
const PATIENT_ID = "f2222222-2222-4222-8222-222222222222";
const GUARDIAN_ID = "f3333333-3333-4333-8333-333333333333";
const ACTOR: Actor = { userId: STAFF_ID, ip: "198.51.100.20" };
const NOTE = "NOTA-CLINICA-ICS-NAO-DEVE-SAIR";
const GUARDIAN = "Responsavel Secreto ICS";
const PHONE = "11988887766";

type SettingsSnapshot = {
  location_name: string;
  location_address: string;
  calendar_feed_token_hash: string | null;
  calendar_feed_rotated_at: Date | string | null;
  updated_by: string | null;
};

describe("feed ICS da agenda", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let feed: ReturnType<typeof postgres>;
  let snapshot: SettingsSnapshot | null = null;
  const startedAt = new Date();

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    feed = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    void drizzle(feed);
    const rows = await owner<SettingsSnapshot[]>`
      select
        location_name,
        location_address,
        calendar_feed_token_hash,
        calendar_feed_rotated_at,
        updated_by
      from clinic.settings
      where id = 1
    `;
    snapshot = rows[0] ?? null;
    await owner`insert into auth.users (id) values (${STAFF_ID}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${STAFF_ID}::uuid, 'STAFF', 'calendar-feed@example.com', 'Staff')
    `;
    await runtime.begin(async (transaction) => {
      await transaction`
        insert into clinic.patients (
          id, full_name, preferred_name, birth_date, notes, created_by
        ) values (
          ${PATIENT_ID}::uuid, 'Maria Clara Lima', 'Clarinha', '2018-01-02',
          ${NOTE}, ${STAFF_ID}::uuid
        )
      `;
      await transaction`
        insert into clinic.guardians (id, full_name, relationship, phone)
        values (${GUARDIAN_ID}::uuid, ${GUARDIAN}, 'MOTHER', ${PHONE})
      `;
      await transaction`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${PATIENT_ID}::uuid, ${GUARDIAN_ID}::uuid, true)
      `;
    });
    await runtime`
      update clinic.settings
      set location_name = 'Consultório Teste ICS', location_address = 'Rua A, 10'
      where id = 1
    `;
    await insertWindowAppointments();
  });

  afterAll(async () => {
    await owner`delete from clinic.calendar_feed_requests where attempted_at >= ${startedAt}`;
    await owner`delete from clinic.appointments where created_by = ${STAFF_ID}::uuid`;
    await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
    try {
      await owner`delete from clinic.patient_guardians where patient_id = ${PATIENT_ID}::uuid`;
      await owner`delete from clinic.patients where id = ${PATIENT_ID}::uuid`;
      await owner`delete from clinic.guardians where id = ${GUARDIAN_ID}::uuid`;
    } finally {
      await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
    }
    if (snapshot) {
      await owner`
        update clinic.settings
        set
          location_name = ${snapshot.location_name},
          location_address = ${snapshot.location_address},
          calendar_feed_token_hash = ${snapshot.calendar_feed_token_hash},
          calendar_feed_rotated_at = ${snapshot.calendar_feed_rotated_at},
          updated_by = ${snapshot.updated_by}
        where id = 1
      `;
    }
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
    await feed.end({ timeout: 5 });
  });

  it("aceita o token certo, 404 no trocado e só o nome com a inicial", async () => {
    const token = await rotateCalendarFeedToken(runtime, ACTOR);
    const ok = await serveCalendarFeed(feed, {
      file: `${token}.ics`,
      ip: "198.51.100.21",
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    const body = await ok.text();
    const inWindow = await runtime<{ id: string }[]>`
      select id from clinic.appointments
      where patient_id = ${PATIENT_ID}::uuid and notes = 'IN-WINDOW'
    `;
    const hidden = await runtime<{ id: string }[]>`
      select id from clinic.appointments
      where patient_id = ${PATIENT_ID}::uuid and notes in ('FORA-JANELA', 'CANCELADA')
    `;
    expect(inWindow.length).toBe(2);
    for (const row of inWindow) {
      expect(body).toContain(`UID:${row.id}@adrielliflores.com.br`);
    }
    for (const row of hidden) {
      expect(body).not.toContain(`UID:${row.id}@adrielliflores.com.br`);
    }
    expect(body).toContain("SUMMARY:Clarinha L.");
    expect(body).toContain("LOCATION:Consultório Teste ICS\\nRua A\\, 10");
    expect(body).toContain("BEGIN:VALARM");
    expect(body).toContain("TRIGGER:-PT1H");
    expect(body).not.toContain("IN-WINDOW");
    expect(body).not.toContain("FORA-JANELA");
    expect(body).not.toContain("Maria Clara Lima");
    expect(body).not.toContain("Maria");
    expect(body).not.toContain("Lima");
    expect(body).not.toContain(NOTE);
    expect(body).not.toContain(GUARDIAN);
    expect(body).not.toContain(PHONE);
    expect(body).not.toContain("CANCELADA");

    const missingFile = `${generateCalendarToken()}.ics`;
    const missing = await serveCalendarFeed(feed, {
      file: missingFile,
      ip: "198.51.100.22",
    });
    const next = await rotateCalendarFeedToken(runtime, ACTOR);
    const rotated = await serveCalendarFeed(feed, {
      file: `${token}.ics`,
      ip: "198.51.100.23",
    });
    const fresh = await serveCalendarFeed(feed, {
      file: `${next}.ics`,
      ip: "198.51.100.24",
    });
    expect(fresh.status).toBe(200);
    expect(rotated.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await rotated.text()).toBe(await missing.text());
    expect(rotated.headers.get("content-type")).toBe(missing.headers.get("content-type"));
    expect(rotated.headers.get("cache-control")).toBe("private, no-store");
    expect(calendarFeedPath(next)).toContain(next);

    const malformed = await serveCalendarFeed(feed, {
      file: "abc.ics",
      ip: "198.51.100.25",
    });
    expect(malformed.status).toBe(404);
    expect(await malformed.text()).toBe(await missing.text());
  });

  it("limita requisições por token e por IP", async () => {
    const token = await rotateCalendarFeedToken(runtime, ACTOR);
    const ip = "198.51.100.30";
    for (let index = 0; index < CALENDAR_FEED_LIMIT; index += 1) {
      const response = await serveCalendarFeed(feed, { file: `${token}.ics`, ip });
      expect(response.status, String(index)).toBe(200);
      await response.text();
    }
    const limited = await serveCalendarFeed(feed, { file: `${token}.ics`, ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
  });

  it("baixa só a sessão marcada, com o mesmo título curto", async () => {
    const rows = await runtime<{ id: string }[]>`
      select id from clinic.appointments
      where patient_id = ${PATIENT_ID}::uuid and notes = 'IN-WINDOW'
    `;
    const id = rows[0]?.id;
    expect(id).toBeTruthy();
    const ok = await serveAppointmentCalendar(runtime, id!);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toBe(
      'attachment; filename="sessao.ics"',
    );
    const body = await ok.text();
    expect(body).toContain("SUMMARY:Clarinha L.");
    expect(body).not.toContain(NOTE);
    expect(body).not.toContain("FORA-JANELA");
    const cancelled = await runtime<{ id: string }[]>`
      select id from clinic.appointments
      where patient_id = ${PATIENT_ID}::uuid and notes = 'CANCELADA'
    `;
    const denied = await serveAppointmentCalendar(runtime, cancelled[0]!.id);
    expect(denied.status).toBe(404);
  });

  it("limita por IP antes de gravar TOKEN e devolve 429 no token inválido", async () => {
    const ip = "203.0.113.80";
    const before = await owner<{ n: number }[]>`
      select count(*)::int as n
      from clinic.calendar_feed_requests
      where kind = 'TOKEN' and attempted_at >= ${startedAt}
    `;
    for (let index = 0; index < CALENDAR_FEED_LIMIT; index += 1) {
      const response = await serveCalendarFeed(feed, { file: "abc.ics", ip });
      expect(response.status, String(index)).toBe(404);
    }
    const limited = await serveCalendarFeed(feed, { file: "abc.ics", ip });
    expect(limited.status).toBe(429);
    const after = await owner<{ n: number }[]>`
      select count(*)::int as n
      from clinic.calendar_feed_requests
      where kind = 'TOKEN' and attempted_at >= ${startedAt}
    `;
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  it("app_runtime só apaga pedidos do calendário com mais de um dia", async () => {
    const oldKey = `e8-cal-test-old-${crypto.randomUUID()}`;
    const recentKey = `e8-cal-test-new-${crypto.randomUUID()}`;
    try {
      await owner`
        insert into clinic.calendar_feed_requests (key_hash, kind, attempted_at)
        values
          (${oldKey}, 'IP', now() - interval '25 hours'),
          (${recentKey}, 'IP', now() - interval '1 hour')
      `;
      await runtime`
        delete from clinic.calendar_feed_requests
        where key_hash = ${oldKey} or key_hash = ${recentKey}
      `;
      const afterRole = await owner<{ key_hash: string }[]>`
        select key_hash
        from clinic.calendar_feed_requests
        where key_hash = ${oldKey} or key_hash = ${recentKey}
        order by key_hash
      `;
      expect(afterRole.map((row) => row.key_hash)).toEqual([recentKey]);

      await owner`
        insert into clinic.calendar_feed_requests (key_hash, kind, attempted_at)
        values (${oldKey}, 'IP', now() - interval '25 hours')
      `;
      const pruned = await pruneCalendarFeedRequests(runtime);
      expect(pruned).toBeGreaterThanOrEqual(1);
      const afterPrune = await owner<{ key_hash: string }[]>`
        select key_hash
        from clinic.calendar_feed_requests
        where key_hash = ${oldKey} or key_hash = ${recentKey}
        order by key_hash
      `;
      expect(afterPrune.map((row) => row.key_hash)).toEqual([recentKey]);
    } finally {
      await owner`
        delete from clinic.calendar_feed_requests
        where key_hash = ${oldKey} or key_hash = ${recentKey}
      `;
    }
  });

  async function insertWindowAppointments(): Promise<void> {
    await runtime`
      insert into clinic.appointments (
        patient_id, starts_at, ends_at, notes, created_by
      ) values
      (
        ${PATIENT_ID}::uuid,
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          - interval '6 days' + interval '10 hours'
        ) at time zone 'America/Sao_Paulo',
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          - interval '6 days' + interval '10 hours' + interval '50 minutes'
        ) at time zone 'America/Sao_Paulo',
        'IN-WINDOW',
        ${STAFF_ID}::uuid
      ),
      (
        ${PATIENT_ID}::uuid,
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '59 days' + interval '10 hours'
        ) at time zone 'America/Sao_Paulo',
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '59 days' + interval '10 hours' + interval '50 minutes'
        ) at time zone 'America/Sao_Paulo',
        'IN-WINDOW',
        ${STAFF_ID}::uuid
      ),
      (
        ${PATIENT_ID}::uuid,
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          - interval '8 days' + interval '10 hours'
        ) at time zone 'America/Sao_Paulo',
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          - interval '8 days' + interval '10 hours' + interval '50 minutes'
        ) at time zone 'America/Sao_Paulo',
        'FORA-JANELA',
        ${STAFF_ID}::uuid
      ),
      (
        ${PATIENT_ID}::uuid,
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '61 days' + interval '10 hours'
        ) at time zone 'America/Sao_Paulo',
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '61 days' + interval '10 hours' + interval '50 minutes'
        ) at time zone 'America/Sao_Paulo',
        'FORA-JANELA',
        ${STAFF_ID}::uuid
      ),
      (
        ${PATIENT_ID}::uuid,
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '2 days' + interval '10 hours'
        ) at time zone 'America/Sao_Paulo',
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '2 days' + interval '10 hours' + interval '50 minutes'
        ) at time zone 'America/Sao_Paulo',
        'CANCELADA',
        ${STAFF_ID}::uuid
      )
    `;
    await runtime`
      update clinic.appointments
      set status = 'cancelled'
      where patient_id = ${PATIENT_ID}::uuid and notes = 'CANCELADA'
    `;
  }
});
