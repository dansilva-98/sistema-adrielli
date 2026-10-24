import type { Metadata } from "next";
import { Suspense } from "react";

import { ContactBlock } from "@/app/(public)/contact-block";
import { hasContact } from "@/modules/content/home-sections";
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
      <ContatoContent />
    </Suspense>
  );
}

async function ContatoContent() {
  const site = await readPublicSite();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-4xl">Contato</h1>
      {hasContact(site) ? (
        <ContactBlock site={site} prominent />
      ) : (
        <p>Nenhum contato publicado.</p>
      )}
    </div>
  );
}
