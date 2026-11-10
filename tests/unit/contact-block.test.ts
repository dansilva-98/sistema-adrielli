import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactContent } from "@/app/(public)/contact-content";
import { EXAMPLE_HOW_IT_WORKS } from "@/db/seed";
import { MAPS_LINK_LABEL, MAPS_LINK_TEXT, mapsSearchUrl } from "@/modules/content/maps";
import { EMPTY_PUBLIC_SITE } from "@/modules/content/queries";

describe("contato público", () => {
  it("mostra o título, os cartões e o Ver no mapa", () => {
    const address = "Rua São João, 100";
    const html = renderToStaticMarkup(
      createElement(ContactContent, {
        site: {
          ...EMPTY_PUBLIC_SITE,
          whatsappUrl: "https://wa.me/5511999999999",
          instagramUrl: "https://instagram.com/adrielliflores",
          instagramHandle: "adrielliflores",
          contactEmail: "contato@example.com",
          addressText: address,
          howItWorks: EXAMPLE_HOW_IT_WORKS,
        },
      }),
    );
    expect(html).toContain("Vamos conversar sobre seu filho?");
    expect(html).toContain("Agendar avaliação pelo WhatsApp");
    expect(html).toContain("bg-support");
    expect(html).toContain("Abrir conversa");
    expect(html).toContain("Ver perfil");
    expect(html).toContain("Enviar e-mail");
    expect(html).toContain(address);
    expect(html).toContain("flex-wrap items-center");
    expect(html).toContain(`href="${mapsSearchUrl(address)?.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(`aria-label="${MAPS_LINK_LABEL}"`);
    expect(html).toContain(MAPS_LINK_TEXT);
    expect(html).toContain("min-h-11");
    expect(html).toContain("Depois da sua mensagem");
    expect(html).toContain("Você está aqui");
    expect(html).toContain("ring-gold-light");
    expect(html.match(/ring-gold-light/g)).toHaveLength(2);
    expect(html.match(/border-2 border-gold bg-surface/g)).toHaveLength(6);
    expect(html).toContain("bg-support px-4");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
  });

  it("esconde o cartão, o endereço e o mapa quando o campo está vazio", () => {
    const html = renderToStaticMarkup(
      createElement(ContactContent, {
        site: { ...EMPTY_PUBLIC_SITE, addressText: "  " },
      }),
    );
    expect(html).toContain("Nenhum contato publicado.");
    expect(html).not.toContain(MAPS_LINK_TEXT);
    expect(html).not.toContain("google.com/maps");
    expect(html).not.toContain("WhatsApp");
    expect(html).not.toContain("Depois da sua mensagem");
  });
});
