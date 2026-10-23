import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { parseClientEnv, parseServerEnv } from "@/lib/env";
import { rolesForStaffPath } from "@/modules/identity/access";
import {
  evaluateStaffSession,
  readStaffSession,
  signStaffSession,
  staffSessionCookieOptions,
  staffSessionMatches,
  STAFF_SESSION_COOKIE,
  touchStaffSession,
} from "@/modules/identity/staff-session";
import { sessionIdFromAccessToken } from "@/modules/identity/supabase-sign-in";
import { loadStaffProfile, writeStaffAudit } from "@/modules/identity/server/directory";

function isStaffArea(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/consultorio");
}

function leaveStaffArea(request: NextRequest, expired: boolean): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/equipe/sair";
  url.search = expired ? "motivo=sessao" : "";
  return NextResponse.redirect(url);
}

function redirectKeepingCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export async function proxy(request: NextRequest) {
  // O proxy usa o runtime Node.js por padrão. A assinatura do cookie usa node:crypto.
  let response = NextResponse.next({ request });
  const clientEnv = parseClientEnv(process.env);
  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  const userResult = await supabase.auth.getUser();
  if (!isStaffArea(request.nextUrl.pathname)) return response;

  const user = userResult.data.user;
  const sessionResult = user ? await supabase.auth.getSession() : null;
  const accessToken = sessionResult?.data.session?.access_token ?? "";
  const sessionUserId = sessionResult?.data.session?.user.id ?? null;
  const sessionId =
    user && sessionUserId === user.id ? sessionIdFromAccessToken(accessToken) : null;
  const secret = parseServerEnv(process.env).STAFF_SESSION_SECRET;
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const cookie = token ? readStaffSession(token, secret) : null;
  if (cookie && evaluateStaffSession(cookie, Date.now()) === "expired") {
    return leaveStaffArea(request, true);
  }
  if (
    !cookie ||
    !user ||
    !sessionId ||
    !staffSessionMatches(cookie, { userId: user.id, sessionId })
  ) {
    return leaveStaffArea(request, false);
  }
  const requiredRoles = rolesForStaffPath(request.nextUrl.pathname);
  if (requiredRoles) {
    const profile = await loadStaffProfile(user.id);
    if (profile?.kind === "STAFF" && !profile.disabledAt) {
      const allowed = profile.roles.some((role) => requiredRoles.includes(role));
      if (!allowed) {
        // O Cache Components já enviou 200 quando a página redireciona.
        // A negação precisa acontecer aqui para o navegador receber o 403.
        await writeStaffAudit({
          action: "access.denied",
          actorUserId: user.id,
          entityType: "user",
          entityId: user.id,
          metadata: {},
        });
        return redirectKeepingCookies(request, response, "/acesso-negado");
      }
    }
  }
  response.cookies.set(
    STAFF_SESSION_COOKIE,
    signStaffSession(touchStaffSession(cookie, Date.now()), secret),
    staffSessionCookieOptions(),
  );
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/consultorio/:path*", "/equipe/:path*"],
};
