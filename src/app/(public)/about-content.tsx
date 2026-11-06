import Link from "next/link";

import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import { featuredAboutText, remainingAboutSource } from "@/modules/content/opening";
import type { PublicSite } from "@/modules/content/queries";

import { SitePhoto } from "./site-photo";

export function AboutContent({ site }: { site: PublicSite }) {
  const featured = featuredAboutText(site.aboutBody);
  const rest = remainingAboutSource(site.aboutBody);
  const area = site.serviceAreaText?.trim() ?? "";

  return (
    <div className="flex flex-col gap-12">
      <section
        className={
          site.aboutImagePath
            ? "grid items-start gap-8 lg:grid-cols-2"
            : "grid max-w-[65ch] gap-6"
        }
      >
        {site.aboutImagePath ? (
          <SitePhoto
            path={site.aboutImagePath}
            alt={site.aboutImageAlt ?? ""}
            className="aspect-[4/5] max-h-none object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-5">
          <h1 className="font-serif text-4xl text-balance sm:text-5xl">
            {site.aboutTitle.trim() || "Sobre"}
          </h1>
          {featured ? (
            <p className="max-w-[65ch] font-serif text-2xl text-text">{featured}</p>
          ) : null}
          {rest ? (
            <div className="max-w-[65ch] text-text">
              <RestrictedMarkdown source={rest} />
            </div>
          ) : null}
          {site.whatsappUrl ? (
            <a
              href={site.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-fit items-center rounded-lg bg-primary px-4 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Agendar avaliação
            </a>
          ) : null}
        </div>
      </section>
      {area ? (
        <section className="flex max-w-[65ch] flex-col gap-3">
          <h2 className="font-serif text-2xl sm:text-3xl">Onde atua</h2>
          <p className="text-muted">{area}</p>
          <Link
            href="/#como-funciona"
            className="inline-flex min-h-11 w-fit items-center text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Como é o atendimento
          </Link>
        </section>
      ) : null}
    </div>
  );
}
