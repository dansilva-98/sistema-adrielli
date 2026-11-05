import Link from "next/link";

import type { PublicSite } from "@/modules/content/queries";

export function PublicFooter({ site }: { site: PublicSite }) {
  const padding = site.whatsappUrl
    ? "pt-12 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10"
    : "pt-12 pb-10";
  return (
    <footer className="border-t border-border bg-text text-gold-light">
      <div className={`mx-auto w-full max-w-5xl px-4 ${padding}`}>
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-16">
          <div className="flex flex-col items-start gap-4">
            <p className="max-w-[18ch] font-serif text-[1.75rem] leading-tight text-balance text-gold-light sm:text-4xl">
              A etapa 1 começa com uma mensagem.
            </p>
            {site.whatsappUrl ? (
              <a
                href={site.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-fit items-center rounded-lg bg-gold-light px-5 font-medium text-text focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Chamar no WhatsApp
              </a>
            ) : null}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-claro.svg"
            alt="Adrielli Flores"
            width={227}
            height={46}
            className="h-10 w-auto md:h-12 md:justify-self-end"
          />
        </div>
        <nav
          aria-label="Rodapé"
          className="mt-10 flex flex-wrap items-center gap-x-4 border-t border-gold-light/20 pt-4 text-sm"
        >
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
