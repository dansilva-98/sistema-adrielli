import type { MetadataRoute } from "next";

import { clientEnv } from "@/lib/env-client";
import { publicSitemap } from "@/modules/content/indexing";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemap(clientEnv.NEXT_PUBLIC_SITE_URL);
}
