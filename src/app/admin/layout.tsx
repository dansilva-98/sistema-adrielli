import { StaffShell } from "@/components/staff-shell";
import type { StaffNavLink } from "@/components/staff-nav";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { loadStaffProfile } from "@/modules/identity/server/directory";
import { requireStaff } from "@/modules/identity/server/guard";
import { redirect } from "next/navigation";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const profile = await loadStaffProfile(actor.userId);
  if (!profile) redirect("/equipe/sair");
  const links: StaffNavLink[] = [
    { href: "/admin", label: "Dashboard", group: null },
    { href: "/admin/conteudo/site", label: "Editar site", group: "CONTEÚDO" },
  ];
  if (profile.roles.includes("SUPER_ADMIN")) {
    links.push({ href: "/admin/usuarios", label: "Usuários", group: "SISTEMA" });
  }
  return (
    <StaffShell
      area="admin"
      title="Administração"
      eyebrow="Painel administrativo"
      roles={profile.roles}
      links={links}
    >
      {children}
    </StaffShell>
  );
}
