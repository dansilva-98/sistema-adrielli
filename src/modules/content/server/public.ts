import "server-only";

import { cacheTag } from "next/cache";
import { connection } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { abandonRuntimeConnection, sql } from "@/db/client";
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
import {
  loadPublicHome,
  PUBLIC_READ_TIMEOUT_MS,
  withPublicReadTimeout,
} from "@/modules/content/public-read";

function reportReadFailure(error: unknown) {
  Sentry.captureException(error);
}

function timed<T>(load: () => Promise<T>): Promise<T> {
  return withPublicReadTimeout(load, PUBLIC_READ_TIMEOUT_MS, abandonRuntimeConnection);
}

async function cachedPublicSite(): Promise<PublicSite> {
  "use cache";
  cacheTag(CONTENT_SITE_TAG);
  return loadPublicSite(sql);
}

async function cachedPublishedServices(): Promise<PublicService[]> {
  "use cache";
  cacheTag(CONTENT_SERVICES_TAG);
  return loadPublishedServices(sql);
}

async function cachedPublishedService(slug: string): Promise<PublicService | null> {
  "use cache";
  cacheTag(CONTENT_SERVICES_TAG, `content-service:${slug}`);
  return loadPublishedServiceBySlug(sql, slug);
}

async function cachedPublishedTestimonials(): Promise<PublicTestimonial[]> {
  "use cache";
  cacheTag(CONTENT_TESTIMONIALS_TAG);
  return loadPublishedTestimonials(sql);
}

async function cachedPublishedFaq(): Promise<PublicFaq[]> {
  "use cache";
  cacheTag(CONTENT_FAQ_TAG);
  return loadPublishedFaq(sql);
}

export function getPublicSite(): Promise<PublicSite> {
  return readOrEmpty(() => timed(cachedPublicSite), EMPTY_PUBLIC_SITE, reportReadFailure);
}

export function getPublishedServices(): Promise<PublicService[]> {
  return readOrEmpty(() => timed(cachedPublishedServices), [], reportReadFailure);
}

export function getPublishedService(slug: string): Promise<PublicService | null> {
  return readOrEmpty(
    () => timed(() => cachedPublishedService(slug)),
    null,
    reportReadFailure,
  );
}

export function getPublishedTestimonials(): Promise<PublicTestimonial[]> {
  return readOrEmpty(() => timed(cachedPublishedTestimonials), [], reportReadFailure);
}

export function getPublishedFaq(): Promise<PublicFaq[]> {
  return readOrEmpty(() => timed(cachedPublishedFaq), [], reportReadFailure);
}

export async function loadTimedPublicHome(): Promise<{
  site: PublicSite;
  services: PublicService[];
  testimonials: PublicTestimonial[];
  faq: PublicFaq[];
}> {
  await connection();
  return loadPublicHome(
    {
      site: cachedPublicSite,
      services: cachedPublishedServices,
      testimonials: cachedPublishedTestimonials,
      faq: cachedPublishedFaq,
    },
    reportReadFailure,
    PUBLIC_READ_TIMEOUT_MS,
    abandonRuntimeConnection,
  );
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
