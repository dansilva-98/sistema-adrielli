import { clientEnv } from "@/lib/env-client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { ServiceForm } from "../service-form";

export const instant = false;

export default async function NewServicePage() {
  await requireStaff({ roles: ADMIN_ROLES });
  return <ServiceForm service={null} imageOrigin={clientEnv.NEXT_PUBLIC_SUPABASE_URL} />;
}
