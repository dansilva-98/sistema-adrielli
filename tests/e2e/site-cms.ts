import { expect, type Page } from "@playwright/test";

export async function saveContact(
  page: Page,
  number: string,
  message: string,
): Promise<void> {
  await page.goto("/admin/conteudo/site");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Contato" }) });
  await form.getByLabel("WhatsApp").fill(number);
  await form.getByLabel("Mensagem").fill(message);
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
}

export async function saveInstagram(page: Page, handle: string): Promise<void> {
  await page.goto("/admin/conteudo/site");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Busca e redes" }) });
  await form.getByLabel("Instagram").fill(handle);
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
}
