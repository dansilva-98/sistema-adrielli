import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { expectPublishedService, expectServiceAbsent } from "./public-service-visibility";
import { createStaff, removeStaff, signIn } from "./staff-fixtures";

const PAGES = [
  { path: "/sobre", heading: /Sobre|Quem é/, capture: "sobre" },
  { path: "/servicos", heading: "Como posso ajudar seu filho.", capture: "servicos" },
  { path: "/contato", heading: "Vamos conversar sobre seu filho?", capture: "contato" },
] as const;

const LAYOUT_WIDTHS = [320, 360, 768, 1024, 1280] as const;
const CAPTURE_WIDTHS = [360, 1280] as const;

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function overflowReport(page: Page): Promise<string> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll("*")]
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.right <= limit + 1) return [];
        const className = typeof element.className === "string" ? element.className : "";
        return [
          `${element.tagName.toLowerCase()}.${className.split(/\s+/).slice(0, 3).join(".")} right=${Math.round(rect.right)} w=${Math.round(rect.width)}`,
        ];
      })
      .slice(0, 8)
      .join(" | ");
  });
}

async function expectPage(page: Page, path: string, heading: string | RegExp) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formação" })).toHaveCount(0);
}

async function fillService(page: Page, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Novo serviço" })).toBeVisible();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Resumo").fill("Resumo curto.");
  await page.getByLabel("Texto").fill(`Texto de ${title}.`);
  await expect(page.getByLabel("Publicar no site")).toBeChecked();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço criado.")).toBeVisible({ timeout: 20_000 });
}

for (const width of LAYOUT_WIDTHS) {
  test(`Sobre, Serviços e Contato respondem em ${width}px sem rolagem horizontal`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const item of PAGES) {
      await expectPage(page, item.path, item.heading);
      const overflow = await overflowX(page);
      expect(
        overflow,
        `${item.path} em ${width}px ${await overflowReport(page)}`,
      ).toBeLessThanOrEqual(1);
    }
  });
}

for (const width of CAPTURE_WIDTHS) {
  test(`captura Sobre, Serviços e Contato em ${width}px`, async ({ page }) => {
    mkdirSync("docs/specs/capturas/l3-3", { recursive: true });
    mkdirSync("test-results/l3-capturas", { recursive: true });
    await page.setViewportSize({ width, height: 800 });
    for (const item of PAGES) {
      await expectPage(page, item.path, item.heading);
      const file = `${item.capture}-${width}.png`;
      await page.screenshot({ path: `docs/specs/capturas/l3-3/${file}` });
      await page.screenshot({ path: `test-results/l3-capturas/${file}` });
    }
  });
}

for (const item of PAGES) {
  test(`axe não encontra violações em ${item.path}`, async ({ page }) => {
    await page.goto(item.path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test("axe com dois serviços em 360 e 1280 px", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `paginas-servicos-${crypto.randomUUID()}@example.com`;
  const userId = await createStaff(email, "CONTENT_ADMIN");
  const stamp = crypto.randomUUID().slice(0, 8);
  const titles = [`Serviço axe A ${stamp}`, `Serviço axe B ${stamp}`];
  try {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/conteudo/servicos");
    for (const title of titles) {
      await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
      await fillService(page, title);
    }
    for (const width of CAPTURE_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/servicos");
      for (const title of titles) {
        await expectPublishedService(page, title);
      }
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    }
    await page.goto("/admin/conteudo/servicos");
    for (const title of titles) {
      const row = page.locator("ul > li").filter({ hasText: title });
      await row.getByRole("button", { name: "Ocultar" }).click();
      await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
    }
    await page.goto("/servicos");
    for (const title of titles) {
      await expectServiceAbsent(page, title);
    }
  } finally {
    await removeStaff(userId);
  }
});
