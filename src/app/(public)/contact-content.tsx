import { MapsLink } from "@/components/maps-link";
import { StepTrack } from "@/components/step-track";
import { hasHowItWorks, howItWorksSteps } from "@/modules/content/home-sections";
import type { PublicSite } from "@/modules/content/queries";

const cardLinkClass =
  "inline-flex min-h-11 w-fit items-center text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2";

export function ContactContent({ site }: { site: PublicSite }) {
  const address = site.addressText?.trim() ?? "";
  const cards = contactCards(site);
  const empty = cards.length === 0 && !address;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-5">
        <h1 className="max-w-[18ch] font-serif text-4xl text-balance sm:text-5xl">
          Vamos conversar sobre seu filho?
        </h1>
        {site.whatsappUrl ? (
          <a
            href={site.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center rounded-lg bg-support px-4 text-support-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Agendar avaliação pelo WhatsApp
          </a>
        ) : null}
      </section>
      {empty ? <p>Nenhum contato publicado.</p> : null}
      {cards.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.title}
              className="flex flex-col gap-3 rounded-lg border border-line bg-popover p-5"
            >
              <h2 className="font-serif text-2xl">{card.title}</h2>
              {card.detail ? <p className="text-muted">{card.detail}</p> : null}
              <a
                href={card.href}
                target={card.external ? "_blank" : undefined}
                rel={card.external ? "noopener noreferrer" : undefined}
                className={cardLinkClass}
              >
                {card.action}
              </a>
            </article>
          ))}
        </section>
      ) : null}
      {address ? (
        <section className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p>{address}</p>
          <MapsLink address={address} />
        </section>
      ) : null}
      {hasHowItWorks(site) ? (
        <section className="flex flex-col gap-4">
          <h2 id="depois-da-mensagem" className="font-serif text-3xl sm:text-5xl">
            Depois da sua mensagem
          </h2>
          <p className="font-sans text-sm text-muted">Você está aqui</p>
          <StepTrack
            variant="static"
            steps={howItWorksSteps(site)}
            currentIndex={0}
            labelledBy="depois-da-mensagem"
          />
        </section>
      ) : null}
    </div>
  );
}

function contactCards(site: PublicSite): {
  title: string;
  detail?: string;
  href: string;
  action: string;
  external: boolean;
}[] {
  const cards = [];
  if (site.whatsappUrl) {
    cards.push({
      title: "WhatsApp",
      href: site.whatsappUrl,
      action: "Abrir conversa",
      external: true,
    });
  }
  if (site.instagramUrl) {
    cards.push({
      title: "Instagram",
      detail: site.instagramHandle ?? undefined,
      href: site.instagramUrl,
      action: "Ver perfil",
      external: true,
    });
  }
  if (site.contactEmail) {
    cards.push({
      title: "E-mail",
      detail: site.contactEmail,
      href: `mailto:${site.contactEmail}`,
      action: "Enviar e-mail",
      external: false,
    });
  }
  return cards;
}
