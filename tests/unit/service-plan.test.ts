import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CONTENT_LIMITS } from "@/db/content-limits";
import { planServiceWrite, type ServiceDraft } from "@/modules/content/service-plan";

function draft(overrides: Partial<ServiceDraft> = {}): ServiceDraft {
  return {
    title: "Avaliação",
    slug: "avaliacao",
    summary: "Uma conversa inicial",
    body: "O texto do serviço.",
    imagePath: "",
    imageAlt: "",
    published: false,
    version: 0,
    hasNewFile: false,
    ...overrides,
  };
}

describe("plano de gravação do serviço", () => {
  it("recusa o texto longo antes de pedir o envio da imagem", () => {
    const plan = planServiceWrite(
      draft({ title: "a".repeat(CONTENT_LIMITS.serviceTitle + 1), hasNewFile: true }),
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.fields.title).toMatch(/máximo/);
  });

  it("exige a descrição da imagem antes do envio", () => {
    const plan = planServiceWrite(draft({ hasNewFile: true, imageAlt: "" }));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.field).toBe("imageAlt");
  });

  it("só marca o envio quando o texto cabe e há um arquivo novo", () => {
    const accepted = planServiceWrite(draft({ hasNewFile: true, imageAlt: "Sala" }));
    expect(accepted).toMatchObject({ ok: true, upload: true, data: { imagePath: null } });
    const kept = planServiceWrite(draft());
    expect(kept).toMatchObject({ ok: true, upload: false });
  });

  it("a ação consulta o plano antes de chamar o storage", () => {
    const source = readFileSync("src/modules/content/server/actions.ts", "utf8");
    const body = source.slice(
      source.indexOf("export async function createServiceAction"),
      source.indexOf("export async function updateServiceAction"),
    );
    expect(body.indexOf("planServiceWrite")).toBeGreaterThan(-1);
    expect(body.indexOf("if (!plan.ok)")).toBeLessThan(
      body.indexOf("uploadPlannedImage"),
    );
  });
});
