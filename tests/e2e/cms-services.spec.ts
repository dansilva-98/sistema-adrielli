import { expect, type Page, test } from "@playwright/test";

import { createStaff, removeStaff, signIn } from "./staff-fixtures";

async function fillService(page: Page, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Novo serviço" })).toBeVisible();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Resumo").fill("Resumo curto.");
  await page.getByLabel("Texto").fill(`Texto de ${title}.`);
  await expect(page.getByLabel("Publicar no site")).toBeChecked();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço criado.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Serviços" })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
}

test.describe("vários serviços no CMS", () => {
  test("cria 3 serviços seguidos e os três aparecem em /servicos", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-tres-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const stamp = crypto.randomUUID().slice(0, 8);
    const titles = [`Serviço A ${stamp}`, `Serviço B ${stamp}`, `Serviço C ${stamp}`];
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      for (const title of titles) {
        await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
        await fillService(page, title);
      }
      await page.goto("/servicos");
      for (const title of titles) {
        await expect(page.getByRole("heading", { name: title })).toBeVisible();
      }
    } finally {
      await removeStaff(userId);
    }
  });

  test("editar um serviço não altera os outros", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-editar-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const stamp = crypto.randomUUID().slice(0, 8);
    const first = `Serviço um ${stamp}`;
    const second = `Serviço dois ${stamp}`;
    const third = `Serviço três ${stamp}`;
    const edited = `Serviço dois editado ${stamp}`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      for (const title of [first, second, third]) {
        await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
        await fillService(page, title);
      }
      const row = page.locator("li").filter({ hasText: second });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(
        page.getByRole("heading", { name: `Editar serviço: ${second}` }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Voltar para a lista" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Adicionar outro serviço" }),
      ).toBeVisible();
      await page.getByLabel("Título").fill(edited);
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
      await page.getByRole("link", { name: "Voltar para a lista" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos(\?|$)/);
      const rows = page.locator("ul > li");
      await expect(rows.filter({ hasText: first })).toBeVisible();
      await expect(rows.filter({ hasText: edited })).toBeVisible();
      await expect(rows.filter({ hasText: third })).toBeVisible();
      await expect(
        rows.filter({ has: page.getByText(second, { exact: true }) }),
      ).toHaveCount(0);
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: first })).toBeVisible();
      await expect(page.getByRole("heading", { name: edited })).toBeVisible();
      await expect(page.getByRole("heading", { name: third })).toBeVisible();
      await expect(page.getByRole("heading", { name: second })).toHaveCount(0);
    } finally {
      await removeStaff(userId);
    }
  });
});
