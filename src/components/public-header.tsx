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

export function PublicHeader({ whatsappUrl = null }: { whatsappUrl?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label="Adrielli Flores" className="inline-flex shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-subtitulo.svg"
            alt="Adrielli Flores, psicopedagoga e neuropsicopedagoga"
            width={474}
            height={96}
            className="h-11 w-auto lg:h-14"
          />
        </Link>
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-md border border-border text-sm lg:hidden"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="public-nav"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Fechar" : "Menu"}
        </button>
        <nav
          id="public-nav"
          aria-label="Principal"
          className={`${open ? "flex" : "hidden lg:flex"} w-full flex-col items-start gap-3 border-t pt-2 lg:w-auto lg:flex-row lg:items-center lg:gap-6 lg:border-0 lg:pt-0`}
        >
          {LINKS.map((link) => {
            const current = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "inline-flex min-h-11 items-center text-[0.9375rem] text-text underline decoration-gold decoration-2 underline-offset-4"
                    : "inline-flex min-h-11 items-center text-[0.9375rem] text-text underline-offset-4 hover:underline"
                }
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 w-fit items-center rounded-lg bg-primary px-4 text-[0.9375rem] text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 lg:mt-0"
            >
              Agendar avaliação
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
