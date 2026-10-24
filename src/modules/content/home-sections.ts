import { openingText } from "@/modules/content/opening";
import type {
  PublicFaq,
  PublicService,
  PublicSite,
  PublicTestimonial,
} from "@/modules/content/queries";

export function hasContact(site: PublicSite): boolean {
  return Boolean(
    site.whatsappUrl ||
    site.instagramUrl ||
    site.contactEmail ||
    site.addressText ||
    site.serviceAreaText,
  );
}

export function homeSectionKeys(
  site: PublicSite,
  services: PublicService[],
  testimonials: PublicTestimonial[],
  faq: PublicFaq[],
): string[] {
  const keys: string[] = [];
  if (site.heroTitle || site.heroSubtitle || site.heroTagline || site.heroImagePath) {
    keys.push("hero");
  }
  if (site.aboutTitle || openingText(site.aboutBody)) keys.push("about");
  if (services.length > 0) keys.push("services");
  if (site.howItWorks.some((step) => step.title || step.body)) keys.push("how");
  if (testimonials.length > 0) keys.push("testimonials");
  if (faq.length > 0) keys.push("faq");
  if (hasContact(site)) keys.push("contact");
  return keys;
}
