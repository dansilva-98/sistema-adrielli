import "server-only";

import type postgres from "postgres";

import { serverEnv } from "@/lib/env.server";
import { recordAudit } from "@/modules/audit/record";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { assertRole } from "@/modules/identity/server/guard";
import { loginAttemptKey } from "@/modules/identity/staff-session";

import {
  buildIcsCalendar,
  calendarEventTitle,
  calendarLocation,
  type CalendarEvent,
} from "./calendar-ics";
import {
  calendarTokenHashMatches,
  generateCalendarToken,
  hashCalendarToken,
  parseCalendarFeedFile,
} from "./calendar-token";
import { ClinicRuleError, type Actor } from "./patients";
import { runClinicTransaction } from "./run-transaction";

type Database = postgres.Sql | postgres.TransactionSql;

export const CALENDAR_FEED_LIMIT = 20;
export const CALENDAR_FEED_WINDOW_MS = 15 * 60 * 1000;
export const CALENDAR_FEED_LOOKBEHIND_DAYS = 7;
export const CALENDAR_FEED_LOOKAHEAD_DAYS = 60;

const CACHE_CONTROL = "private, no-store";
const CALENDAR_CONTENT_TYPE = "text/calendar; charset=utf-8";

type FeedKind = "TOKEN" | "IP";

type AppointmentCalendarRow = {
  id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  full_name: string;
  preferred_name: string | null;
  location_name: string;
  location_address: string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapEvent(row: AppointmentCalendarRow): CalendarEvent {
  return {
    id: row.id,
    startsAt: asDate(row.starts_at),
    endsAt: asDate(row.ends_at),
    summary: calendarEventTitle(row.full_name, row.preferred_name),
    location: calendarLocation(row.location_name, row.location_address),
  };
}

function calendarHeaders(extra?: Record<string, string>): Headers {
  return new Headers({
    "Cache-Control": CACHE_CONTROL,
    ...extra,
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status, headers: calendarHeaders() });
}

function calendarResponse(body: string, filename?: string): Response {
  const extra: Record<string, string> = {
    "Content-Type": CALENDAR_CONTENT_TYPE,
  };
  if (filename) extra["Content-Disposition"] = `attachment; filename="${filename}"`;
  return new Response(body, { status: 200, headers: calendarHeaders(extra) });
}

async function countFeedAttempts(
  db: Database,
  keyHash: string,
  kind: FeedKind,
  since: Date,
): Promise<number> {
  const rows = await db<{ total: number }[]>`
    select count(*)::int as total
    from clinic.calendar_feed_requests
    where key_hash = ${keyHash}
      and kind = ${kind}
      and attempted_at > ${since}
  `;
  return Number(rows[0]?.total ?? 0);
}

async function recordFeedAttempt(
  db: Database,
  keyHash: string,
  kind: FeedKind,
): Promise<void> {
  await db`
    insert into clinic.calendar_feed_requests (key_hash, kind)
    values (${keyHash}, ${kind})
  `;
}

async function feedIsOverLimit(
  db: Database,
  keys: { tokenKey: string | null; ipKey: string | null },
): Promise<boolean> {
  const since = new Date(Date.now() - CALENDAR_FEED_WINDOW_MS);
  if (
    keys.tokenKey &&
    (await countFeedAttempts(db, keys.tokenKey, "TOKEN", since)) > CALENDAR_FEED_LIMIT
  ) {
    return true;
  }
  if (!keys.ipKey) return false;
  return (await countFeedAttempts(db, keys.ipKey, "IP", since)) > CALENDAR_FEED_LIMIT;
}

function feedKeys(
  token: string | null,
  ip: string | null,
): {
  tokenKey: string | null;
  ipKey: string | null;
} {
  const secret = serverEnv.STAFF_SESSION_SECRET;
  return {
    tokenKey: token ? loginAttemptKey(token, secret) : null,
    ipKey: ip ? loginAttemptKey(ip, secret) : null,
  };
}

async function storedCalendarHash(db: Database): Promise<string | null> {
  const rows = await db<{ calendar_feed_token_hash: string | null }[]>`
    select calendar_feed_token_hash
    from clinic.settings
    where id = 1
  `;
  return rows[0]?.calendar_feed_token_hash ?? null;
}

async function listFeedAppointments(db: Database): Promise<AppointmentCalendarRow[]> {
  const lookbehind = CALENDAR_FEED_LOOKBEHIND_DAYS;
  const lookahead = CALENDAR_FEED_LOOKAHEAD_DAYS + 1;
  return db<AppointmentCalendarRow[]>`
    select
      a.id,
      a.starts_at,
      a.ends_at,
      p.full_name,
      p.preferred_name,
      s.location_name,
      s.location_address
    from clinic.appointments a
    join clinic.patients p on p.id = a.patient_id
    join clinic.settings s on s.id = 1
    where a.status = 'scheduled'
      and a.starts_at >= (
        date_trunc('day', timezone('America/Sao_Paulo', now()))
        - (${lookbehind} * interval '1 day')
      ) at time zone 'America/Sao_Paulo'
      and a.starts_at < (
        date_trunc('day', timezone('America/Sao_Paulo', now()))
        + (${lookahead} * interval '1 day')
      ) at time zone 'America/Sao_Paulo'
    order by a.starts_at, a.id
  `;
}

async function loadScheduledAppointment(
  db: Database,
  appointmentId: string,
): Promise<AppointmentCalendarRow | null> {
  const rows = await db<AppointmentCalendarRow[]>`
    select
      a.id,
      a.starts_at,
      a.ends_at,
      p.full_name,
      p.preferred_name,
      s.location_name,
      s.location_address
    from clinic.appointments a
    join clinic.patients p on p.id = a.patient_id
    join clinic.settings s on s.id = 1
    where a.id = ${appointmentId}::uuid
      and a.status = 'scheduled'
  `;
  return rows[0] ?? null;
}

export async function calendarFeedExists(db: Database): Promise<boolean> {
  await assertRole(CONSULTORIO_ROLES);
  return (await storedCalendarHash(db)) !== null;
}

export async function rotateCalendarFeedToken(
  db: postgres.Sql,
  actor: Actor,
): Promise<string> {
  await assertRole(CONSULTORIO_ROLES);
  const token = generateCalendarToken();
  const tokenHash = hashCalendarToken(token);
  await runClinicTransaction(db, async (tx) => {
    const rows = await tx<{ id: number }[]>`
      update clinic.settings
      set
        calendar_feed_token_hash = ${tokenHash},
        calendar_feed_rotated_at = now(),
        updated_by = ${actor.userId}::uuid
      where id = 1
      returning id
    `;
    if (!rows[0]) throw new ClinicRuleError("not-found");
    await recordAudit(
      {
        action: "clinic.calendar_feed.rotated",
        actorUserId: actor.userId,
        entityType: "settings",
        entityId: null,
        ip: actor.ip,
        metadata: {},
      },
      tx,
    );
  });
  return token;
}

export async function serveCalendarFeed(
  db: Database,
  input: { file: string; ip: string | null },
): Promise<Response> {
  const token = parseCalendarFeedFile(input.file);
  const keys = feedKeys(token, input.ip);
  if (keys.tokenKey) await recordFeedAttempt(db, keys.tokenKey, "TOKEN");
  if (keys.ipKey) await recordFeedAttempt(db, keys.ipKey, "IP");
  if (await feedIsOverLimit(db, keys)) return emptyResponse(429);
  if (!token) return emptyResponse(404);
  const stored = await storedCalendarHash(db);
  if (!calendarTokenHashMatches(stored, token)) return emptyResponse(404);
  const events = (await listFeedAppointments(db)).map(mapEvent);
  return calendarResponse(buildIcsCalendar(events));
}

export async function serveAppointmentCalendar(
  db: Database,
  appointmentId: string,
): Promise<Response> {
  await assertRole(CONSULTORIO_ROLES);
  const row = await loadScheduledAppointment(db, appointmentId);
  if (!row) return emptyResponse(404);
  return calendarResponse(buildIcsCalendar([mapEvent(row)]), "sessao.ics");
}
