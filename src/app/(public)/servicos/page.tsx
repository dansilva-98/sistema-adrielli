import type { Metadata } from "next";
import { Suspense } from "react";

import { ServicesContent } from "@/app/(public)/services-content";
import { publicPageMetadata } from "@/modules/content/indexing";
import {
  readPublishedFaq,
  readPublishedServices,
  readPublishedTestimonials,
  readPublicSite,
} from "@/modules/content/server/public";

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
      <ServicosBody />
    </Suspense>
  );
}

async function ServicosBody() {
  const [site, services, testimonials, faq] = await Promise.all([
    readPublicSite(),
    readPublishedServices(),
    readPublishedTestimonials(),
    readPublishedFaq(),
  ]);
  return (
    <ServicesContent
      site={site}
      services={services}
      testimonials={testimonials}
      faq={faq}
    />
  );
}
