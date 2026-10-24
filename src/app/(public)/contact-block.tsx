import type { PublicSite } from "@/modules/content/queries";

export function ContactBlock({
  site,
  prominent = false,
}: {
  site: PublicSite;
  prominent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {site.whatsappUrl ? (
        <a
          href={site.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            prominent
              ? "inline-flex w-fit rounded-lg bg-primary px-4 py-3 text-base text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
              : "w-fit text-sm underline-offset-4 hover:underline focus-visible:outline-2"
          }
        >
          Agendar avaliação
        </a>
      ) : null}
      {site.instagramUrl ? (
        <p className="text-sm">
          Instagram{" "}
          <a
            href={site.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:underline focus-visible:outline-2"
          >
            {site.instagramHandle}
          </a>
        </p>
      ) : null}
      {site.contactEmail ? (
        <div className="text-sm">
          <p>{site.contactEmail}</p>
          <a
            href={`mailto:${site.contactEmail}`}
            className="underline-offset-4 hover:underline focus-visible:outline-2"
          >
            Enviar e-mail
          </a>
        </div>
      ) : null}
      {site.addressText ? (
        <div className="text-sm">
          <p>{site.addressText}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.addressText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:underline focus-visible:outline-2"
          >
            Ver no mapa
          </a>
        </div>
      ) : null}
      {site.serviceAreaText ? <p className="text-sm">{site.serviceAreaText}</p> : null}
    </div>
  );
}
