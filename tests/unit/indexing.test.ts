import { describe, expect, it } from "vitest";

import {
  publicPageMetadata,
  publicSitemap,
  robotsPolicy,
} from "@/modules/content/indexing";

describe("indexação", () => {
  it("monta título, descrição e Open Graph com o nome da página", () => {
    expect(
      publicPageMetadata({
        pageName: "Sobre",
        seoTitle: "Adrielli Flores",
        seoDescription: "Fonoaudiologia.",
        path: "/sobre",
      }),
    ).toEqual({
      title: "Sobre · Adrielli Flores",
      description: "Fonoaudiologia.",
      openGraph: {
        title: "Sobre · Adrielli Flores",
        description: "Fonoaudiologia.",
        url: "/sobre",
      },
    });
  });

  it("usa a marca quando o título de busca está vazio", () => {
    expect(
      publicPageMetadata({
        pageName: "Início",
        seoTitle: " ",
        seoDescription: "",
        path: "/",
      }).title,
    ).toBe("Início · Adrielli Flores");
  });

  it("bloqueia o site fora da produção e só as áreas internas na produção", () => {
    expect(robotsPolicy("staging")).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
    expect(robotsPolicy("development")).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
    expect(robotsPolicy("production")).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/consultorio", "/equipe", "/api"],
      },
    });
  });

  it("lista só as páginas públicas no sitemap", () => {
    expect(publicSitemap("https://adrielli.example")).toEqual([
      { url: "https://adrielli.example/" },
      { url: "https://adrielli.example/sobre" },
      { url: "https://adrielli.example/servicos" },
      { url: "https://adrielli.example/contato" },
      { url: "https://adrielli.example/materiais" },
      { url: "https://adrielli.example/privacidade" },
    ]);
  });
});
