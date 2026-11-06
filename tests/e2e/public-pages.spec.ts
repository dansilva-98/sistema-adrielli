import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const PAGES = [
  { path: "/sobre", heading: /Sobre|Quem é/ },
  { path: "/servicos", heading: "Como posso ajudar seu filho." },
  { path: "/contato", heading: "Vamos conversar sobre seu filho?" },
] as const;

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function expectPage(page: Page, path: string, heading: string | RegExp) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formação" })).toHaveCount(0);
}

for (const width of [375, 1280]) {
  test(`Sobre, Serviços e Contato respondem em ${width}px sem rolagem horizontal`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const item of PAGES) {
      await expectPage(page, item.path, item.heading);
      expect(await overflowX(page)).toBeLessThanOrEqual(1);
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
