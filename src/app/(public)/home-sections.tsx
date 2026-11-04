import Link from "next/link";

import { StepTrack } from "@/components/step-track";
import {
  hasHowItWorks,
  heroHeadingClass,
  heroHeadingText,
  homeSectionKeys,
  howItWorksSteps,
} from "@/modules/content/home-sections";
import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import { openingText } from "@/modules/content/opening";
import type {
  PublicFaq,
  PublicService,
  PublicSite,
  PublicTestimonial,
} from "@/modules/content/queries";

import { SitePhoto } from "./site-photo";

export function HomeContent({
  site,
  services,
  testimonials,
  faq,
}: {
  site: PublicSite;
  services: PublicService[];
  testimonials: PublicTestimonial[];
  faq: PublicFaq[];
}) {
  const keys = homeSectionKeys(site, services, testimonials, faq);
  const heading = heroHeadingText(site);
  const aboutOpening = openingText(site.aboutBody);
  const about = keys.includes("about");
  const steps = howItWorksSteps(site);

  return (
    <div className="flex flex-col gap-12">
      <section
        className={
          site.heroImagePath
            ? "grid items-center gap-8 lg:grid-cols-2"
            : "grid max-w-3xl gap-8"
        }
      >
        <div className="flex flex-col gap-4">
          <h1
            className={`font-serif leading-tight text-text ${heroHeadingClass(heading)}`}
          >
            {heading}
          </h1>
          {site.heroSubtitle ? (
            <p className="max-w-prose text-lg text-muted">{site.heroSubtitle}</p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {site.whatsappUrl ? (
              <a
                href={site.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-fit items-center rounded-lg bg-primary px-4 py-3 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Conversar pelo WhatsApp
              </a>
            ) : null}
            <Link
              href="#como-funciona"
              className="inline-flex min-h-11 w-fit items-center text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Como é o atendimento
            </Link>
          </div>
        </div>
        {site.heroImagePath ? (
          <SitePhoto
            path={site.heroImagePath}
            alt={site.heroImageAlt ?? ""}
            priority
            className="aspect-[4/5] max-h-none object-cover"
          />
        ) : null}
      </section>
      {keys.includes("area") && site.serviceAreaText ? (
        <section className="rounded-lg bg-surface-muted px-4 py-5 sm:px-6">
          <p className="max-w-prose text-muted">{site.serviceAreaText}</p>
        </section>
      ) : null}
      {hasHowItWorks(site) ? (
        <section id="como-funciona" className="flex flex-col gap-6">
          <h2 id="como-funciona-titulo" className="font-serif text-3xl sm:text-5xl">
            Como funciona
          </h2>
          <p className="font-sans text-sm text-muted sm:hidden">
            Toque em cada etapa para ver os detalhes.
          </p>
          <StepTrack
            variant="tabs"
            steps={steps}
            labelledBy="como-funciona-titulo"
            panelNav
          />
        </section>
      ) : null}
      <div className={about ? "grid gap-6 lg:grid-cols-2" : ""}>
        {about ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">Quem conduz cada etapa</h2>
            {aboutOpening ? <p className="max-w-prose">{aboutOpening}</p> : null}
            <Link
              href="/sobre"
              className="w-fit text-primary underline-offset-4 hover:underline"
            >
              Ler o texto completo
            </Link>
          </section>
        ) : null}
        <section className="rounded-lg border border-line p-4">
          <h2 className="font-serif text-2xl">Materiais</h2>
          <p className="mt-2 text-sm">Em breve</p>
          <Link
            href="/materiais"
            className="mt-3 inline-flex w-fit underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver materiais
          </Link>
        </section>
      </div>
      {testimonials.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl">Depoimentos</h2>
          {testimonials.map((item) => (
            <figure key={item.id} className="flex flex-col gap-1">
              <blockquote>{item.quote}</blockquote>
              {item.authorLabel ? (
                <figcaption className="text-sm text-muted">{item.authorLabel}</figcaption>
              ) : null}
            </figure>
          ))}
        </section>
      ) : null}
      {faq.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Perguntas frequentes</h2>
          {faq.map((item) => (
            <details key={item.id} className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer focus-visible:outline-2">
                {item.question}
              </summary>
              <div className="pt-3 text-sm">
                <RestrictedMarkdown source={item.answer} />
              </div>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}
