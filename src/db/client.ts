import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/env.server";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as {
  pg?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(serverEnv.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
  });
}

const pg = globalForDb.pg ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pg = pg;
}

export const db = drizzle(pg, { schema });

export async function closeDatabase(): Promise<void> {
  await pg.end({ timeout: 5 });
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await pg`select 1`;
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
