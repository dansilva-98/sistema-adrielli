import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeContent } from "@/app/(public)/home-sections";
import { publicPageMetadata } from "@/modules/content/indexing";
import { loadTimedPublicHome, readPublicSite } from "@/modules/content/server/public";

export async function generateMetadata(): Promise<Metadata> {
  const site = await readPublicSite();
  return publicPageMetadata({
    pageName: "Início",
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    path: "/",
  });
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}

async function HomePageContent() {
  const content = await loadTimedPublicHome();
  return <HomeContent {...content} />;
}
