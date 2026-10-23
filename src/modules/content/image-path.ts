export const SITE_IMAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isSiteImagePath(path: string): boolean {
  return SITE_IMAGE_PATH.test(path);
}
