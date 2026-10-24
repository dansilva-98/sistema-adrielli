import { readFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  POOLER_IDLE_TIMEOUT_SECONDS,
  RUNTIME_MAX_LIFETIME_SECONDS,
  RUNTIME_STATEMENT_TIMEOUT_MS,
} from "@/db/runtime-limits";
import {
  loadPublicHome,
  PUBLIC_READ_TIMEOUT_MS,
  PublicReadTimeoutError,
} from "@/modules/content/public-read";
import {
  EMPTY_PUBLIC_SITE,
  type PublicFaq,
  type PublicService,
  type PublicSite,
  type PublicTestimonial,
} from "@/modules/content/queries";

function hang<T>(): Promise<T> {
  return new Promise(() => undefined);
}

async function renderHome(content: {
  site: PublicSite;
  services: PublicService[];
  testimonials: PublicTestimonial[];
  faq: PublicFaq[];
}): Promise<string> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.NEXT_PUBLIC_SENTRY_DSN ||= "https://public@sentry.example/1";
  process.env.NEXT_PUBLIC_SITE_URL ||= "http://127.0.0.1:3000";
  const home = await import("@/app/(public)/home-sections");
  const HomeContent = home.HomeContent as ComponentType<typeof content>;
  return renderToStaticMarkup(
    createElement(
      "html",
      { lang: "pt-BR" },
      createElement("body", null, createElement(HomeContent, content)),
    ),
  );
}

describe("leitura pública com consulta parada", () => {
  it("termina a página rápido e com o conteúdo vazio", async () => {
    const reported: string[] = [];
    let abandoned = 0;
    const started = Date.now();
    const content = await loadPublicHome(
      {
        site: hang,
        services: hang,
        testimonials: hang,
        faq: hang,
      },
      (error) => {
        reported.push(error instanceof PublicReadTimeoutError ? error.name : "unknown");
      },
      40,
      () => {
        abandoned += 1;
      },
    );
    const html = await renderHome(content);

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(html).toContain("</html>");
    expect(html).toContain("Adrielli Flores");
    expect(html).not.toContain("Algo deu errado");
    expect(html).not.toContain("Perguntas frequentes");
    expect(html).not.toContain("Depoimentos");
    expect(content.site.heroTitle).toBe("");
    expect(content.services).toEqual([]);
    expect(content.testimonials).toEqual([]);
    expect(content.faq).toEqual([]);
    expect(reported).toEqual([
      "PublicReadTimeoutError",
      "PublicReadTimeoutError",
      "PublicReadTimeoutError",
      "PublicReadTimeoutError",
    ]);
    expect(abandoned).toBe(4);
  });

  it("entrega o conteúdo quando a consulta responde", async () => {
    let abandoned = 0;
    const content = await loadPublicHome(
      {
        site: async () => ({ ...EMPTY_PUBLIC_SITE, heroTitle: "Adrielli" }),
        services: async () => [],
        testimonials: async () => [],
        faq: async () => [],
      },
      () => {
        throw new Error("não deveria registrar falha");
      },
      1_000,
      () => {
        abandoned += 1;
      },
    );
    expect(content.site.heroTitle).toBe("Adrielli");
    expect(abandoned).toBe(0);
  });

  it("deixa a vida da conexão menor que o tempo ocioso do pooler", () => {
    expect(PUBLIC_READ_TIMEOUT_MS).toBe(5_000);
    expect(RUNTIME_STATEMENT_TIMEOUT_MS).toBe(10_000);
    expect(RUNTIME_MAX_LIFETIME_SECONDS).toBeLessThan(POOLER_IDLE_TIMEOUT_SECONDS);
    const client = readFileSync("src/db/client.ts", "utf8");
    expect(client).toContain("statement_timeout: RUNTIME_STATEMENT_TIMEOUT_MS");
    expect(client).toContain("max_lifetime: RUNTIME_MAX_LIFETIME_SECONDS");
    expect(client).toContain("abandonRuntimeConnection");
  });
});
