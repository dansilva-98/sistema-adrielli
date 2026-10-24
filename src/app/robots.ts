import type { MetadataRoute } from "next";

import { serverEnv } from "@/lib/env.server";
import { robotsPolicy } from "@/modules/content/indexing";

export default function robots(): MetadataRoute.Robots {
  return robotsPolicy(serverEnv.APP_ENV);
}
