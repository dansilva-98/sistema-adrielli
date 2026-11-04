import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { EMPTY_PUBLIC_SITE } from "@/modules/content/queries";

vi.mock("next/navigation", () => ({
  usePathname: () => "/sobre",
}));

const whatsappUrl = "https://wa.me/5511999999999?text=Ol%C3%A1";

describe("cabeçalho público", () => {
  it("mostra o logo nas alturas do L3, os links e o botão só com WhatsApp", () => {
    const withoutCta = renderToStaticMarkup(createElement(PublicHeader));
    expect(withoutCta).toContain("/brand/logo-horizontal-subtitulo.svg");
    expect(withoutCta).toContain("h-11 w-auto md:h-14");
    expect(withoutCta).toContain("Sobre");
    expect(withoutCta).toContain("Serviços");
    expect(withoutCta).toContain("Materiais");
    expect(withoutCta).toContain("Contato");
    expect(withoutCta).not.toContain(">Início<");
    expect(withoutCta).not.toContain("Agendar avaliação");
    expect(withoutCta).toContain('aria-label="Abrir menu"');
    expect(withoutCta).toContain("size-11");
    expect(withoutCta).toContain('aria-current="page"');
    expect(withoutCta).toContain("decoration-gold");
    expect(withoutCta).toContain("decoration-2");

    const withCta = renderToStaticMarkup(createElement(PublicHeader, { whatsappUrl }));
    expect(withCta).toContain("Agendar avaliação");
    expect(withCta).toContain(`href="${whatsappUrl}"`);
  });
});

describe("rodapé público", () => {
  it("mostra o título, o logo claro e a privacidade, e o WhatsApp só com número", () => {
    const empty = renderToStaticMarkup(
      createElement(PublicFooter, { site: EMPTY_PUBLIC_SITE }),
    );
    expect(empty).toContain("A etapa 1 começa com uma mensagem.");
    expect(empty).toContain("/brand/logo-horizontal-claro.svg");
    expect(empty).toContain("Privacidade");
    expect(empty).toContain('aria-label="Rodapé"');
    expect(empty).toContain("bg-text");
    expect(empty).not.toContain("Chamar no WhatsApp");
    expect(empty).not.toContain("Instagram");
    expect(empty).not.toContain("text-gold ");
    expect(empty).not.toContain('text-gold"');

    const filled = renderToStaticMarkup(
      createElement(PublicFooter, {
        site: {
          ...EMPTY_PUBLIC_SITE,
          whatsappUrl,
          instagramUrl: "https://instagram.com/adrielli",
          instagramHandle: "adrielli",
        },
      }),
    );
    expect(filled).toContain("Chamar no WhatsApp");
    expect(filled).toContain("bg-gold-light");
    expect(filled).toContain("text-text");
    expect(filled).toContain("Instagram");
    expect(filled).toContain('href="https://instagram.com/adrielli"');
    expect(filled).toContain("pb-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(filled).toContain("xl:pb-6");
  });
});
