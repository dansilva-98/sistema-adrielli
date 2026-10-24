import { clientEnv } from "@/lib/env-client";
import { sitePublicImageUrl } from "@/modules/content/image-path";

export function SitePhoto({
  path,
  alt,
  priority = false,
}: {
  path: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sitePublicImageUrl(clientEnv.NEXT_PUBLIC_SUPABASE_URL, path)}
      alt={alt}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className="h-auto max-h-[32rem] w-full rounded-lg object-cover"
    />
  );
}
