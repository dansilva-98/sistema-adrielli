export const TESTIMONIAL_IMAGE_ALT_MAX = 250;

export function testimonialImageAlt(quote: string): string {
  const compact = quote.replace(/\s+/g, " ").trim();
  if (compact.length <= TESTIMONIAL_IMAGE_ALT_MAX) return compact;
  return `${compact.slice(0, TESTIMONIAL_IMAGE_ALT_MAX).trimEnd()}…`;
}
