import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff({ roles: ADMIN_ROLES });
  return children;
}
