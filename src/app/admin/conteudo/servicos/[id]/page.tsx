import { sql } from "@/db/client";
import { clientEnv } from "@/lib/env-client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffService } from "@/modules/content/queries";

import { isRecordId, loadOrNull } from "../../load";
import { ServiceForm } from "../service-form";

export const instant = false;

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff({ roles: ADMIN_ROLES });
  const { id } = await params;
  if (!isRecordId(id)) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  const service = await loadOrNull(loadStaffService(sql, id));
  if (!service) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  return (
    <ServiceForm service={service} imageOrigin={clientEnv.NEXT_PUBLIC_SUPABASE_URL} />
  );
}
