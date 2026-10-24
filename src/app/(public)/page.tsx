import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeContent } from "@/app/(public)/home-sections";
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
    pageName: "Início",
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    path: "/",
  });
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}

async function HomePageContent() {
  const [site, services, testimonials, faq] = await Promise.all([
    readPublicSite(),
    readPublishedServices(),
    readPublishedTestimonials(),
    readPublishedFaq(),
  ]);
  return (
    <HomeContent site={site} services={services} testimonials={testimonials} faq={faq} />
  );
}
