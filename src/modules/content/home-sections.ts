import { openingText } from "@/modules/content/opening";
import type {
  PublicFaq,
  PublicService,
  PublicSite,
  PublicTestimonial,
} from "@/modules/content/queries";

export function hasHowItWorks(site: PublicSite): boolean {
  const filled = site.howItWorks.filter((step) => step.body.trim().length > 0);
  return filled.length >= 3 && filled.length <= 6;
}

export function howItWorksSteps(site: PublicSite) {
  return site.howItWorks.filter((step) => step.body.trim().length > 0);
}

export function heroHeadingText(site: PublicSite): string {
  const tagline = site.heroTagline.trim();
  if (tagline) return tagline;
  return site.heroTitle.trim() || "Adrielli Flores";
}

export function heroHeadingClass(text: string): string {
  if (text.length <= 45) return "text-[2.875rem] sm:text-[5rem]";
  if (text.length <= 90) return "text-[2.375rem] sm:text-[4rem]";
  return "text-[2rem] sm:text-[3.25rem]";
}

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
  _services: PublicService[],
  testimonials: PublicTestimonial[],
  faq: PublicFaq[],
): string[] {
  const keys: string[] = [];
  if (site.heroTitle || site.heroSubtitle || site.heroTagline || site.heroImagePath) {
    keys.push("hero");
  }
  if (site.serviceAreaText?.trim()) keys.push("area");
  if (hasHowItWorks(site)) keys.push("how");
  if (site.aboutTitle || openingText(site.aboutBody)) keys.push("about");
  if (testimonials.length > 0) keys.push("testimonials");
  if (faq.length > 0) keys.push("faq");
  return keys;
}
