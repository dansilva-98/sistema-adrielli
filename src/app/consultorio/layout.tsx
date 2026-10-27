import { StaffShell } from "@/components/staff-shell";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function ConsultorioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireStaff({ roles: CONSULTORIO_ROLES });
  return (
    <StaffShell
      area="consultorio"
      title="Consultório"
      eyebrow="Atendimento clínico"
      roles={profile.roles}
      links={[
        { href: "/consultorio", label: "Dashboard", group: null },
        {
          href: "/consultorio/pacientes",
          label: "Pacientes",
          group: null,
          match: "prefix",
        },
      ]}
    >
      {children}
    </StaffShell>
  );
}
