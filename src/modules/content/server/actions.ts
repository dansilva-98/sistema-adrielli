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
  faqSchema,
  serviceSchema,
  siteSettingsSchema,
  testimonialSchema,
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
  saveSiteSettings,
  updateFaq,
  updateService,
  updateTestimonial,
} from "@/modules/content/write";

type ContentFormState =
  | { ok: true; id?: string; path?: string }
  | { ok: false; message: string; field?: string };

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
): ContentFormState {
  return { ok: false, message, field };
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
