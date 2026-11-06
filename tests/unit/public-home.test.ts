import { readFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { CONTENT_LIMITS } from "@/db/content-limits";
import {
  heroHeadingClass,
  heroHeadingText,
  homeAreaText,
  homeSectionKeys,
  IN_PERSON_SERVICE_AREA,
} from "@/modules/content/home-sections";
import { MAPS_LINK_LABEL, MAPS_LINK_TEXT, mapsSearchUrl } from "@/modules/content/maps";
import { openingText } from "@/modules/content/opening";
import { EMPTY_PUBLIC_SITE } from "@/modules/content/queries";
import { heroSectionSchema } from "@/modules/content/schema";

const placeholder = "00000000-0000-4000-8000-000000000000.webp";

describe("site público", () => {
  it("esconde as seções quando não há conteúdo", () => {
    expect(homeSectionKeys(EMPTY_PUBLIC_SITE, [], [], [])).toEqual([]);
  });

  it("mantém a ordem das seções que têm conteúdo", () => {
    expect(
      homeSectionKeys(
        {
          ...EMPTY_PUBLIC_SITE,
          heroTitle: "Adrielli",
          aboutTitle: "Sobre",
          howItWorks: [
            { title: "Primeiro", body: "Passo" },
            { title: "Segundo", body: "Segue." },
            { title: "Terceiro", body: "Fecha." },
          ],
          whatsappNumber: "5511999999999",
          whatsappUrl: "https://wa.me/5511999999999",
          serviceAreaText: "Fernandópolis-SP",
        },
        [
          {
            slug: "avaliacao",
            title: "Avaliação",
            summary: "",
            body: "",
            imagePath: null,
            imageAlt: null,
          },
        ],
        [{ id: "testimonial-1", quote: "Texto", authorLabel: "Ana" }],
        [{ id: "faq-1", question: "Como?", answer: "Assim." }],
      ),
    ).toEqual(["hero", "area", "how", "about", "testimonials", "faq"]);
  });

  it("mostra a faixa com área, com endereço ou esconde", () => {
    expect(homeAreaText(EMPTY_PUBLIC_SITE)).toBeNull();
    expect(
      homeAreaText({ ...EMPTY_PUBLIC_SITE, serviceAreaText: "Fernandópolis-SP" }),
    ).toBe("Fernandópolis-SP");
    expect(homeAreaText({ ...EMPTY_PUBLIC_SITE, addressText: "Rua A" })).toBe(
      IN_PERSON_SERVICE_AREA,
    );
    expect(
      homeAreaText({
        ...EMPTY_PUBLIC_SITE,
        serviceAreaText: "Fernandópolis-SP",
        addressText: "Rua A",
      }),
    ).toBe("Fernandópolis-SP");
    expect(
      homeAreaText({ ...EMPTY_PUBLIC_SITE, serviceAreaText: "  ", addressText: "  " }),
    ).toBeNull();
    expect(
      homeSectionKeys({ ...EMPTY_PUBLIC_SITE, addressText: "Rua A" }, [], [], []),
    ).toEqual(["area"]);
  });

  it("esconde Como funciona quando as etapas não têm texto", () => {
    expect(
      homeSectionKeys(
        {
          ...EMPTY_PUBLIC_SITE,
          howItWorks: [
            { title: "Contato", body: "" },
            { title: "Avaliação", body: " " },
          ],
        },
        [],
        [],
        [],
      ),
    ).toEqual([]);
  });

  it("usa a Frase no H1 e o tamanho acompanha o comprimento", () => {
    expect(
      heroHeadingText({
        ...EMPTY_PUBLIC_SITE,
        heroTitle: "Adrielli Flores",
        heroTagline: "Todo cérebro é capaz de aprender. Cabe a nós descobrir como.",
      }),
    ).toBe("Todo cérebro é capaz de aprender. Cabe a nós descobrir como.");
    expect(heroHeadingText(EMPTY_PUBLIC_SITE)).toBe("Adrielli Flores");
    expect(heroHeadingClass("curto")).toContain("sm:text-[5rem]");
    expect(heroHeadingClass("x".repeat(59))).toContain("sm:text-[4rem]");
    expect(heroHeadingClass("x".repeat(120))).toContain("sm:text-[3.25rem]");
  });

  it("mostra o cartão de materiais mesmo sem conteúdo", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    process.env.NEXT_PUBLIC_SENTRY_DSN ||= "https://public@sentry.example/1";
    process.env.NEXT_PUBLIC_SITE_URL ||= "http://127.0.0.1:3000";
    const home = await import("@/app/(public)/home-sections");
    const HomeContent = home.HomeContent as ComponentType<{
      site: typeof EMPTY_PUBLIC_SITE;
      services: [];
      testimonials: [];
      faq: [];
    }>;
    const html = renderToStaticMarkup(
      createElement(HomeContent, {
        site: EMPTY_PUBLIC_SITE,
        services: [],
        testimonials: [],
        faq: [],
      }),
    );
    expect(html).toContain("Materiais");
    expect(html).toContain("Em breve");
    expect(html).toContain('href="/materiais"');
    expect(html).toContain("Ver materiais");
    expect(html).toMatch(/text-primary[^>]*>Ver materiais/);
    expect(html).toContain("Como é o atendimento");
    expect(html).not.toContain("Conversar pelo WhatsApp");
    expect(html).not.toContain(IN_PERSON_SERVICE_AREA);
    expect(html).not.toContain(MAPS_LINK_TEXT);
    expect(html).not.toContain("lg:grid-cols-2");
  });

  it("monta o topo e a trilha a partir do painel", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    process.env.NEXT_PUBLIC_SENTRY_DSN ||= "https://public@sentry.example/1";
    process.env.NEXT_PUBLIC_SITE_URL ||= "http://127.0.0.1:3000";
    const home = await import("@/app/(public)/home-sections");
    const HomeContent = home.HomeContent as ComponentType<{
      site: typeof EMPTY_PUBLIC_SITE;
      services: [];
      testimonials: [];
      faq: [];
    }>;
    const html = renderToStaticMarkup(
      createElement(HomeContent, {
        site: {
          ...EMPTY_PUBLIC_SITE,
          heroTitle: "Adrielli Flores",
          heroSubtitle: "Psicopedagoga",
          heroTagline: "Todo cérebro é capaz de aprender. Cabe a nós descobrir como.",
          whatsappUrl: "https://wa.me/5511999999999",
          serviceAreaText: "Fernandópolis-SP",
          howItWorks: [
            { title: "Primeiro contato", body: "Agende a conversa." },
            { title: "Avaliação", body: "Entenda o quadro." },
            { title: "Acompanhamento", body: "Siga o plano." },
          ],
        },
        services: [],
        testimonials: [],
        faq: [],
      }),
    );
    expect(html).toContain(
      "Todo cérebro é capaz de aprender. Cabe a nós descobrir como.",
    );
    expect(html).toContain("Psicopedagoga");
    expect(html).toContain("Conversar pelo WhatsApp");
    expect(html).toContain("Fernandópolis-SP");
    expect(html).not.toContain(MAPS_LINK_TEXT);
    expect(html).not.toContain("google.com/maps");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Etapa 1 de 3");
    expect(html).toContain("Anterior");
    expect(html).toContain("Próxima etapa");
    expect(html).toContain("Toque em cada etapa para ver os detalhes.");
    expect(html).toContain("text-3xl sm:text-5xl");
    expect(html).not.toContain("lg:grid-cols-2");
    expect(html).toContain("max-w-3xl");
    expect(html).not.toContain("Conhecer os serviços");
  });

  it("na faixa, o endereço vira Ver no mapa e sem área usa Atendimento presencial", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    process.env.NEXT_PUBLIC_SENTRY_DSN ||= "https://public@sentry.example/1";
    process.env.NEXT_PUBLIC_SITE_URL ||= "http://127.0.0.1:3000";
    const home = await import("@/app/(public)/home-sections");
    const HomeContent = home.HomeContent as ComponentType<{
      site: typeof EMPTY_PUBLIC_SITE;
      services: [];
      testimonials: [];
      faq: [];
    }>;
    const address = "Rua São João, 100";
    const withAddress = renderToStaticMarkup(
      createElement(HomeContent, {
        site: { ...EMPTY_PUBLIC_SITE, addressText: address },
        services: [],
        testimonials: [],
        faq: [],
      }),
    );
    expect(withAddress).toContain(IN_PERSON_SERVICE_AREA);
    expect(withAddress).toContain(
      `href="${mapsSearchUrl(address)?.replaceAll("&", "&amp;")}"`,
    );
    expect(withAddress).toContain(`aria-label="${MAPS_LINK_LABEL}"`);
    expect(withAddress).toContain(MAPS_LINK_TEXT);
    expect(withAddress).not.toContain("<iframe");

    const withBoth = renderToStaticMarkup(
      createElement(HomeContent, {
        site: {
          ...EMPTY_PUBLIC_SITE,
          serviceAreaText: "Fernandópolis-SP",
          addressText: address,
        },
        services: [],
        testimonials: [],
        faq: [],
      }),
    );
    expect(withBoth).toContain("Fernandópolis-SP");
    expect(withBoth).toContain(
      `href="${mapsSearchUrl(address)?.replaceAll("&", "&amp;")}"`,
    );
    expect(withBoth).not.toContain(IN_PERSON_SERVICE_AREA);
  });

  it("usa duas colunas no topo só quando há foto", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    process.env.NEXT_PUBLIC_SENTRY_DSN ||= "https://public@sentry.example/1";
    process.env.NEXT_PUBLIC_SITE_URL ||= "http://127.0.0.1:3000";
    const home = await import("@/app/(public)/home-sections");
    const HomeContent = home.HomeContent as ComponentType<{
      site: typeof EMPTY_PUBLIC_SITE;
      services: [];
      testimonials: [];
      faq: [];
    }>;
    const html = renderToStaticMarkup(
      createElement(HomeContent, {
        site: {
          ...EMPTY_PUBLIC_SITE,
          heroTitle: "Adrielli Flores",
          heroImagePath: placeholder,
          heroImageAlt: "Sala",
        },
        services: [],
        testimonials: [],
        faq: [],
      }),
    );
    expect(html).toContain("lg:grid-cols-2");
  });

  it("mostra só o começo do texto", () => {
    expect(openingText("Primeiro parágrafo.\n\nSegundo.")).toBe("Primeiro parágrafo.");
    expect(openingText("a".repeat(300)).endsWith("…")).toBe(true);
  });

  it("valida o topo antes de existir um arquivo gravado", () => {
    const parsed = heroSectionSchema.safeParse({
      version: 1,
      heroTitle: "a".repeat(CONTENT_LIMITS.heroTitle + 1),
      heroSubtitle: "",
      heroTagline: "",
      heroImagePath: placeholder,
      heroImageAlt: "Sala",
    });
    expect(parsed.success).toBe(false);
  });

  it("a ação do topo valida o texto antes de enviar a imagem", () => {
    const source = readFileSync("src/modules/content/server/actions.ts", "utf8");
    const body = source.slice(
      source.indexOf("export async function saveSiteSectionAction"),
      source.indexOf("function parseSection"),
    );
    expect(body.indexOf("parseSection")).toBeGreaterThan(-1);
    expect(body.indexOf("if (!parsed.ok)")).toBeLessThan(
      body.indexOf("uploadSectionFile"),
    );
  });
});
