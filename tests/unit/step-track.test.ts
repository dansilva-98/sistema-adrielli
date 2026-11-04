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

function hasAriaLabelOn(markup: string, tag: "li" | "p"): boolean {
  return new RegExp(`<${tag}\\b[^>]*\\baria-label=`, "i").test(markup);
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
    expect(three).toContain("Etapa 1:");
    expect(three).toContain("Primeiro contato");
    expect(three).toContain("Etapa 3:");
    expect(three).toContain("Acompanhamento");
    expect(three).not.toContain("Etapa 4:");
    expect(six).toContain("Etapa 6:");
    expect(six).toContain("Encerramento");
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
  it("no cartão da home, mostra Etapa N de total e os controles Anterior e Próxima", () => {
    const markup = html({ variant: "tabs", steps: threeSteps, panelNav: true });
    expect(markup).toContain("Etapa 1 de 3");
    expect(markup).toContain("Anterior");
    expect(markup).toContain("Próxima etapa");
    expect(markup).toContain("Toque em cada etapa para ver os detalhes.");
  });

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

  it("no acordeão, setas só movem o foco e Enter ou Espaço abrem", () => {
    const file = source();
    const accordionHandler = file.slice(file.indexOf("function VerticalTrack"));
    expect(accordionHandler).toContain("headersRef.current[next]?.focus()");
    expect(accordionHandler).toContain('event.key === "Enter" || event.key === " "');
    expect(accordionHandler).toContain("setOpen(index)");
    expect(accordionHandler).not.toContain("setOpen(next)");
  });
});

describe("rótulo no celular", () => {
  it("esconde o rótulo só na variante tabs", () => {
    const tabs = html({ variant: "tabs", steps: threeSteps });
    const staticMarkup = html({ variant: "static", steps: threeSteps });
    const progress = html({ variant: "progress", steps: threeSteps, currentIndex: 0 });
    expect(tabs).toContain("hidden");
    expect(tabs).toContain("sm:block");
    expect(tabs).toContain('aria-label="Etapa 1: Primeiro contato"');
    expect(staticMarkup).not.toContain("hidden font-serif");
    expect(staticMarkup).not.toContain("sm:block");
    expect(progress).not.toContain("hidden font-serif");
    expect(progress).not.toContain("sm:block");
    expect(staticMarkup).toContain("font-sans text-sm");
    expect(progress).toContain("font-sans text-sm");
  });
});

describe("nome acessível", () => {
  it("usa sr-only Etapa N: em static e progress, sem aria-label em li ou p", () => {
    const variants: StepTrackProps[] = [
      { variant: "static", steps: threeSteps },
      { variant: "progress", steps: threeSteps, currentIndex: 1 },
      { variant: "tabs", steps: threeSteps },
      { variant: "vertical", steps: threeSteps },
      { variant: "vertical", steps: threeSteps, collapsible: false },
    ];
    for (const props of variants) {
      const markup = html(props);
      expect(hasAriaLabelOn(markup, "li"), `${props.variant} li`).toBe(false);
      expect(hasAriaLabelOn(markup, "p"), `${props.variant} p`).toBe(false);
    }
    const staticMarkup = html({ variant: "static", steps: threeSteps });
    const progress = html({ variant: "progress", steps: threeSteps, currentIndex: 1 });
    expect(staticMarkup).toContain('class="sr-only"');
    expect(staticMarkup).toContain("Etapa 1:");
    expect(staticMarkup).toContain("Etapa 2:");
    expect(progress).toContain("Etapa 1:");
    expect(stepAriaLabel(0, "Primeiro contato", true)).toBe("Etapa 1: Primeiro contato");
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
