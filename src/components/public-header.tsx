"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/sobre", label: "Sobre" },
  { href: "/servicos", label: "Serviços" },
  { href: "/materiais", label: "Materiais" },
  { href: "/contato", label: "Contato" },
] as const;

export function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/" aria-label="Adrielli Flores" className="inline-flex shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal.svg"
            alt="Adrielli Flores"
            width={227}
            height={46}
            className="h-[38px] w-auto md:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-subtitulo.svg"
            alt="Adrielli Flores"
            width={474}
            height={96}
            className="hidden h-[96px] w-auto md:block"
          />
        </Link>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-sm md:hidden"
          aria-expanded={open}
          aria-controls="public-nav"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Fechar" : "Menu"}
        </button>
        <nav
          id="public-nav"
          aria-label="Principal"
          className={
            open
              ? "flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center md:gap-6"
              : "hidden w-full flex-col gap-3 md:flex md:w-auto md:flex-row md:items-center md:gap-6"
          }
        >
          {LINKS.map((link) => {
            const current = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className="text-sm text-text underline-offset-4 hover:underline"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
