import Link from "next/link";

import type { PublicSite } from "@/modules/content/queries";

export function PublicFooter({ site }: { site: PublicSite }) {
  const spacing = site.whatsappUrl
    ? "mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:justify-between xl:pb-6"
    : "mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between";
  return (
    <footer className="border-t border-border bg-text text-gold-light">
      <div className={spacing}>
        <div className="flex max-w-md flex-col items-start gap-4">
          <p className="font-serif text-2xl text-gold-light sm:text-3xl">
            A etapa 1 começa com uma mensagem.
          </p>
          {site.whatsappUrl ? (
            <a
              href={site.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-fit items-center rounded-lg bg-gold-light px-4 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Chamar no WhatsApp
            </a>
          ) : null}
          {site.instagramUrl ? (
            <a
              href={site.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              Instagram
            </a>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-claro.svg"
            alt="Adrielli Flores"
            width={227}
            height={46}
            className="h-11 w-auto"
          />
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link
            href="/privacidade"
            className="inline-flex min-h-11 items-center hover:underline"
          >
            Privacidade
          </Link>
        </nav>
      </div>
    </footer>
  );
}
