import { SitePhoto } from "@/app/(public)/site-photo";
import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import { getPublicSite } from "@/modules/content/server/public";

export default async function SobrePage() {
  const site = await getPublicSite();
  return (
    <article className="flex flex-col gap-4">
      <h1 className="font-serif text-4xl">{site.aboutTitle || "Sobre"}</h1>
      {site.aboutImagePath ? (
        <SitePhoto path={site.aboutImagePath} alt={site.aboutImageAlt ?? ""} />
      ) : null}
      {site.aboutBody ? <RestrictedMarkdown source={site.aboutBody} /> : null}
    </article>
  );
}
