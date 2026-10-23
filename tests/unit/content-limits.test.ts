import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CONTENT_LIMITS } from "@/db/content-limits";
import { siteSettingsSchema, testimonialSchema } from "@/modules/content/schema";
import { slugFromTitle } from "@/modules/content/slug";
import { readOrEmpty } from "@/modules/content/queries";

const migration = readFileSync("src/db/migrations/0007_content_limits.sql", "utf8");

describe("limites do conteúdo", () => {
  it("repete no banco cada máximo do Zod", () => {
    for (const limit of [
      CONTENT_LIMITS.heroTitle,
      CONTENT_LIMITS.heroSubtitle,
      CONTENT_LIMITS.heroTagline,
      CONTENT_LIMITS.aboutTitle,
      CONTENT_LIMITS.aboutBody,
      CONTENT_LIMITS.whatsappNumber,
      CONTENT_LIMITS.whatsappMessage,
      CONTENT_LIMITS.instagramHandle,
      CONTENT_LIMITS.contactEmail,
      CONTENT_LIMITS.seoTitle,
      CONTENT_LIMITS.seoDescription,
      CONTENT_LIMITS.serviceTitle,
      CONTENT_LIMITS.serviceBody,
      CONTENT_LIMITS.howItWorksTitle,
      CONTENT_LIMITS.howItWorksBody,
    ]) {
      expect(migration).toContain(String(limit));
    }
    expect(migration).toContain(
      'REVOKE INSERT, DELETE ON TABLE "content"."site_settings" FROM app_runtime',
    );
  });

  it("recusa texto acima do limite e depoimento publicado sem data", () => {
    const parsed = siteSettingsSchema.safeParse({
      ...emptySettings(),
      heroTitle: "a".repeat(CONTENT_LIMITS.heroTitle + 1),
    });
    expect(parsed.success).toBe(false);
    const testimony = testimonialSchema.safeParse({
      quote: "Um relato",
      authorLabel: "Mãe",
      consentAt: null,
      published: true,
    });
    expect(testimony.success).toBe(false);
  });

  it("gera o slug sem acento", () => {
    expect(slugFromTitle("Avaliação Inicial")).toBe("avaliacao-inicial");
  });

  it("trata falha de leitura como conteúdo vazio", async () => {
    const reported: string[] = [];
    const value = await readOrEmpty(
      async () => {
        throw new Error("pessoa@example.com");
      },
      [],
      (error) => reported.push(error instanceof Error ? error.name : "unknown"),
    );
    expect(value).toEqual([]);
    expect(reported).toEqual(["Error"]);
  });
});

function emptySettings() {
  return {
    version: 1,
    heroTitle: "",
    heroSubtitle: "",
    heroTagline: "",
    heroImagePath: "",
    heroImageAlt: "",
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
