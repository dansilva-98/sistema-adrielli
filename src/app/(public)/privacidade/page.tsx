import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { publicPageMetadata } from "@/modules/content/indexing";
import { privacyContent } from "@/modules/content/privacy";
import { getPublicSite } from "@/modules/content/server/public";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const site = await getPublicSite();
  return publicPageMetadata({
    pageName: "Privacidade",
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    path: "/privacidade",
  });
}

export default function PrivacidadePage() {
  return (
    <Suspense fallback={null}>
      <PrivacidadeContent />
    </Suspense>
  );
}

async function PrivacidadeContent() {
  await connection();
  const site = await getPublicSite();
  const content = privacyContent(site.contactEmail);
  return (
    <article className="flex flex-col gap-4">
      <h1 className="font-serif text-4xl">{content.title}</h1>
      <p>{content.draftNotice}</p>
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-2xl">Responsável</h2>
        <p>{content.responsible}</p>
        <p>{content.contactLine}</p>
        {content.contactEmail ? (
          <a className="w-fit hover:underline" href={`mailto:${content.contactEmail}`}>
            {content.contactEmail}
          </a>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-2xl">O que este site não coleta</h2>
        <p>{content.noCollection}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-2xl">Registros técnicos</h2>
        <p>{content.technicalLogs}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-2xl">Registros de acesso</h2>
        <p>{content.accessLogs}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-2xl">Direitos de quem é titular</h2>
        <p>{content.rightsIntro}</p>
        <ul className="list-disc pl-5">
          {content.rights.map((right) => (
            <li key={right}>{right}</li>
          ))}
        </ul>
        <p>{content.rightsExercise}</p>
        <p>{content.anpd}</p>
      </section>
      <p>{content.updated}</p>
    </article>
  );
}
