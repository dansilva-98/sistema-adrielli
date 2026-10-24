import Link from "next/link";

import { getPublicSite } from "@/modules/content/server/public";

export default async function MateriaisPage() {
  const site = await getPublicSite();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-4xl">Materiais</h1>
      <p>Em breve.</p>
      {site.whatsappUrl ? (
        <a
          href={site.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit rounded-lg bg-primary px-4 py-3 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Agendar avaliação
        </a>
      ) : (
        <Link href="/contato" className="w-fit underline-offset-4 hover:underline">
          Ir para o contato
        </Link>
      )}
    </div>
  );
}
