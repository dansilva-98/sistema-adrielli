import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CONTENT_LIMITS } from "@/db/content-limits";
import { openingText } from "@/modules/content/opening";
import { EMPTY_PUBLIC_SITE } from "@/modules/content/queries";
import { heroSectionSchema } from "@/modules/content/schema";

import { homeSectionKeys } from "@/modules/content/home-sections";

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
          howItWorks: [{ title: "Primeiro", body: "Passo" }],
          whatsappNumber: "5511999999999",
          whatsappUrl: "https://wa.me/5511999999999",
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
    ).toEqual(["hero", "about", "services", "how", "testimonials", "faq", "contact"]);
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
