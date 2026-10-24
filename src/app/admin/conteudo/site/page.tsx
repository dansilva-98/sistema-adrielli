import * as Sentry from "@sentry/nextjs";

import { sql } from "@/db/client";
import { clientEnv } from "@/lib/env-client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadEditableSite } from "@/modules/content/queries";

import { SiteEditor } from "./site-editor";

export const instant = false;

export default async function EditSitePage() {
  await requireStaff({ roles: ADMIN_ROLES });
  const site = await loadEditableSite(sql).catch((error: unknown) => {
    Sentry.captureException(error);
    return null;
  });
  if (!site) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  return <SiteEditor site={site} imageOrigin={clientEnv.NEXT_PUBLIC_SUPABASE_URL} />;
}
