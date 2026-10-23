import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env.server";
import {
  clearStaffSessionCookie,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import {
  clientIp,
  readStaffSession,
  STAFF_SESSION_COOKIE,
} from "@/modules/identity/staff-session";
import { writeStaffAudit } from "@/modules/identity/server/directory";

export async function GET(request: Request) {
  const motivo = new URL(request.url).searchParams.get("motivo");
  const expired = motivo === "sessao";
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  const staffSession = token
    ? readStaffSession(token, serverEnv.STAFF_SESSION_SECRET)
    : null;
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id ?? staffSession?.userId ?? null;
  await supabase.auth.signOut();
  await clearStaffSessionCookie();
  if (expired) {
    await writeStaffAudit({
      action: "auth.session.expired",
      actorUserId: userId,
      entityType: "user",
      entityId: userId,
      ip: clientIp(request.headers.get("x-forwarded-for")),
      metadata: {},
    });
  }
  redirect(expired ? "/equipe/entrar?motivo=sessao" : "/equipe/entrar");
}
