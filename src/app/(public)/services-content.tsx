import Link from "next/link";

import { ServiceList } from "@/app/(public)/service-list";
import { TestimonialList } from "@/app/(public)/testimonial-list";
import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import type {
  PublicFaq,
  PublicService,
  PublicSite,
  PublicTestimonial,
} from "@/modules/content/queries";

export function ServicesContent({
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
  return (
    <div className="flex flex-col gap-12">
      <h1 className="max-w-[18ch] font-serif text-4xl text-balance sm:text-5xl">
        Como posso ajudar seu filho.
      </h1>
      {services.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p>Nenhum serviço publicado.</p>
          {site.whatsappUrl ? (
            <a
              href={site.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-fit items-center rounded-lg bg-primary px-4 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Agendar avaliação
            </a>
          ) : (
            <Link
              href="/contato"
              className="inline-flex min-h-11 w-fit items-center text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Contato
            </Link>
          )}
        </div>
      ) : (
        <ServiceList services={services} whatsappUrl={site.whatsappUrl} />
      )}
      {testimonials.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl">Depoimentos</h2>
          <TestimonialList items={testimonials} />
        </section>
      ) : null}
      {faq.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Perguntas frequentes</h2>
          {faq.map((item) => (
            <details key={item.id} className="rounded-lg border border-line p-3">
              <summary className="min-h-11 cursor-pointer focus-visible:outline-2">
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
