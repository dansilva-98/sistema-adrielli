import type { Metadata } from "next";

import { HomeContent } from "@/app/(public)/home-sections";
import { publicPageMetadata } from "@/modules/content/indexing";
import {
  getPublishedFaq,
  getPublishedServices,
  getPublishedTestimonials,
  getPublicSite,
} from "@/modules/content/server/public";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getPublicSite();
  return publicPageMetadata({
    pageName: "Início",
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    path: "/",
  });
}

export default async function HomePage() {
  const [site, services, testimonials, faq] = await Promise.all([
    getPublicSite(),
    getPublishedServices(),
    getPublishedTestimonials(),
    getPublishedFaq(),
  ]);
  return (
    <HomeContent site={site} services={services} testimonials={testimonials} faq={faq} />
  );
}
