import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { parseClientEnv } from "@/lib/env";

function isStaffArea(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/consultorio");
}

export async function proxy(request: NextRequest) {
  // Renova a sessão do Supabase. A autorização fica em requireStaff.
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
  const user = await supabase.auth.getUser();
  if (isStaffArea(request.nextUrl.pathname) && !user.data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/equipe/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/consultorio/:path*", "/equipe/:path*"],
};
