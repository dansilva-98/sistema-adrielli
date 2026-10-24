import type { Metadata } from "next";
import { Suspense } from "react";

import { SitePhoto } from "@/app/(public)/site-photo";
import { publicPageMetadata } from "@/modules/content/indexing";
import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import { readPublicSite } from "@/modules/content/server/public";

export async function generateMetadata(): Promise<Metadata> {
  const site = await readPublicSite();
  return publicPageMetadata({
    pageName: "Sobre",
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    path: "/sobre",
  });
}

export default function SobrePage() {
  return (
    <Suspense fallback={null}>
      <SobreContent />
    </Suspense>
  );
}

async function SobreContent() {
  const site = await readPublicSite();
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
