import { USER_ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function AdminUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff({ roles: USER_ADMIN_ROLES });
  return children;
}
