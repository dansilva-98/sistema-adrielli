import { expect, test } from "@playwright/test";

test("sem endereço não há Ver no mapa na home nem no contato", async ({ page }) => {
  test.skip(process.env.EMPTY_SITE !== "1", "só roda contra o banco sem conteúdo");
  for (const path of ["/", "/contato"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Ver no mapa" })).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.getByText("Atendimento presencial")).toHaveCount(0);
});

test("o site segue apresentável com o banco sem conteúdo", async ({ page }) => {
  test.skip(process.env.EMPTY_SITE !== "1", "só roda contra o banco sem conteúdo");
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Adrielli Flores" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Rodapé" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Adrielli Flores" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Como funciona" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Depoimentos" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Perguntas frequentes" })).toHaveCount(
    0,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.getByRole("heading", { name: "Materiais" })).toBeVisible();
  await expect(page.getByText("Em breve", { exact: true })).toBeVisible();
  await expect(page.getByText("A etapa 1 começa com uma mensagem.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Conversar pelo WhatsApp" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Agendar avaliação" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Chamar no WhatsApp" })).toHaveCount(0);
  await page.getByRole("link", { name: "Ver materiais" }).click();
  await expect(page).toHaveURL(/\/materiais$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Privacidade" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacidade" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "O e-mail de contato para assuntos de dados ainda vai ser cadastrado.",
    ),
  ).toBeVisible();
});
