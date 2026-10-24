import Link from "next/link";

import { hasContact, homeSectionKeys } from "@/modules/content/home-sections";
import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import { openingText } from "@/modules/content/opening";
import type {
  PublicFaq,
  PublicService,
  PublicSite,
  PublicTestimonial,
} from "@/modules/content/queries";

import { ContactBlock } from "./contact-block";
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
  const aboutOpening = openingText(site.aboutBody);
  return (
    <div className="flex flex-col gap-12">
      {keys.includes("hero") ? (
        <section className="flex flex-col gap-4">
          {site.heroImagePath ? (
            <SitePhoto path={site.heroImagePath} alt={site.heroImageAlt ?? ""} priority />
          ) : null}
          <h1 className="font-serif text-4xl text-text">
            {site.heroTitle || "Adrielli Flores"}
          </h1>
          {site.heroSubtitle ? <p className="text-lg">{site.heroSubtitle}</p> : null}
          {site.heroTagline ? <p>{site.heroTagline}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            {site.whatsappUrl ? (
              <a
                href={site.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit rounded-lg bg-primary px-4 py-3 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Agendar avaliação
              </a>
            ) : null}
            <Link
              href="/servicos"
              className="inline-flex w-fit rounded-lg border border-border px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Conhecer os serviços
            </Link>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <h1 className="font-serif text-4xl text-text">Adrielli Flores</h1>
          {site.whatsappUrl ? (
            <a
              href={site.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit rounded-lg bg-primary px-4 py-3 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Agendar avaliação
            </a>
          ) : null}
        </section>
      )}
      {site.aboutTitle || aboutOpening ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">{site.aboutTitle || "Sobre"}</h2>
          {aboutOpening ? <p>{aboutOpening}</p> : null}
          <Link href="/sobre" className="w-fit underline-offset-4 hover:underline">
            Ler o texto completo
          </Link>
        </section>
      ) : null}
      {services.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl">Serviços</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {services.map((service) => (
              <li key={service.slug} className="rounded-lg border border-border p-4">
                <h3 className="text-lg">
                  <Link href={`/servicos#${service.slug}`} className="hover:underline">
                    {service.title}
                  </Link>
                </h3>
                {service.summary ? (
                  <p className="mt-2 text-sm">{service.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {site.howItWorks.some((step) => step.title || step.body) ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Como funciona</h2>
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            {site.howItWorks.map((step, index) =>
              step.title || step.body ? (
                <li key={`${step.title}-${index}`}>
                  {step.title ? <p className="font-medium">{step.title}</p> : null}
                  {step.body ? <p className="text-sm">{step.body}</p> : null}
                </li>
              ) : null,
            )}
          </ol>
        </section>
      ) : null}
      {testimonials.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl">Depoimentos</h2>
          {testimonials.map((item) => (
            <figure
              key={`${item.authorLabel}-${item.quote}`}
              className="flex flex-col gap-1"
            >
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
            <details key={item.question} className="rounded-lg border border-border p-3">
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
      {hasContact(site) ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Contato</h2>
          <ContactBlock site={site} />
        </section>
      ) : null}
    </div>
  );
}
