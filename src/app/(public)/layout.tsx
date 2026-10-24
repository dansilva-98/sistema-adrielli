import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getPublicSite } from "@/modules/content/server/public";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const site = await getPublicSite();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <PublicFooter site={site} />
    </div>
  );
}
