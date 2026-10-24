import { expect, test } from "@playwright/test";

import { createStaff, removeStaff, signIn } from "./staff-fixtures";

const PAGES = ["/", "/sobre", "/servicos", "/contato", "/materiais"] as const;

test.describe("site público", () => {
  for (const width of [360, 1280]) {
    test(`responde nas páginas públicas em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of PAGES) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(
          page.getByRole("banner").getByRole("link", { name: "Adrielli Flores" }),
        ).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Rodapé" })).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      }
      await expect(page.getByText("Em breve.")).toBeVisible();
    });
  }

  test("salvar no CMS aparece no site e o serviço oculto fica de fora", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `publico-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      const name = `Nome ${crypto.randomUUID().slice(0, 8)}`;
      await page.goto("/admin/conteudo/site");
      await page.getByLabel("Nome").fill(name);
      await page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: "Topo" }) })
        .getByRole("button", { name: "Salvar" })
        .click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

      const title = `Serviço ${crypto.randomUUID().slice(0, 8)}`;
      await page.goto("/admin/conteudo/servicos/novo");
      await page.getByLabel("Título").fill(title);
      await page.getByLabel("Resumo").fill("Resumo curto.");
      await page.getByLabel("Texto").fill("Texto do serviço.");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/[0-9a-f-]{36}$/, {
        timeout: 20_000,
      });
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
      await page.goto("/admin/conteudo/servicos");
      const row = page.locator("li").filter({ hasText: title });
      await row.getByRole("button", { name: "Publicar" }).click();
      await expect(row.getByText("Publicado")).toBeVisible({ timeout: 15_000 });
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: title })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await removeStaff(userId);
    }
  });
});
