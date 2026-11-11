import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  planTestimonialWrite,
  type TestimonialDraft,
} from "@/modules/content/testimonial-plan";

const keptPath = "11111111-1111-4111-8111-111111111111.webp";

function draft(overrides: Partial<TestimonialDraft> = {}): TestimonialDraft {
  return {
    quote: "A família agradece o cuidado.",
    authorLabel: "Mãe",
    consentAt: "2026-11-11",
    imagePath: "",
    published: true,
    version: 0,
    hasNewFile: false,
    ...overrides,
  };
}

describe("plano de gravação do depoimento", () => {
  it("grava sem imagem e não pede envio", () => {
    expect(planTestimonialWrite(draft())).toMatchObject({
      ok: true,
      upload: false,
      data: { imagePath: null, quote: "A família agradece o cuidado." },
    });
  });

  it("marca o envio quando há arquivo novo e deixa o caminho para o storage", () => {
    expect(planTestimonialWrite(draft({ hasNewFile: true }))).toMatchObject({
      ok: true,
      upload: true,
      data: { imagePath: null },
    });
  });

  it("mantém a imagem já gravada", () => {
    expect(
      planTestimonialWrite(draft({ imagePath: keptPath, version: 1 })),
    ).toMatchObject({
      ok: true,
      upload: false,
      data: { imagePath: keptPath },
    });
  });

  it("troca a imagem: envia a nova e esvazia o caminho antigo", () => {
    expect(
      planTestimonialWrite(draft({ imagePath: keptPath, hasNewFile: true, version: 1 })),
    ).toMatchObject({
      ok: true,
      upload: true,
      data: { imagePath: null },
    });
  });

  it("remove a imagem sem enviar arquivo", () => {
    expect(planTestimonialWrite(draft({ imagePath: "", version: 1 }))).toMatchObject({
      ok: true,
      upload: false,
      data: { imagePath: null },
    });
  });

  it("a transcrição continua obrigatória mesmo com imagem", () => {
    const plan = planTestimonialWrite(draft({ quote: "  ", hasNewFile: true }));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.fields.quote).toMatch(/Preencha/);
  });

  it("a ação consulta o plano antes de chamar o storage", () => {
    const source = readFileSync("src/modules/content/server/actions.ts", "utf8");
    const body = source.slice(
      source.indexOf("export async function createTestimonialAction"),
      source.indexOf("export async function createFaqAction"),
    );
    expect(body.indexOf("planTestimonialWrite")).toBeGreaterThan(-1);
    expect(body.indexOf("if (!plan.ok)")).toBeLessThan(
      body.indexOf("uploadPlannedImage"),
    );
    expect(body).toContain("forgetImages");
  });
});
