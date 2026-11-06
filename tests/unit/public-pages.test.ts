import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { featuredAboutText, remainingAboutSource } from "@/modules/content/opening";
import {
  EMPTY_PUBLIC_SITE,
  type PublicFaq,
  type PublicService,
  type PublicSite,
  type PublicTestimonial,
} from "@/modules/content/queries";

const service: PublicService = {
  slug: "intervencao",
  title: "Intervenção",
  summary: "Resumo curto.",
  body: "Texto do serviço.",
  imagePath: null,
  imageAlt: null,
};

function clientEnv(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.NEXT_PUBLIC_SENTRY_DSN ||= "https://public@sentry.example/1";
  process.env.NEXT_PUBLIC_SITE_URL ||= "http://127.0.0.1:3000";
}

describe("Sobre", () => {
  it("destaca a primeira parte e esconde Formação sem campo no CMS", async () => {
    clientEnv();
    const { AboutContent } = await import("@/app/(public)/about-content");
    const html = renderToStaticMarkup(
      createElement(AboutContent, {
        site: {
          ...EMPTY_PUBLIC_SITE,
          aboutTitle: "Quem é Adrielli Flores",
          aboutBody: "Primeira frase do texto.\n\nSegundo parágrafo.",
          serviceAreaText: "Fernandópolis-SP",
          whatsappUrl: "https://wa.me/5511999999999",
        },
      }),
    );
    expect(html).toContain("Quem é Adrielli Flores");
    expect(html).toContain("font-serif text-2xl");
    expect(html).toContain("Primeira frase do texto.");
    expect(html).toContain("Segundo parágrafo.");
    expect(html).toContain("max-w-[65ch]");
    expect(html).toContain("Agendar avaliação");
    expect(html).toContain("Onde atua");
    expect(html).toContain("Fernandópolis-SP");
    expect(html).toContain('href="/#como-funciona"');
    expect(html).not.toContain("Formação");
    expect(html).not.toContain("Sobre mim");
  });

  it("destaca só a primeira frase e mantém o restante do mesmo parágrafo", async () => {
    clientEnv();
    const { AboutContent } = await import("@/app/(public)/about-content");
    const html = renderToStaticMarkup(
      createElement(AboutContent, {
        site: {
          ...EMPTY_PUBLIC_SITE,
          aboutTitle: "Sobre",
          aboutBody: "Frase um. Frase dois do mesmo parágrafo.",
        },
      }),
    );
    expect(html).toContain("font-serif text-2xl");
    expect(html).toContain("Frase um.");
    expect(html).toContain("Frase dois do mesmo parágrafo.");
    expect(html.indexOf("Frase um.")).toBeLessThan(
      html.indexOf("Frase dois do mesmo parágrafo."),
    );
  });

  it("não mostra Onde atua sem área cadastrada", async () => {
    clientEnv();
    const { AboutContent } = await import("@/app/(public)/about-content");
    const html = renderToStaticMarkup(
      createElement(AboutContent, {
        site: { ...EMPTY_PUBLIC_SITE, aboutTitle: "Sobre", aboutBody: "Texto." },
      }),
    );
    expect(html).not.toContain("Onde atua");
    expect(html).not.toContain("Agendar avaliação");
  });
});

describe("abertura do Sobre", () => {
  function joinedPlain(source: string): string {
    const featured = featuredAboutText(source);
    const rest = remainingAboutSource(source)
      .split(/\n{2,}/)
      .map((block) => block.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    return [featured, rest].filter(Boolean).join(" ");
  }

  it("separa o destaque do restante pelas linhas em branco", () => {
    expect(featuredAboutText("Primeiro.\n\nSegundo.")).toBe("Primeiro.");
    expect(remainingAboutSource("Primeiro.\n\nSegundo.")).toBe("Segundo.");
    expect(remainingAboutSource("Só um parágrafo.")).toBe("");
  });

  it("trata CRLF como o parser de markdown", () => {
    expect(featuredAboutText("Primeiro.\r\n\r\nSegundo.")).toBe("Primeiro.");
    expect(remainingAboutSource("Primeiro.\r\n\r\nSegundo.")).toBe("Segundo.");
    expect(remainingAboutSource("Primeiro.\r\n\r\nSegundo.\r\n\r\nTerceiro.")).toBe(
      "Segundo.\n\nTerceiro.",
    );
  });

  it("destaca só a primeira frase do primeiro parágrafo", () => {
    expect(featuredAboutText("Frase um. Frase dois.")).toBe("Frase um.");
    expect(remainingAboutSource("Frase um. Frase dois.")).toBe("Frase dois.");
    expect(featuredAboutText("A. B.\n\nC.")).toBe("A.");
    expect(remainingAboutSource("A. B.\n\nC.")).toBe("B.\n\nC.");
    expect(featuredAboutText("Um parágrafo só sem ponto")).toBe(
      "Um parágrafo só sem ponto",
    );
    expect(remainingAboutSource("Um parágrafo só sem ponto")).toBe("");
  });

  it("não perde texto com um ou vários parágrafos", () => {
    const cases = [
      "Só uma frase.",
      "Frase um. Frase dois.",
      "Primeiro.\n\nSegundo.",
      "Primeiro.\r\n\r\nSegundo.\r\n\r\nTerceiro.",
      "A. B.\n\nC. D.",
      "Um parágrafo só sem ponto",
    ];
    for (const source of cases) {
      expect(joinedPlain(source)).toBe(
        source.replaceAll("\r\n", "\n").replace(/\s+/g, " ").trim(),
      );
    }
  });
});

describe("Serviços", () => {
  async function renderServices(props: {
    site: PublicSite;
    services: PublicService[];
    testimonials: PublicTestimonial[];
    faq: PublicFaq[];
  }) {
    clientEnv();
    const mod = await import("@/app/(public)/services-content");
    const ServicesContent = mod.ServicesContent as ComponentType<typeof props>;
    return renderToStaticMarkup(createElement(ServicesContent, props));
  }

  it("no vazio mantém o aviso e o CTA de contato", async () => {
    const html = await renderServices({
      site: EMPTY_PUBLIC_SITE,
      services: [],
      testimonials: [],
      faq: [],
    });
    expect(html).toContain("Como posso ajudar seu filho.");
    expect(html).toContain("Nenhum serviço publicado.");
    expect(html).toContain('href="/contato"');
    expect(html).not.toContain('role="tablist"');
  });

  it("com um serviço mostra o cartão sem índice", async () => {
    const html = await renderServices({
      site: { ...EMPTY_PUBLIC_SITE, whatsappUrl: "https://wa.me/5511999999999" },
      services: [service],
      testimonials: [],
      faq: [],
    });
    expect(html).toContain("Intervenção");
    expect(html).toContain("Resumo curto.");
    expect(html).toContain("Agendar avaliação");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("aria-expanded");
  });

  it("com dois serviços usa índice vertical e acordeão, sem trilha dourada", async () => {
    const html = await renderServices({
      site: EMPTY_PUBLIC_SITE,
      services: [service, { ...service, slug: "avaliacao", title: "Avaliação" }],
      testimonials: [{ id: "t1", quote: "Ajuda.", authorLabel: "Ana" }],
      faq: [{ id: "f1", question: "Como?", answer: "Assim." }],
    });
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain("aria-expanded");
    expect(html).toContain("Depoimentos");
    expect(html).toContain("Perguntas frequentes");
    expect(html).not.toContain("bg-gold");
  });
});
