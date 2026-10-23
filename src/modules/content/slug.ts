import { CONTENT_LIMITS } from "@/db/content-limits";

export function slugFromTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CONTENT_LIMITS.serviceSlug)
    .replace(/-+$/g, "");
}
