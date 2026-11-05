import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { EMPTY_PUBLIC_SITE } from "@/modules/content/queries";

const navigation = vi.hoisted(() => ({ pathname: "/sobre" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const whatsappUrl = "https://wa.me/5511999999999?text=Ol%C3%A1";

describe("cabeçalho público", () => {
  it("mostra Início como primeiro link e o menu até lg", () => {
    navigation.pathname = "/sobre";
    const withoutCta = renderToStaticMarkup(createElement(PublicHeader));
    const nav = withoutCta.slice(withoutCta.indexOf('aria-label="Principal"'));
    expect(nav.indexOf(">Início<")).toBeGreaterThan(-1);
    expect(nav.indexOf(">Início<")).toBeLessThan(nav.indexOf(">Sobre<"));
    expect(withoutCta).toContain("/brand/logo-horizontal-subtitulo.svg");
    expect(withoutCta).toContain(
      'alt="Adrielli Flores, psicopedagoga e neuropsicopedagoga"',
    );
    expect(withoutCta).toContain("h-11 w-auto lg:h-14");
    expect(withoutCta).toContain("lg:hidden");
    expect(withoutCta).not.toContain("md:hidden");
    expect(withoutCta).toContain("text-[0.9375rem]");
    expect(withoutCta).toContain("min-h-11");
    expect(withoutCta).toContain("border-t pt-2");
    expect(withoutCta).toContain("Sobre");
    expect(withoutCta).toContain("Serviços");
    expect(withoutCta).toContain("Materiais");
    expect(withoutCta).toContain("Contato");
    expect(withoutCta).not.toContain("Agendar avaliação");
    expect(withoutCta).toContain('aria-label="Abrir menu"');
    expect(withoutCta).toContain("size-11");
    expect(withoutCta).toContain('aria-current="page"');
    expect(withoutCta).toContain("decoration-gold");
    expect(withoutCta).toContain("decoration-2");

    const withCta = renderToStaticMarkup(createElement(PublicHeader, { whatsappUrl }));
    expect(withCta).toContain("Agendar avaliação");
    expect(withCta).toContain("mt-2");
    expect(withCta).toContain(`href="${whatsappUrl}"`);
  });

  it("marca Início com aria-current na home", () => {
    navigation.pathname = "/";
    const home = renderToStaticMarkup(createElement(PublicHeader));
    const inicio = home.match(/<a[^>]*>Início<\/a>/)?.[0];
    expect(inicio).toContain('href="/"');
    expect(inicio).toContain('aria-current="page"');
    expect(inicio).toContain("decoration-gold");
  });
});

describe("rodapé público", () => {
  it("mostra o título, o logo claro e a privacidade, e o WhatsApp só com número", () => {
    const empty = renderToStaticMarkup(
      createElement(PublicFooter, { site: EMPTY_PUBLIC_SITE }),
    );
    expect(empty).toContain("A etapa 1 começa com uma mensagem.");
    expect(empty).toContain("max-w-[18ch]");
    expect(empty).toContain("pt-12");
    expect(empty).toContain("pb-[calc(6rem+env(safe-area-inset-bottom))]");
    expect(empty).toContain("lg:pb-10");
    expect(empty).toContain("md:grid-cols-[minmax(0,1fr)_auto]");
    expect(empty).toContain("/brand/logo-horizontal-claro.svg");
    expect(empty).toContain("h-10 w-auto md:h-12");
    expect(empty).toContain("Privacidade");
    expect(empty).toContain('aria-label="Rodapé"');
    expect(empty).toContain("bg-text");
    expect(empty).toContain("border-gold-light/20");
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
    expect(filled).toContain("px-5");
    expect(filled).toContain("font-medium");
    expect(filled).toContain("bg-gold-light");
    expect(filled).toContain("text-text");
    expect(filled).toContain("Instagram");
    expect(filled).toContain('href="https://instagram.com/adrielli"');
    const instagram = filled.indexOf(">Instagram<");
    const privacy = filled.indexOf(">Privacidade<");
    expect(instagram).toBeGreaterThan(-1);
    expect(instagram).toBeLessThan(privacy);
  });
});
