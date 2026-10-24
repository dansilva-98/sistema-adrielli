import "server-only";

import { cacheTag } from "next/cache";
import { connection } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { sql } from "@/db/client";
import {
  CONTENT_FAQ_TAG,
  CONTENT_SERVICES_TAG,
  CONTENT_SITE_TAG,
  CONTENT_TESTIMONIALS_TAG,
  EMPTY_PUBLIC_SITE,
  loadPublishedFaq,
  loadPublishedServiceBySlug,
  loadPublishedServices,
  loadPublishedTestimonials,
  loadPublicSite,
  readOrEmpty,
  type PublicFaq,
  type PublicService,
  type PublicSite,
  type PublicTestimonial,
} from "@/modules/content/queries";

function reportReadFailure(error: unknown) {
  Sentry.captureException(error);
}

export async function getPublicSite(): Promise<PublicSite> {
  "use cache";
  cacheTag(CONTENT_SITE_TAG);
  return readOrEmpty(() => loadPublicSite(sql), EMPTY_PUBLIC_SITE, reportReadFailure);
}

export async function getPublishedServices(): Promise<PublicService[]> {
  "use cache";
  cacheTag(CONTENT_SERVICES_TAG);
  return readOrEmpty(() => loadPublishedServices(sql), [], reportReadFailure);
}

export async function getPublishedService(slug: string): Promise<PublicService | null> {
  "use cache";
  cacheTag(CONTENT_SERVICES_TAG, `content-service:${slug}`);
  return readOrEmpty(
    () => loadPublishedServiceBySlug(sql, slug),
    null,
    reportReadFailure,
  );
}

export async function getPublishedTestimonials(): Promise<PublicTestimonial[]> {
  "use cache";
  cacheTag(CONTENT_TESTIMONIALS_TAG);
  return readOrEmpty(() => loadPublishedTestimonials(sql), [], reportReadFailure);
}

export async function getPublishedFaq(): Promise<PublicFaq[]> {
  "use cache";
  cacheTag(CONTENT_FAQ_TAG);
  return readOrEmpty(() => loadPublishedFaq(sql), [], reportReadFailure);
}

async function duringRequest<T>(read: () => Promise<T>): Promise<T> {
  await connection();
  return read();
}

export function readPublicSite(): Promise<PublicSite> {
  return duringRequest(getPublicSite);
}

export function readPublishedServices(): Promise<PublicService[]> {
  return duringRequest(getPublishedServices);
}

export function readPublishedTestimonials(): Promise<PublicTestimonial[]> {
  return duringRequest(getPublishedTestimonials);
}

export function readPublishedFaq(): Promise<PublicFaq[]> {
  return duringRequest(getPublishedFaq);
}
