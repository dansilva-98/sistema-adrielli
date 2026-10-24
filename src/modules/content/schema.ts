import { z } from "zod";

import { CONTENT_LIMITS } from "@/db/content-limits";
import { isSiteImagePath } from "@/modules/content/image-path";

const requiredText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Preencha este campo.")
    .max(max, `Use no máximo ${max} caracteres.`);

const optionalImagePath = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isSiteImagePath(value),
    "A imagem não está no formato esperado.",
  )
  .transform((value) => (value === "" ? null : value));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((value) => (value === "" ? null : value));

const slugSchema = z
  .string()
  .trim()
  .min(1, "Preencha este campo.")
  .max(
    CONTENT_LIMITS.serviceSlug,
    `Use no máximo ${CONTENT_LIMITS.serviceSlug} caracteres.`,
  )
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen.");

export const howItWorksSchema = z
  .array(
    z.object({
      title: requiredText(CONTENT_LIMITS.howItWorksTitle),
      body: z.string().trim().max(CONTENT_LIMITS.howItWorksBody),
    }),
  )
  .min(3, "Inclua pelo menos 3 etapas.")
  .max(6, "Use no máximo 6 etapas.");

export const siteSettingsSchema = z
  .object({
    version: z.number().int().min(1),
    heroTitle: z.string().trim().max(CONTENT_LIMITS.heroTitle),
    heroSubtitle: z.string().trim().max(CONTENT_LIMITS.heroSubtitle),
    heroTagline: z.string().trim().max(CONTENT_LIMITS.heroTagline),
    heroImagePath: optionalImagePath,
    heroImageAlt: optionalText(CONTENT_LIMITS.heroImageAlt),
    aboutTitle: z.string().trim().max(CONTENT_LIMITS.aboutTitle),
    aboutBody: z.string().trim().max(CONTENT_LIMITS.aboutBody),
    aboutImagePath: optionalImagePath,
    aboutImageAlt: optionalText(CONTENT_LIMITS.aboutImageAlt),
    howItWorks: howItWorksSchema,
    whatsappNumber: z
      .string()
      .transform((value) => value.replace(/\D/g, ""))
      .pipe(
        z
          .string()
          .max(
            CONTENT_LIMITS.whatsappNumber,
            `Use no máximo ${CONTENT_LIMITS.whatsappNumber} caracteres.`,
          )
          .regex(/^[0-9]*$/, "Use só os dígitos, com DDI.")
          .transform((value) => (value === "" ? null : value)),
      ),
    whatsappMessage: z.string().trim().max(CONTENT_LIMITS.whatsappMessage),
    instagramHandle: z
      .string()
      .trim()
      .max(CONTENT_LIMITS.instagramHandle)
      .refine((value) => !value.includes("@"), "Não inclua o @.")
      .transform((value) => (value === "" ? null : value)),
    contactEmail: optionalText(CONTENT_LIMITS.contactEmail).refine(
      (value) => value === null || z.email().safeParse(value).success,
      "Informe um e-mail válido.",
    ),
    supportEmail: optionalText(CONTENT_LIMITS.supportEmail).refine(
      (value) => value === null || z.email().safeParse(value).success,
      "Informe um e-mail válido.",
    ),
    addressText: optionalText(CONTENT_LIMITS.addressText),
    serviceAreaText: optionalText(CONTENT_LIMITS.serviceAreaText),
    seoTitle: z.string().trim().max(CONTENT_LIMITS.seoTitle),
    seoDescription: z.string().trim().max(CONTENT_LIMITS.seoDescription),
  })
  .superRefine((value, context) => {
    if (value.heroImagePath && !value.heroImageAlt) {
      context.addIssue({
        code: "custom",
        message: "Descreva a imagem.",
        path: ["heroImageAlt"],
      });
    }
    if (value.aboutImagePath && !value.aboutImageAlt) {
      context.addIssue({
        code: "custom",
        message: "Descreva a imagem.",
        path: ["aboutImageAlt"],
      });
    }
  });

export const serviceSchema = z
  .object({
    title: requiredText(CONTENT_LIMITS.serviceTitle),
    slug: slugSchema,
    summary: requiredText(CONTENT_LIMITS.serviceSummary),
    body: z
      .string()
      .trim()
      .min(1, "Preencha este campo.")
      .max(CONTENT_LIMITS.serviceBody),
    imagePath: optionalImagePath,
    imageAlt: optionalText(CONTENT_LIMITS.serviceImageAlt),
    published: z.boolean(),
    version: z.number().int().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.imagePath && !value.imageAlt) {
      context.addIssue({
        code: "custom",
        message: "Descreva a imagem.",
        path: ["imageAlt"],
      });
    }
  });

export const testimonialSchema = z
  .object({
    quote: requiredText(CONTENT_LIMITS.testimonialQuote),
    authorLabel: requiredText(CONTENT_LIMITS.testimonialAuthor),
    consentAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do consentimento.")
      .nullable(),
    published: z.boolean(),
    version: z.number().int().min(1).optional(),
  })
  .refine((value) => !value.published || value.consentAt, {
    message: "Publique só com a data do consentimento.",
    path: ["consentAt"],
  });

export const faqSchema = z.object({
  question: requiredText(CONTENT_LIMITS.faqQuestion),
  answer: requiredText(CONTENT_LIMITS.faqAnswer),
  published: z.boolean(),
  version: z.number().int().min(1).optional(),
});

export const SITE_SECTIONS = ["hero", "about", "how", "contact", "search"] as const;
export type SiteSection = (typeof SITE_SECTIONS)[number];

export function isSiteSection(value: string): value is SiteSection {
  return (SITE_SECTIONS as readonly string[]).includes(value);
}

const sectionVersion = z.number().int().min(1);

export const heroSectionSchema = z
  .object({
    version: sectionVersion,
    heroTitle: z.string().trim().max(CONTENT_LIMITS.heroTitle),
    heroSubtitle: z.string().trim().max(CONTENT_LIMITS.heroSubtitle),
    heroTagline: z.string().trim().max(CONTENT_LIMITS.heroTagline),
    heroImagePath: optionalImagePath,
    heroImageAlt: optionalText(CONTENT_LIMITS.heroImageAlt),
  })
  .superRefine((value, context) => {
    if (value.heroImagePath && !value.heroImageAlt) {
      context.addIssue({
        code: "custom",
        message: "Descreva a imagem.",
        path: ["heroImageAlt"],
      });
    }
  });

export const aboutSectionSchema = z
  .object({
    version: sectionVersion,
    aboutTitle: z.string().trim().max(CONTENT_LIMITS.aboutTitle),
    aboutBody: z.string().trim().max(CONTENT_LIMITS.aboutBody),
    aboutImagePath: optionalImagePath,
    aboutImageAlt: optionalText(CONTENT_LIMITS.aboutImageAlt),
  })
  .superRefine((value, context) => {
    if (value.aboutImagePath && !value.aboutImageAlt) {
      context.addIssue({
        code: "custom",
        message: "Descreva a imagem.",
        path: ["aboutImageAlt"],
      });
    }
  });

export const howSectionSchema = z.object({
  version: sectionVersion,
  howItWorks: howItWorksSchema,
});

export const contactSectionSchema = z.object({
  version: sectionVersion,
  whatsappNumber: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .max(
          CONTENT_LIMITS.whatsappNumber,
          `Use no máximo ${CONTENT_LIMITS.whatsappNumber} caracteres.`,
        )
        .regex(/^[0-9]*$/, "Use só os dígitos, com DDI.")
        .transform((value) => (value === "" ? null : value)),
    ),
  whatsappMessage: z.string().trim().max(CONTENT_LIMITS.whatsappMessage),
  contactEmail: optionalText(CONTENT_LIMITS.contactEmail).refine(
    (value) => value === null || z.email().safeParse(value).success,
    "Informe um e-mail válido.",
  ),
  addressText: optionalText(CONTENT_LIMITS.addressText),
  serviceAreaText: optionalText(CONTENT_LIMITS.serviceAreaText),
});

export const searchSectionSchema = z.object({
  version: sectionVersion,
  instagramHandle: z
    .string()
    .trim()
    .max(CONTENT_LIMITS.instagramHandle)
    .refine((value) => !value.includes("@"), "Não inclua o @.")
    .transform((value) => (value === "" ? null : value)),
  supportEmail: optionalText(CONTENT_LIMITS.supportEmail).refine(
    (value) => value === null || z.email().safeParse(value).success,
    "Informe um e-mail válido.",
  ),
  seoTitle: z.string().trim().max(CONTENT_LIMITS.seoTitle),
  seoDescription: z.string().trim().max(CONTENT_LIMITS.seoDescription),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
export type HeroSectionInput = z.infer<typeof heroSectionSchema>;
export type AboutSectionInput = z.infer<typeof aboutSectionSchema>;
export type HowSectionInput = z.infer<typeof howSectionSchema>;
export type ContactSectionInput = z.infer<typeof contactSectionSchema>;
export type SearchSectionInput = z.infer<typeof searchSectionSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type TestimonialInput = z.infer<typeof testimonialSchema>;
export type FaqInput = z.infer<typeof faqSchema>;

export function fieldError(error: z.ZodError, field: string): string | null {
  return error.issues.find((issue) => issue.path[0] === field)?.message ?? null;
}
