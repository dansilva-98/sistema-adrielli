import { Suspense } from "react";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { readPublicSite } from "@/modules/content/server/public";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={<PublicHeader />}>
        <SiteHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <Suspense fallback={null}>
        <SiteChrome />
      </Suspense>
    </div>
  );
}

async function SiteHeader() {
  const site = await readPublicSite();
  return <PublicHeader whatsappUrl={site.whatsappUrl} />;
}

async function SiteChrome() {
  const site = await readPublicSite();
  return (
    <>
      <PublicFooter site={site} />
      <WhatsAppButton url={site.whatsappUrl} />
    </>
  );
}
