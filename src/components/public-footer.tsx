import Link from "next/link";

import type { PublicSite } from "@/modules/content/queries";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/sobre", label: "Sobre" },
  { href: "/servicos", label: "Serviços" },
  { href: "/materiais", label: "Materiais" },
  { href: "/contato", label: "Contato" },
  { href: "/privacidade", label: "Privacidade" },
] as const;

export function PublicFooter({ site }: { site: PublicSite }) {
  const contacts = [
    site.whatsappUrl
      ? { href: site.whatsappUrl, label: "WhatsApp", external: true }
      : null,
    site.instagramUrl
      ? { href: site.instagramUrl, label: "Instagram", external: true }
      : null,
    site.contactEmail
      ? { href: `mailto:${site.contactEmail}`, label: site.contactEmail, external: false }
      : null,
  ].filter((item) => item !== null);
  const spacing = site.whatsappUrl
    ? "mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] text-sm sm:flex-row sm:items-center sm:justify-between xl:pb-6"
    : "mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between";
  return (
    <footer className="border-t border-border bg-text text-gold-light">
      <div className={spacing}>
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-claro.svg"
            alt="Adrielli Flores"
            width={227}
            height={46}
            className="h-[38px] w-auto md:h-[46px]"
          />
          {site.addressText ? <p>{site.addressText}</p> : null}
          {contacts.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {contacts.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="hover:underline"
                    {...(item.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-4 gap-y-2">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
