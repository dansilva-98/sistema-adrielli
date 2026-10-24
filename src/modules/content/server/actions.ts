"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";

import { sql } from "@/db/client";
import { serverEnv } from "@/lib/env.server";
import { clientEnv } from "@/lib/env-client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { clientIp } from "@/modules/identity/staff-session";
import { prepareSiteImage, SiteImageError } from "@/modules/content/image";
import {
  CONTENT_FAQ_TAG,
  CONTENT_SERVICES_TAG,
  CONTENT_SITE_TAG,
  CONTENT_TESTIMONIALS_TAG,
} from "@/modules/content/queries";
import {
  aboutSectionSchema,
  contactSectionSchema,
  faqSchema,
  heroSectionSchema,
  howSectionSchema,
  isSiteSection,
  searchSectionSchema,
  serviceSchema,
  siteSettingsSchema,
  testimonialSchema,
  type SiteSection,
} from "@/modules/content/schema";
import { slugFromTitle } from "@/modules/content/slug";
import { removeSiteObject, uploadSiteObject } from "@/modules/content/storage";
import {
  CONTENT_CONFLICT_MESSAGE,
  CONTENT_SLUG_MESSAGE,
  ContentWriteError,
  createFaq,
  createService,
  createTestimonial,
  deleteContent,
  moveContent,
  saveSiteSection,
  saveSiteSettings,
  updateFaq,
  updateService,
  updateTestimonial,
} from "@/modules/content/write";

type ContentFormState =
  | { ok: true; id?: string; path?: string; version?: number }
  | { ok: false; message: string; field?: string; fields?: Record<string, string> };

const storage = {
  supabaseUrl: clientEnv.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
};

export async function saveSiteSettingsAction(
  formData: FormData,
): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const parsed = siteSettingsSchema.safeParse(readSite(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const saved = await saveSiteSettings(
      sql,
      parsed.data,
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_SITE_TAG);
    await forgetImages(saved.removedPaths);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSiteSectionAction(
  _state: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const section = text(formData, "section");
  if (!isSiteSection(section)) return invalid("Confira os dados e tente novamente.");
  const image = await sectionImage(formData, section);
  if (!image.ok) return image.state;
  const parsed = parseSection(section, formData, image.path);
  if (!parsed.ok) return parsed.state;
  try {
    const saved = await saveSiteSection(
      sql,
      section,
      parsed.data,
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_SITE_TAG);
    await forgetImages(saved.removedPaths);
    return {
      ok: true,
      version: saved.version,
      ...(section === "hero" || section === "about" ? { path: image.path } : {}),
    };
  } catch (error) {
    return failure(error);
  }
}

function parseSection(section: SiteSection, formData: FormData, imagePath: string) {
  const version = numberValue(formData, "version");
  const parsed =
    section === "hero"
      ? heroSectionSchema.safeParse({
          version,
          heroTitle: text(formData, "heroTitle"),
          heroSubtitle: text(formData, "heroSubtitle"),
          heroTagline: text(formData, "heroTagline"),
          heroImagePath: imagePath,
          heroImageAlt: text(formData, "heroImageAlt"),
        })
      : section === "about"
        ? aboutSectionSchema.safeParse({
            version,
            aboutTitle: text(formData, "aboutTitle"),
            aboutBody: text(formData, "aboutBody"),
            aboutImagePath: imagePath,
            aboutImageAlt: text(formData, "aboutImageAlt"),
          })
        : section === "how"
          ? howSectionSchema.safeParse({
              version,
              howItWorks: jsonValue(formData, "howItWorks"),
            })
          : section === "contact"
            ? contactSectionSchema.safeParse({
                version,
                whatsappNumber: text(formData, "whatsappNumber"),
                whatsappMessage: text(formData, "whatsappMessage"),
                contactEmail: text(formData, "contactEmail"),
                addressText: text(formData, "addressText"),
                serviceAreaText: text(formData, "serviceAreaText"),
              })
            : searchSectionSchema.safeParse({
                version,
                instagramHandle: text(formData, "instagramHandle"),
                supportEmail: text(formData, "supportEmail"),
                seoTitle: text(formData, "seoTitle"),
                seoDescription: text(formData, "seoDescription"),
              });
  if (!parsed.success) {
    const fields = fieldMap(parsed.error.issues);
    const first = parsed.error.issues[0];
    return {
      ok: false as const,
      state: invalid(
        first?.message,
        typeof first?.path[0] === "string" ? first.path[0] : undefined,
        fields,
      ),
    };
  }
  return { ok: true as const, data: parsed.data };
}

async function sectionImage(
  formData: FormData,
  section: SiteSection,
): Promise<{ ok: true; path: string } | { ok: false; state: ContentFormState }> {
  if (section !== "hero" && section !== "about") return { ok: true, path: "" };
  const pathName = section === "hero" ? "heroImagePath" : "aboutImagePath";
  const altName = section === "hero" ? "heroImageAlt" : "aboutImageAlt";
  if (formData.get("removeImage") === "true") return { ok: true, path: "" };
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0)
    return { ok: true, path: text(formData, pathName) };
  if (!text(formData, altName)) {
    return {
      ok: false,
      state: invalid("Descreva a imagem.", altName, { [altName]: "Descreva a imagem." }),
    };
  }
  try {
    const webp = await prepareSiteImage(new Uint8Array(await file.arrayBuffer()));
    return { ok: true, path: await uploadSiteObject(storage, webp) };
  } catch (error) {
    if (error instanceof SiteImageError) {
      const message =
        error.code === "size"
          ? "A imagem precisa ter no máximo 4 MB."
          : "Envie um JPEG, PNG ou WebP.";
      return { ok: false, state: invalid(message, "image", { image: message }) };
    }
    Sentry.captureException(error);
    return {
      ok: false,
      state: invalid("Não foi possível guardar a imagem.", "image", {
        image: "Não foi possível guardar a imagem.",
      }),
    };
  }
}

function fieldMap(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const head = issue.path[0];
    const key =
      head === "howItWorks" && typeof issue.path[1] === "number"
        ? `howItWorks.${issue.path[1]}.${String(issue.path[2] ?? "title")}`
        : typeof head === "string"
          ? head
          : "";
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createServiceAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const parsed = serviceSchema.safeParse(readService(formData));
  if (!parsed.success)
    return invalid(parsed.error.issues[0]?.message, fieldOf(parsed.error));
  try {
    const id = await createService(sql, parsed.data, await actorContext(actor.userId));
    updateTag(CONTENT_SERVICES_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateServiceAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  const parsed = serviceSchema.safeParse(readService(formData));
  if (!id || !parsed.success || !parsed.data.version)
    return invalid("Confira os dados e tente novamente.");
  try {
    const saved = await updateService(
      sql,
      id,
      { ...parsed.data, version: parsed.data.version },
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_SERVICES_TAG);
    updateTag(`content-service:${parsed.data.slug}`);
    await forgetImages(saved.removedPaths);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function createTestimonialAction(
  formData: FormData,
): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const parsed = testimonialSchema.safeParse(readTestimonial(formData));
  if (!parsed.success)
    return invalid(parsed.error.issues[0]?.message, fieldOf(parsed.error));
  try {
    const id = await createTestimonial(
      sql,
      parsed.data,
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_TESTIMONIALS_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function createFaqAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const parsed = faqSchema.safeParse(readFaq(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const id = await createFaq(sql, parsed.data, await actorContext(actor.userId));
    updateTag(CONTENT_FAQ_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadSiteImageAction(
  formData: FormData,
): Promise<ContentFormState> {
  await requireStaff({ roles: ADMIN_ROLES });
  const file = formData.get("file");
  const alt = text(formData, "alt");
  if (!(file instanceof File) || file.size === 0) return invalid("Escolha uma imagem.");
  if (!alt) return invalid("Descreva a imagem.", "alt");
  try {
    const webp = await prepareSiteImage(new Uint8Array(await file.arrayBuffer()));
    const path = await uploadSiteObject(storage, webp);
    return { ok: true, path };
  } catch (error) {
    if (error instanceof SiteImageError) {
      return invalid(
        error.code === "size"
          ? "A imagem precisa ter no máximo 4 MB."
          : "Envie um JPEG, PNG ou WebP.",
      );
    }
    Sentry.captureException(error);
    return invalid("Não foi possível guardar a imagem.");
  }
}

function readSite(formData: FormData) {
  return {
    version: numberValue(formData, "version"),
    heroTitle: text(formData, "heroTitle"),
    heroSubtitle: text(formData, "heroSubtitle"),
    heroTagline: text(formData, "heroTagline"),
    heroImagePath: text(formData, "heroImagePath"),
    heroImageAlt: text(formData, "heroImageAlt"),
    aboutTitle: text(formData, "aboutTitle"),
    aboutBody: text(formData, "aboutBody"),
    aboutImagePath: text(formData, "aboutImagePath"),
    aboutImageAlt: text(formData, "aboutImageAlt"),
    howItWorks: jsonValue(formData, "howItWorks"),
    whatsappNumber: text(formData, "whatsappNumber"),
    whatsappMessage: text(formData, "whatsappMessage"),
    instagramHandle: text(formData, "instagramHandle"),
    contactEmail: text(formData, "contactEmail"),
    supportEmail: text(formData, "supportEmail"),
    addressText: text(formData, "addressText"),
    serviceAreaText: text(formData, "serviceAreaText"),
    seoTitle: text(formData, "seoTitle"),
    seoDescription: text(formData, "seoDescription"),
  };
}

function readService(formData: FormData) {
  const title = text(formData, "title");
  const slug = text(formData, "slug").trim();
  return {
    title,
    slug: slug || slugFromTitle(title),
    summary: text(formData, "summary"),
    body: text(formData, "body"),
    imagePath: text(formData, "imagePath"),
    imageAlt: text(formData, "imageAlt"),
    published: formData.get("published") === "true",
    version: numberValue(formData, "version"),
  };
}

function readTestimonial(formData: FormData) {
  const consent = text(formData, "consentAt");
  return {
    quote: text(formData, "quote"),
    authorLabel: text(formData, "authorLabel"),
    consentAt: consent || null,
    published: formData.get("published") === "true",
    version: numberValue(formData, "version"),
  };
}

function readFaq(formData: FormData) {
  return {
    question: text(formData, "question"),
    answer: text(formData, "answer"),
    published: formData.get("published") === "true",
    version: numberValue(formData, "version"),
  };
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function numberValue(formData: FormData, name: string): number {
  return Number(text(formData, name));
}

function jsonValue(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(text(formData, name) || "[]");
  } catch {
    return [];
  }
}

async function actorContext(actorId: string) {
  const headerStore = await headers();
  return { actorId, ip: clientIp(headerStore.get("x-forwarded-for")) };
}

function invalid(
  message = "Confira os dados e tente novamente.",
  field?: string,
  fields?: Record<string, string>,
): ContentFormState {
  return { ok: false, message, field, fields };
}

function fieldOf(error: { issues: { path: PropertyKey[] }[] }): string | undefined {
  const field = error.issues[0]?.path[0];
  return typeof field === "string" ? field : undefined;
}

function failure(error: unknown): ContentFormState {
  if (error instanceof ContentWriteError && error.code === "conflict") {
    return { ok: false, message: CONTENT_CONFLICT_MESSAGE };
  }
  if (error instanceof ContentWriteError && error.code === "slug") {
    return { ok: false, message: CONTENT_SLUG_MESSAGE, field: "slug" };
  }
  if (error instanceof ContentWriteError && error.code === "missing") {
    return { ok: false, message: "Não foi possível carregar o conteúdo." };
  }
  Sentry.captureException(error);
  return invalid("Não foi possível salvar. Tente novamente.");
}

async function forgetImages(paths: string[]) {
  for (const path of paths) {
    try {
      await removeSiteObject(storage, path);
    } catch (error) {
      Sentry.captureException(error);
    }
  }
}

export async function deleteServiceAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  if (!id) return invalid();
  try {
    const saved = await deleteContent(
      sql,
      "services",
      id,
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_SERVICES_TAG);
    await forgetImages(saved.removedPaths);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function moveServiceAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  const direction = text(formData, "direction");
  const version = numberValue(formData, "version");
  if (!id || (direction !== "up" && direction !== "down")) return invalid();
  try {
    await moveContent(
      sql,
      "services",
      id,
      version,
      direction,
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_SERVICES_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateTestimonialAction(
  formData: FormData,
): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  const parsed = testimonialSchema.safeParse(readTestimonial(formData));
  if (!id || !parsed.success || !parsed.data.version)
    return invalid(parsed.success ? undefined : parsed.error.issues[0]?.message);
  try {
    await updateTestimonial(
      sql,
      id,
      { ...parsed.data, version: parsed.data.version },
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_TESTIMONIALS_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTestimonialAction(
  formData: FormData,
): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  if (!id) return invalid();
  try {
    await deleteContent(sql, "testimonials", id, await actorContext(actor.userId));
    updateTag(CONTENT_TESTIMONIALS_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function moveTestimonialAction(
  formData: FormData,
): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  const direction = text(formData, "direction");
  const version = numberValue(formData, "version");
  if (!id || (direction !== "up" && direction !== "down")) return invalid();
  try {
    await moveContent(
      sql,
      "testimonials",
      id,
      version,
      direction,
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_TESTIMONIALS_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateFaqAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  const parsed = faqSchema.safeParse(readFaq(formData));
  if (!id || !parsed.success || !parsed.data.version) return invalid();
  try {
    await updateFaq(
      sql,
      id,
      { ...parsed.data, version: parsed.data.version },
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_FAQ_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteFaqAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  if (!id) return invalid();
  try {
    await deleteContent(sql, "faq", id, await actorContext(actor.userId));
    updateTag(CONTENT_FAQ_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function moveFaqAction(formData: FormData): Promise<ContentFormState> {
  const actor = await requireStaff({ roles: ADMIN_ROLES });
  const id = text(formData, "id");
  const direction = text(formData, "direction");
  const version = numberValue(formData, "version");
  if (!id || (direction !== "up" && direction !== "down")) return invalid();
  try {
    await moveContent(
      sql,
      "faq",
      id,
      version,
      direction,
      await actorContext(actor.userId),
    );
    updateTag(CONTENT_FAQ_TAG);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}
