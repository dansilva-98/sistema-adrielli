import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function ConsultorioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  return children;
}
