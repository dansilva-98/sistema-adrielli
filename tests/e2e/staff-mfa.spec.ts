import { expect, test } from "@playwright/test";

import {
  createStaff,
  enrollVerifiedTotp,
  factorCount,
  failureCount,
  removeStaff,
  signIn,
  totpCode,
} from "./staff-fixtures";

test.describe("MFA da equipe no Supabase local", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];

  test.afterAll(async () => {
    await Promise.all(created.map((id) => removeStaff(id)));
  });

  test("recarregar a configuração não cria fator e o código confirma o acesso", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = `mfa-novo-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "SUPER_ADMIN");
    created.push(userId);

    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/configurar$/);
    await page.reload();
    await page.reload();
    await expect(page.getByRole("button", { name: "Gerar código" })).toBeVisible();
    expect(await factorCount(userId)).toBe(0);

    await page.getByRole("button", { name: "Gerar código" }).click();
    const secret = await page.getByTestId("totp-secret").getAttribute("data-secret");
    expect(secret).toBeTruthy();
    await page.getByLabel("Código").fill(totpCode(secret ?? ""));
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    await expect(page.getByText("Application error")).toHaveCount(0);
  });

  test("quem já tem TOTP só entra com o código válido", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `mfa-ativo-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "SUPER_ADMIN");
    created.push(userId);
    const secret = await enrollVerifiedTotp(email);

    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    const current = totpCode(secret);
    const wrong = current === "000000" ? "111111" : "000000";
    await page.getByLabel("Código").fill(wrong);
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("Código inválido.")).toBeVisible();
    expect(await failureCount(userId)).toBeGreaterThan(0);

    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    await expect(page.getByText("Application error")).toHaveCount(0);
  });
});
