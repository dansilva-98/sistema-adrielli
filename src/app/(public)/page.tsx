import { HomeContent } from "@/app/(public)/home-sections";
import {
  getPublishedFaq,
  getPublishedServices,
  getPublishedTestimonials,
  getPublicSite,
} from "@/modules/content/server/public";

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
