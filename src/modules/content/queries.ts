import type postgres from "postgres";

import { whatsAppUrl } from "@/modules/content/whatsapp";

export const CONTENT_SITE_TAG = "content-site";
export const CONTENT_SERVICES_TAG = "content-services";
export const CONTENT_TESTIMONIALS_TAG = "content-testimonials";
export const CONTENT_FAQ_TAG = "content-faq";

export type HowItWorksStep = { title: string; body: string };

export type PublicSite = {
  heroTitle: string;
  heroSubtitle: string;
  heroTagline: string;
  heroImagePath: string | null;
  heroImageAlt: string | null;
  aboutTitle: string;
  aboutBody: string;
  aboutImagePath: string | null;
  aboutImageAlt: string | null;
  howItWorks: HowItWorksStep[];
  whatsappNumber: string | null;
  whatsappMessage: string;
  whatsappUrl: string | null;
  instagramHandle: string | null;
  instagramUrl: string | null;
  contactEmail: string | null;
  supportEmail: string | null;
  addressText: string | null;
  serviceAreaText: string | null;
  seoTitle: string;
  seoDescription: string;
};

export const EMPTY_PUBLIC_SITE: PublicSite = {
  heroTitle: "",
  heroSubtitle: "",
  heroTagline: "",
  heroImagePath: null,
  heroImageAlt: null,
  aboutTitle: "",
  aboutBody: "",
  aboutImagePath: null,
  aboutImageAlt: null,
  howItWorks: [],
  whatsappNumber: null,
  whatsappMessage: "",
  whatsappUrl: null,
  instagramHandle: null,
  instagramUrl: null,
  contactEmail: null,
  supportEmail: null,
  addressText: null,
  serviceAreaText: null,
  seoTitle: "",
  seoDescription: "",
};

export type PublicService = {
  slug: string;
  title: string;
  summary: string;
  body: string;
  imagePath: string | null;
  imageAlt: string | null;
};

export type PublicTestimonial = { quote: string; authorLabel: string };
export type PublicFaq = { question: string; answer: string };

type Sql = postgres.Sql | postgres.TransactionSql;

export async function loadPublicSite(sql: Sql): Promise<PublicSite> {
  const rows = await sql<
    {
      hero_title: string;
      hero_subtitle: string;
      hero_tagline: string;
      hero_image_path: string | null;
      hero_image_alt: string | null;
      about_title: string;
      about_body: string;
      about_image_path: string | null;
      about_image_alt: string | null;
      how_it_works: HowItWorksStep[] | string;
      whatsapp_number: string | null;
      whatsapp_message: string;
      instagram_handle: string | null;
      contact_email: string | null;
      support_email: string | null;
      address_text: string | null;
      service_area_text: string | null;
      seo_title: string;
      seo_description: string;
    }[]
  >`
    select hero_title, hero_subtitle, hero_tagline, hero_image_path, hero_image_alt,
      about_title, about_body, about_image_path, about_image_alt, how_it_works,
      whatsapp_number, whatsapp_message, instagram_handle, contact_email, support_email,
      address_text, service_area_text, seo_title, seo_description
    from content.site_settings
    where id = 1
  `;
  const row = rows[0];
  if (!row) return EMPTY_PUBLIC_SITE;
  return mapSiteRow(row);
}

export { whatsAppUrl };

export type EditableSite = PublicSite & { version: number };

export async function loadEditableSite(sql: Sql): Promise<EditableSite | null> {
  const rows = await sql<
    {
      hero_title: string;
      hero_subtitle: string;
      hero_tagline: string;
      hero_image_path: string | null;
      hero_image_alt: string | null;
      about_title: string;
      about_body: string;
      about_image_path: string | null;
      about_image_alt: string | null;
      how_it_works: HowItWorksStep[] | string;
      whatsapp_number: string | null;
      whatsapp_message: string;
      instagram_handle: string | null;
      contact_email: string | null;
      support_email: string | null;
      address_text: string | null;
      service_area_text: string | null;
      seo_title: string;
      seo_description: string;
      version: number;
    }[]
  >`
    select hero_title, hero_subtitle, hero_tagline, hero_image_path, hero_image_alt,
      about_title, about_body, about_image_path, about_image_alt, how_it_works,
      whatsapp_number, whatsapp_message, instagram_handle, contact_email, support_email,
      address_text, service_area_text, seo_title, seo_description, version
    from content.site_settings
    where id = 1
  `;
  const row = rows[0];
  if (!row) return null;
  const site = mapSiteRow(row);
  return { ...site, version: row.version };
}

function mapSiteRow(row: {
  hero_title: string;
  hero_subtitle: string;
  hero_tagline: string;
  hero_image_path: string | null;
  hero_image_alt: string | null;
  about_title: string;
  about_body: string;
  about_image_path: string | null;
  about_image_alt: string | null;
  how_it_works: HowItWorksStep[] | string;
  whatsapp_number: string | null;
  whatsapp_message: string;
  instagram_handle: string | null;
  contact_email: string | null;
  support_email: string | null;
  address_text: string | null;
  service_area_text: string | null;
  seo_title: string;
  seo_description: string;
}): PublicSite {
  const steps = Array.isArray(row.how_it_works)
    ? row.how_it_works
    : (JSON.parse(row.how_it_works) as HowItWorksStep[]);
  return {
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    heroTagline: row.hero_tagline,
    heroImagePath: row.hero_image_path,
    heroImageAlt: row.hero_image_alt,
    aboutTitle: row.about_title,
    aboutBody: row.about_body,
    aboutImagePath: row.about_image_path,
    aboutImageAlt: row.about_image_alt,
    howItWorks: steps.map((step) => ({
      title: typeof step?.title === "string" ? step.title : "",
      body: typeof step?.body === "string" ? step.body : "",
    })),
    whatsappNumber: row.whatsapp_number,
    whatsappMessage: row.whatsapp_message,
    whatsappUrl: whatsAppUrl(row.whatsapp_number, row.whatsapp_message),
    instagramHandle: row.instagram_handle,
    instagramUrl: row.instagram_handle
      ? `https://instagram.com/${row.instagram_handle}`
      : null,
    contactEmail: row.contact_email,
    supportEmail: row.support_email,
    addressText: row.address_text,
    serviceAreaText: row.service_area_text,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

export async function loadPublishedServices(sql: Sql): Promise<PublicService[]> {
  return sql<PublicService[]>`
    select slug, title, summary, body, image_path as "imagePath", image_alt as "imageAlt"
    from content.services
    where published = true
    order by sort_order, id
  `;
}

export async function loadPublishedServiceBySlug(
  sql: Sql,
  slug: string,
): Promise<PublicService | null> {
  const rows = await sql<PublicService[]>`
    select slug, title, summary, body, image_path as "imagePath", image_alt as "imageAlt"
    from content.services
    where published = true and slug = ${slug}
  `;
  return rows[0] ?? null;
}

export async function loadPublishedTestimonials(sql: Sql): Promise<PublicTestimonial[]> {
  return sql<PublicTestimonial[]>`
    select quote, author_label as "authorLabel"
    from content.testimonials
    where published = true
    order by sort_order, id
  `;
}

export async function loadPublishedFaq(sql: Sql): Promise<PublicFaq[]> {
  return sql<PublicFaq[]>`
    select question, answer
    from content.faq
    where published = true
    order by sort_order, id
  `;
}

export async function readOrEmpty<T>(
  load: () => Promise<T>,
  empty: T,
  report: (error: unknown) => void,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    report(error);
    return empty;
  }
}
