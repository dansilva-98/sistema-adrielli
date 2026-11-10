import type { Metadata } from "next";
import { Suspense } from "react";

import { AboutContent } from "@/app/(public)/about-content";
import { publicPageMetadata } from "@/modules/content/indexing";
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
  return <AboutContent site={site} />;
}
