import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { CAPTURE_WIDTHS, expectPage, fillService, PAGES } from "./public-pages-fixtures";
import { expectPublishedService, expectServiceAbsent } from "./public-service-visibility";
import { createStaff, removeStaff, signIn } from "./staff-fixtures";

const LAYOUT_WIDTHS = [320, 360, 480, 600, 768, 1024, 1280] as const;
const VERTICAL_BELOW = 640;

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

async function stepTrackReport(page: Page, listSelector: string, itemSelector: string) {
  return page.evaluate(
    ([listQuery, itemQuery]) => {
      const lists = [...document.querySelectorAll<HTMLElement>(listQuery)];
      const visible = lists.filter((list) => list.getClientRects().length > 0);
      const list = visible[0];
      const titles = list
        ? [
            ...list.querySelectorAll<HTMLElement>("[data-step-label], [data-step-title]"),
          ].filter((element) => element.getBoundingClientRect().width >= 8)
        : [];
      return {
        lists: lists.length,
        visible: visible.length,
        counts: lists.map((item) => item.querySelectorAll(itemQuery).length),
        items: list?.querySelectorAll(itemQuery).length ?? 0,
        titles: titles.map((element) => {
          const box = (element.closest(itemQuery) ?? element).getBoundingClientRect();
          const style = getComputedStyle(element);
          const fontSize = Number.parseFloat(style.fontSize) || 12;
          const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
          const rect = element.getBoundingClientRect();
          const problems: string[] = [];
          for (const node of element.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE) continue;
            for (const match of (node.textContent ?? "").matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const rects = [...range.getClientRects()].filter((part) => part.width > 0);
              if (rects.length !== 1)
                problems.push(`${match[0]} em ${rects.length} linhas`);
              for (const part of rects) {
                if (part.left < box.left - 1 || part.right > box.right + 1) {
                  problems.push(`${match[0]} sai da coluna`);
                }
              }
            }
          }
          return {
            text: (element.textContent ?? "").trim(),
            horizontal: element.hasAttribute("data-step-label"),
            lines: Math.round(rect.height / lineHeight),
            overflow: element.scrollWidth - element.clientWidth,
            problems,
          };
        }),
      };
    },
    [listSelector, itemSelector] as const,
  );
}

type StepTrackReport = Awaited<ReturnType<typeof stepTrackReport>>;

function expectTitlesFit(report: StepTrackReport): void {
  for (const title of report.titles) {
    expect(title.problems, title.text).toEqual([]);
    expect(title.overflow, title.text).toBeLessThanOrEqual(1);
    if (title.horizontal) expect(title.lines, title.text).toBeLessThanOrEqual(2);
  }
}

async function expectContactStepsFit(page: Page, width: number): Promise<void> {
  const report = await stepTrackReport(
    page,
    'ol[aria-labelledby="depois-da-mensagem"]',
    ":scope > li",
  );
  expect(report.lists).toBe(2);
  expect(report.visible).toBe(1);
  expect(report.counts[0]).toBe(report.counts[1]);
  expect(report.items).toBeGreaterThanOrEqual(3);
  expect(report.titles).toHaveLength(report.items);
  for (const title of report.titles) {
    expect(title.horizontal, title.text).toBe(width >= VERTICAL_BELOW);
  }
  expectTitlesFit(report);
}

async function expectHomeStepsFit(page: Page, width: number): Promise<void> {
  const tablist = '[role="tablist"][aria-labelledby="como-funciona-titulo"]';
  await expect(page.locator(tablist)).toBeVisible();
  const report = await stepTrackReport(page, tablist, '[role="tab"]');
  expect(report.visible).toBe(1);
  expect(report.items).toBeGreaterThanOrEqual(3);
  expect(report.titles).toHaveLength(width >= 640 ? report.items : 0);
  expectTitlesFit(report);
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
      if (item.path === "/contato") await expectContactStepsFit(page, width);
    }
    await page.goto("/");
    await expectHomeStepsFit(page, width);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
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
