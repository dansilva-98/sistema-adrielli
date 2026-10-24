import { ContactBlock } from "@/app/(public)/contact-block";
import { hasContact } from "@/modules/content/home-sections";
import { getPublicSite } from "@/modules/content/server/public";

export default async function ContatoPage() {
  const site = await getPublicSite();
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
