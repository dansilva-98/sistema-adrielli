import type { Metadata } from "next";
import { Suspense } from "react";

import { ContactContent } from "@/app/(public)/contact-content";
import { publicPageMetadata } from "@/modules/content/indexing";
import { readPublicSite } from "@/modules/content/server/public";

export async function generateMetadata(): Promise<Metadata> {
  const site = await readPublicSite();
  return publicPageMetadata({
    pageName: "Contato",
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    path: "/contato",
  });
}

export default function ContatoPage() {
  return (
    <Suspense fallback={null}>
      <ContatoBody />
    </Suspense>
  );
}

async function ContatoBody() {
  const site = await readPublicSite();
  return <ContactContent site={site} />;
}
