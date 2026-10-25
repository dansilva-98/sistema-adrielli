import {
  EMPTY_PUBLIC_SITE,
  readOrEmpty,
  type PublicFaq,
  type PublicService,
  type PublicSite,
  type PublicTestimonial,
} from "@/modules/content/queries";

export const PUBLIC_READ_TIMEOUT_MS = 5_000;

export class PublicReadTimeoutError extends Error {
  constructor() {
    super("A leitura pública excedeu o tempo.");
    this.name = "PublicReadTimeoutError";
  }
}

export function withPublicReadTimeout<T>(
  load: () => Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  const pending = load();
  let settled = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      pending.catch(() => undefined);
      onTimeout();
      reject(new PublicReadTimeoutError());
    }, timeoutMs);
    pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type PublicHomeQueries = {
  site: () => Promise<PublicSite>;
  services: () => Promise<PublicService[]>;
  testimonials: () => Promise<PublicTestimonial[]>;
  faq: () => Promise<PublicFaq[]>;
};

export async function loadPublicHome(
  queries: PublicHomeQueries,
  report: (error: unknown) => void,
  timeoutMs = PUBLIC_READ_TIMEOUT_MS,
  onTimeout: () => void = () => undefined,
): Promise<{
  site: PublicSite;
  services: PublicService[];
  testimonials: PublicTestimonial[];
  faq: PublicFaq[];
}> {
  const [site, services, testimonials, faq] = await Promise.all([
    readOrEmpty(
      () => withPublicReadTimeout(queries.site, timeoutMs, onTimeout),
      EMPTY_PUBLIC_SITE,
      report,
    ),
    readOrEmpty(
      () => withPublicReadTimeout(queries.services, timeoutMs, onTimeout),
      [],
      report,
    ),
    readOrEmpty(
      () => withPublicReadTimeout(queries.testimonials, timeoutMs, onTimeout),
      [],
      report,
    ),
    readOrEmpty(
      () => withPublicReadTimeout(queries.faq, timeoutMs, onTimeout),
      [],
      report,
    ),
  ]);
  return { site, services, testimonials, faq };
}
