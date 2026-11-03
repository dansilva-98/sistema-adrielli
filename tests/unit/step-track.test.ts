import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  STEP_COUNT_MAX,
  STEP_COUNT_MIN,
  StepTrack,
  isValidStepCount,
  stepAriaLabel,
  stepIndexAfterKey,
  type StepTrackItem,
  type StepTrackProps,
} from "@/components/step-track";

const threeSteps: StepTrackItem[] = [
  { title: "Primeiro contato", body: "Agende a conversa inicial." },
  { title: "Avaliação", body: "Entenda o quadro com calma." },
  { title: "Acompanhamento", body: "Siga o plano combinado." },
];

const sixSteps: StepTrackItem[] = [
  ...threeSteps,
  { title: "Plano", body: "Combine os próximos encontros." },
  { title: "Retorno", body: "Revise o que já avançou." },
  { title: "Encerramento", body: "Combine o fechamento do ciclo." },
];

function html(props: StepTrackProps): string {
  return renderToStaticMarkup(createElement(StepTrack, props));
}

function source(): string {
  return readFileSync(path.join("src", "components", "step-track.tsx"), "utf8");
}

describe("contagem de etapas", () => {
  it("aceita de 3 a 6 etapas, como no painel", () => {
    expect(STEP_COUNT_MIN).toBe(3);
    expect(STEP_COUNT_MAX).toBe(6);
    expect(isValidStepCount(2)).toBe(false);
    expect(isValidStepCount(3)).toBe(true);
    expect(isValidStepCount(6)).toBe(true);
    expect(isValidStepCount(7)).toBe(false);
  });

  it("não renderiza fora do intervalo do painel", () => {
    expect(html({ variant: "static", steps: threeSteps.slice(0, 2) })).toBe("");
    expect(
      html({
        variant: "static",
        steps: [...sixSteps, { title: "Extra", body: "Fora do painel." }],
      }),
    ).toBe("");
  });

  it("renderiza 3 e 6 etapas", () => {
    const three = html({ variant: "static", steps: threeSteps });
    const six = html({ variant: "static", steps: sixSteps });
    expect(three).toContain("1. Primeiro contato");
    expect(three).toContain("3. Acompanhamento");
    expect(three).not.toContain("4.");
    expect(six).toContain("6. Encerramento");
  });
});

describe("variante static", () => {
  it("usa lista ordenada, sem abas nem botões", () => {
    const markup = html({ variant: "static", steps: threeSteps });
    expect(markup).toContain("<ol");
    expect(markup).not.toContain('role="tablist"');
    expect(markup).not.toContain("<button");
    expect(markup).toContain('aria-label="Etapas"');
  });
});

describe("variante tabs", () => {
  it("expõe o padrão WAI-ARIA Tabs com ativação no primeiro item", () => {
    const markup = html({ variant: "tabs", steps: threeSteps });
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-selected="false"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Agende a conversa inicial.");
    expect(markup).toContain("focus-visible:outline-primary");
  });
});

describe("variante progress", () => {
  it("marca a etapa atual com aria-current e o check nas anteriores", () => {
    const markup = html({ variant: "progress", steps: threeSteps, currentIndex: 1 });
    expect(markup).toContain("<ol");
    expect(markup).toContain('aria-current="step"');
    expect(markup).not.toContain("<button");
    expect(markup).toContain("lucide-check");
  });
});

describe("variante vertical", () => {
  it("usa acordeão com aria-expanded e o título visível", () => {
    const markup = html({ variant: "vertical", steps: threeSteps });
    expect(markup).toContain("<ol");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Primeiro contato");
    expect(markup).toContain("flex-col");
  });
});

describe("teclado", () => {
  it("navega com setas, Home e End, em ciclo", () => {
    expect(stepIndexAfterKey(0, 4, "ArrowRight")).toBe(1);
    expect(stepIndexAfterKey(3, 4, "ArrowRight")).toBe(0);
    expect(stepIndexAfterKey(0, 4, "ArrowLeft")).toBe(3);
    expect(stepIndexAfterKey(1, 4, "ArrowDown")).toBe(2);
    expect(stepIndexAfterKey(1, 4, "ArrowUp")).toBe(0);
    expect(stepIndexAfterKey(2, 4, "Home")).toBe(0);
    expect(stepIndexAfterKey(0, 4, "End")).toBe(3);
    expect(stepIndexAfterKey(1, 4, "Enter")).toBeNull();
  });

  it("liga as teclas do padrão Tabs no componente", () => {
    const file = source();
    expect(file).toContain("stepIndexAfterKey");
    expect(file).toContain("ArrowRight");
    expect(file).toContain("ArrowLeft");
    expect(file).toContain("Home");
    expect(file).toContain("End");
    expect(file).toContain("event.preventDefault()");
  });
});

describe("rótulo no celular", () => {
  it("expõe o título no aria-label e esconde o texto visual abaixo de sm", () => {
    expect(stepAriaLabel(0, "Primeiro contato", true)).toBe("1. Primeiro contato");
    const markup = html({ variant: "static", steps: threeSteps });
    expect(markup).toContain('aria-label="1. Primeiro contato"');
    expect(markup).toContain('aria-label="2. Avaliação"');
    expect(markup).toContain("hidden");
    expect(markup).toContain("sm:block");
    const file = source();
    expect(file).toContain('hidden text-center font-serif');
    expect(file).toContain("sm:block");
  });
});

describe("movimento reduzido e tokens", () => {
  it("respeita prefers-reduced-motion no painel das abas", () => {
    const markup = html({ variant: "tabs", steps: threeSteps });
    expect(markup).toContain("motion-reduce:transition-none");
  });

  it("usa o ouro só na linha e no anel, nunca como cor de texto", () => {
    const file = source();
    expect(file).toContain("bg-gold");
    expect(file).toContain("border-gold");
    expect(file).toContain("ring-gold-light");
    expect(file).not.toContain("text-gold");
    expect(file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("não importa CMS, schema nem migration", () => {
    const file = source();
    expect(file).not.toContain("modules/content");
    expect(file).not.toContain("drizzle");
    expect(file).not.toContain("supabase/migrations");
  });
});
