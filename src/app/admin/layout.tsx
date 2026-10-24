import { StaffShell } from "@/components/staff-shell";
import type { StaffNavLink } from "@/components/staff-nav";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff({ roles: ADMIN_ROLES });
  const links: StaffNavLink[] = [
    { href: "/admin", label: "Dashboard", group: null },
    { href: "/admin/conteudo/site", label: "Editar site", group: "CONTEÚDO" },
    { href: "/admin/conteudo/servicos", label: "Serviços", group: "CONTEÚDO" },
    { href: "/admin/conteudo/depoimentos", label: "Depoimentos", group: "CONTEÚDO" },
    { href: "/admin/conteudo/perguntas", label: "Perguntas", group: "CONTEÚDO" },
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
