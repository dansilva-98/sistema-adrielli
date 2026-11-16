import { connection } from "next/server";
import { z } from "zod";

import { sql } from "@/db/client";
import { reportServerError } from "@/lib/sentry-server";
import { serveAppointmentCalendar } from "@/modules/clinic/calendar-feed";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    return await serveAppointmentCalendar(sql, id);
  } catch (error) {
    await reportServerError(error);
    return new Response(null, {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
