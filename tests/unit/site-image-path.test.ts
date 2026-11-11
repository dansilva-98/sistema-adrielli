import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isSiteImagePath } from "@/modules/content/image-path";
import {
  serviceSchema,
  siteSettingsSchema,
  testimonialSchema,
} from "@/modules/content/schema";
import { removeSiteObject } from "@/modules/content/storage";

const validPath = "11111111-1111-4111-8111-111111111111.webp";
const migration = readFileSync("src/db/migrations/0008_site_image_path.sql", "utf8");

describe("caminho de imagem", () => {
  it("aceita só uuid.webp e recusa caminho fora do bucket", async () => {
    expect(isSiteImagePath(validPath)).toBe(true);
    expect(testimonialSchema.safeParse(testimony(validPath)).success).toBe(true);
    expect(testimonialSchema.safeParse(testimony("")).success).toBe(true);
    expect(migration.match(/12}\\\.webp/g)).toHaveLength(3);
    expect(
      readFileSync("src/db/migrations/0013_testimonials_image_path.sql", "utf8"),
    ).toContain("testimonials_image_path");
    for (const path of [
      "../materiais/arquivo",
      "%2e%2e/arquivo.webp",
      "pasta/arquivo.webp",
    ]) {
      expect(isSiteImagePath(path)).toBe(false);
      expect(siteSettingsSchema.safeParse(settings(path)).success).toBe(false);
      expect(serviceSchema.safeParse(service(path)).success).toBe(false);
      expect(testimonialSchema.safeParse(testimony(path)).success).toBe(false);
      await expect(
        removeSiteObject(
          { supabaseUrl: "http://127.0.0.1:54321", serviceRoleKey: "key" },
          path,
        ),
      ).rejects.toThrow("Caminho de imagem recusado.");
    }
  });
});

function settings(heroImagePath: string) {
  return {
    version: 1,
    heroTitle: "",
    heroSubtitle: "",
    heroTagline: "",
    heroImagePath,
    heroImageAlt: "Capa",
    aboutTitle: "",
    aboutBody: "",
    aboutImagePath: "",
    aboutImageAlt: "",
    howItWorks: [
      { title: "Contato", body: "" },
      { title: "Avaliação", body: "" },
      { title: "Atendimento", body: "" },
      { title: "Acompanhamento", body: "" },
    ],
    whatsappNumber: "",
    whatsappMessage: "",
    instagramHandle: "",
    contactEmail: "",
    supportEmail: "",
    addressText: "",
    serviceAreaText: "",
    seoTitle: "",
    seoDescription: "",
  };
}

function service(imagePath: string) {
  return {
    title: "Serviço",
    slug: "servico",
    summary: "Resumo",
    body: "Texto",
    imagePath,
    imageAlt: "Imagem",
    published: false,
  };
}

function testimony(imagePath: string) {
  return {
    quote: "Um relato",
    authorLabel: "Mãe",
    imagePath,
    consentAt: "2026-11-11",
    published: false,
  };
}
