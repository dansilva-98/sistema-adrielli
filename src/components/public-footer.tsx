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
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-serif text-base text-text">Adrielli Flores</p>
          {site.addressText ? <p className="text-text">{site.addressText}</p> : null}
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
