import { expect, type Page } from "@playwright/test";

export const PAGES = [
  { path: "/sobre", heading: /Sobre|Quem é/, capture: "sobre" },
  { path: "/servicos", heading: "Como posso ajudar seu filho.", capture: "servicos" },
  { path: "/contato", heading: "Vamos conversar sobre seu filho?", capture: "contato" },
] as const;

export const CAPTURE_WIDTHS = [360, 1280] as const;

export async function expectPage(page: Page, path: string, heading: string | RegExp) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formação" })).toHaveCount(0);
}

export async function fillService(page: Page, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Novo serviço" })).toBeVisible();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Resumo").fill("Resumo curto.");
  await page.getByLabel("Texto").fill(`Texto de ${title}.`);
  await expect(page.getByLabel("Publicar no site")).toBeChecked();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço criado.")).toBeVisible({ timeout: 20_000 });
}
