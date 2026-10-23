export function sameOrigin(origin: string | null, siteUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}
