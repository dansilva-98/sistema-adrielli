import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  RUNTIME_MAX_LIFETIME_SECONDS,
  RUNTIME_STATEMENT_TIMEOUT_MS,
} from "@/db/runtime-limits";
import * as schema from "@/db/schema";
import { serverEnv } from "@/lib/env.server";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  pg?: Sql;
};

type ParserMap = Record<string, (value: unknown) => unknown>;

let savedParsers: ParserMap | null = null;
let savedSerializers: ParserMap | null = null;

function encodeJsonParameter(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function applySavedParsers(client: Sql): void {
  if (!savedParsers || !savedSerializers) return;
  Object.assign(client.options.parsers, savedParsers);
  Object.assign(client.options.serializers, savedSerializers);
}

function openClient(): Sql {
  const client = postgres(serverEnv.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 5,
    max_lifetime: RUNTIME_MAX_LIFETIME_SECONDS,
    prepare: false,
    connection: {
      statement_timeout: RUNTIME_STATEMENT_TIMEOUT_MS,
    },
  });
  applySavedParsers(client);
  client.options.serializers["114"] = encodeJsonParameter;
  client.options.serializers["3802"] = encodeJsonParameter;
  return client;
}

let current = globalForDb.pg ?? openClient();
const retired = new WeakSet<Sql>();

function remember(client: Sql): void {
  current = client;
  if (process.env.NODE_ENV !== "production") globalForDb.pg = client;
}

export function abandonRuntimeConnection(): void {
  if (retired.has(current)) return;
  const stale = current;
  retired.add(stale);
  remember(openClient());
  void stale.end({ timeout: 0 }).catch(() => undefined);
}

export const sql = new Proxy(function runtimeSql() {}, {
  apply(_target, _thisArg, args: unknown[]) {
    return Reflect.apply(
      current as unknown as (...passed: unknown[]) => unknown,
      current,
      args,
    );
  },
  get(_target, property) {
    const value = Reflect.get(current, property, current) as unknown;
    return typeof value === "function" ? value.bind(current) : value;
  },
}) as unknown as Sql;

remember(current);

export const db = drizzle(sql, { schema });

savedParsers = { ...current.options.parsers } as ParserMap;
savedSerializers = { ...current.options.serializers } as ParserMap;
current.options.serializers["114"] = encodeJsonParameter;
current.options.serializers["3802"] = encodeJsonParameter;
savedSerializers["114"] = encodeJsonParameter;
savedSerializers["3802"] = encodeJsonParameter;

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await sql`select 1`;
    return true;
  } catch (error) {
    try {
      const sentry = await import("@sentry/nextjs");
      sentry.captureException(error);
    } catch (monitoringError) {
      console.error("database ping failed and monitoring was unavailable", {
        monitoringError:
          monitoringError instanceof Error ? monitoringError.name : "unknown",
      });
    }
    return false;
  }
}
