export const SITE_IMAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isSiteImagePath(path: string): boolean {
  return SITE_IMAGE_PATH.test(path);
}

export function sitePublicImageUrl(origin: string, path: string): string {
  return new URL(`/storage/v1/object/public/site-public/${path}`, origin).href;
}
