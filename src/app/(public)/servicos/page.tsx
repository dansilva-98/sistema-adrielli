import type { Metadata } from "next";
import { Suspense } from "react";

import { SitePhoto } from "@/app/(public)/site-photo";
import { publicPageMetadata } from "@/modules/content/indexing";
import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import { readPublishedServices, readPublicSite } from "@/modules/content/server/public";

export async function generateMetadata(): Promise<Metadata> {
  const site = await readPublicSite();
  return publicPageMetadata({
    pageName: "Serviços",
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    path: "/servicos",
  });
}

export default function ServicosPage() {
  return (
    <Suspense fallback={null}>
      <ServicosContent />
    </Suspense>
  );
}

async function ServicosContent() {
  const services = await readPublishedServices();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-serif text-4xl">Serviços</h1>
      {services.length === 0 ? <p>Nenhum serviço publicado.</p> : null}
      {services.map((service) => (
        <article
          id={service.slug}
          key={service.slug}
          className="flex scroll-mt-6 flex-col gap-3"
        >
          <h2 className="font-serif text-2xl">{service.title}</h2>
          {service.imagePath ? (
            <SitePhoto path={service.imagePath} alt={service.imageAlt ?? ""} />
          ) : null}
          {service.summary ? <p>{service.summary}</p> : null}
          {service.body ? <RestrictedMarkdown source={service.body} /> : null}
        </article>
      ))}
    </div>
  );
}
