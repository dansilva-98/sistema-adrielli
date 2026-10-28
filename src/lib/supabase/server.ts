import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { parseClientEnv } from "@/lib/env";
import {
  STAFF_SESSION_COOKIE,
  staffCookieSecure,
  staffSessionCookieOptions,
} from "@/modules/identity/staff-session";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const clientEnv = parseClientEnv(process.env);
  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Um Server Component não pode gravar cookie. O proxy renova a sessão.
          }
        },
      },
    },
  );
}

export async function writeStaffSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  const host = (await headers()).get("host");
  cookieStore.set(
    STAFF_SESSION_COOKIE,
    token,
    staffSessionCookieOptions(staffCookieSecure(host)),
  );
}

export async function clearStaffSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_SESSION_COOKIE);
}
