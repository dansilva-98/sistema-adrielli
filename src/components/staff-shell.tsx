import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StaffNav, type StaffNavLink } from "@/components/staff-nav";
import { canSwitchStaffArea, type StaffRole } from "@/modules/identity/access";
import { logoutAction } from "@/modules/identity/server/actions";

export function StaffShell({
  area,
  title,
  eyebrow,
  roles,
  links,
  children,
}: {
  area: "admin" | "consultorio";
  title: string;
  eyebrow: string;
  roles: readonly StaffRole[];
  links: readonly StaffNavLink[];
  children: React.ReactNode;
}) {
  const accent = area === "admin" ? "border-primary" : "border-support";
  return (
    <div
      data-area={area}
      className={`flex min-h-full flex-1 flex-col border-t-4 ${accent}`}
    >
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-sm text-muted">{eyebrow}</p>
            <h1 className="font-serif text-3xl">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canSwitchStaffArea(roles) ? (
              <nav aria-label="Trocar de área" className="flex gap-3 text-sm">
                <Link href="/admin" className="underline-offset-4 hover:underline">
                  Administração
                </Link>
                <Link href="/consultorio" className="underline-offset-4 hover:underline">
                  Consultório
                </Link>
              </nav>
            ) : null}
            <form action={logoutAction}>
              <Button type="submit" variant="outline">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
        <StaffNav links={links} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
