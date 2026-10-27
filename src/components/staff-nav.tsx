"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type StaffNavLink = {
  href: string;
  label: string;
  group: string | null;
  match?: "exact" | "prefix";
};

export function StaffNav({ links }: { links: readonly StaffNavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups: { name: string | null; links: StaffNavLink[] }[] = [];
  for (const link of links) {
    const current = groups.find((group) => group.name === link.group);
    if (current) current.links.push(link);
    else groups.push({ name: link.group, links: [link] });
  }

  return (
    <div className="w-full md:w-56 md:shrink-0">
      <button
        type="button"
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm md:hidden"
        aria-expanded={open}
        aria-controls="staff-nav"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Fechar" : "Menu"}
      </button>
      <nav
        id="staff-nav"
        aria-label="Seções"
        className={
          open ? "mt-3 flex flex-col gap-4 md:mt-0" : "mt-3 hidden flex-col gap-4 md:flex"
        }
      >
        {groups.map((group) => (
          <div key={group.name ?? "principal"} className="flex flex-col gap-2">
            {group.name ? (
              <p className="text-xs tracking-wide text-muted">{group.name}</p>
            ) : null}
            {group.links.map((link) => {
              const active =
                link.match === "prefix"
                  ? pathname === link.href || pathname.startsWith(`${link.href}/`)
                  : pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-md bg-surface-muted px-3 py-2 text-sm font-medium"
                      : "rounded-md px-3 py-2 text-sm hover:bg-surface-muted"
                  }
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
