import { connection } from "next/server";

import { sql } from "@/db/client";
import { reportServerError } from "@/lib/sentry-server";
import { serveCalendarFeed } from "@/modules/clinic/calendar-feed";
import { clientIp } from "@/modules/identity/staff-session";

export const instant = false;

export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> },
) {
  await connection();
  try {
    const { file } = await context.params;
    return await serveCalendarFeed(sql, {
      file,
      ip: clientIp(request.headers),
    });
  } catch (error) {
    await reportServerError(error);
    return new Response(null, {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
