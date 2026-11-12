import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { createStaff, removeStaff, signIn } from "./staff-fixtures";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const WIDTHS = [320, 375, 768, 1024, 1280] as const;

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function attachPrint(page: Page, name: string): Promise<void> {
  await page.getByLabel("Trocar imagem").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: PNG,
  });
}

test.describe("depoimentos com imagem", () => {
  test("publica com print, troca, remove e passa no axe da home", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `depoimento-imagem-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const stamp = crypto.randomUUID().slice(0, 8);
    const quote = `A família ${stamp} agradece o cuidado no print.`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/depoimentos");
      await page.getByRole("link", { name: "Adicionar depoimento", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Novo depoimento" })).toBeVisible();
      await page.getByLabel("Depoimento").fill(quote);
      await page.getByLabel("Quem falou").fill(`Família ${stamp}`);
      await attachPrint(page, "print.png");
      await expect(page.getByLabel("Transcrição do print (obrigatória)")).toHaveValue(
        quote,
      );
      await page.getByLabel("Data do consentimento").fill("2026-11-11");
      await expect(page.getByLabel("Publicar no site")).toBeChecked();
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Depoimento criado.")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(`${quote} · com imagem`)).toBeVisible();

      await page.goto("/");
      const photo = page.getByRole("img", { name: quote });
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute("loading", "lazy");
      const firstSrc = await photo.getAttribute("src");
      expect(firstSrc).toBeTruthy();
      await expect(page.getByText("Ler a transcrição")).toBeVisible();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        expect(await overflowX(page), `home em ${width}px`).toBeLessThanOrEqual(1);
      }
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

      await page.goto("/servicos");
      await expect(page.getByRole("img", { name: quote })).toBeVisible();
      await page.goto("/admin/conteudo/depoimentos");
      const row = page.locator("li").filter({ hasText: quote });
      await row.getByRole("link", { name: "Editar" }).click();
      await attachPrint(page, "print-novo.png");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 20_000,
      });
      await page.goto("/");
      const swapped = page.getByRole("img", { name: quote });
      await expect(swapped).toBeVisible();
      await expect.poll(async () => swapped.getAttribute("src")).not.toBe(firstSrc);

      await page.goto("/admin/conteudo/depoimentos");
      await row.getByRole("link", { name: "Editar" }).click();
      await page.getByRole("button", { name: "Remover imagem" }).click();
      await page.getByRole("button", { name: "Remover", exact: true }).click();
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("link", { name: "Voltar para a lista" }).click();
      await expect(page.getByText(quote, { exact: true })).toBeVisible();
      await expect(page.getByText(`${quote} · com imagem`)).toHaveCount(0);
      await page.goto("/");
      await expect(page.getByRole("img", { name: quote })).toHaveCount(0);
      await expect(page.locator("blockquote", { hasText: quote })).toBeVisible();
    } finally {
      await removeStaff(userId);
    }
  });

  test("com imagem e sem consentimento o painel não publica", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `depoimento-sem-consentimento-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const stamp = crypto.randomUUID().slice(0, 8);
    const quote = `Print sem autorização ${stamp}.`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/depoimentos/novo");
      await page.getByLabel("Depoimento").fill(quote);
      await page.getByLabel("Quem falou").fill(`Família ${stamp}`);
      await attachPrint(page, "print.png");
      await expect(page.getByLabel("Publicar no site")).toBeChecked();
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(
        page.getByText("Publique só com a data do consentimento."),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByLabel("Publicar no site").uncheck();
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Depoimento criado.")).toBeVisible({ timeout: 20_000 });
      const row = page.locator("li").filter({ hasText: quote });
      await row.getByRole("button", { name: "Publicar" }).click();
      await expect(row.getByText("Publique só com a data do consentimento.")).toBeVisible(
        {
          timeout: 15_000,
        },
      );
      await page.goto("/");
      await expect(page.getByRole("img", { name: quote })).toHaveCount(0);
      await expect(page.getByText(quote)).toHaveCount(0);
    } finally {
      await removeStaff(userId);
    }
  });
});
