import { redirect } from "next/navigation";

import { StaffShell } from "@/components/staff-shell";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { loadStaffProfile } from "@/modules/identity/server/directory";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function ConsultorioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireStaff({ roles: CONSULTORIO_ROLES });
  const profile = await loadStaffProfile(actor.userId);
  if (!profile) redirect("/equipe/sair");
  return (
    <StaffShell
      area="consultorio"
      title="Consultório"
      eyebrow="Atendimento clínico"
      roles={profile.roles}
      links={[{ href: "/consultorio", label: "Dashboard", group: null }]}
    >
      {children}
    </StaffShell>
  );
}
