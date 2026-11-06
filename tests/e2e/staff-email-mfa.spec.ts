import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  codeFromStaffEmailSubject,
  latestMemoryStaffEmail,
} from "../../src/modules/identity/email-transport";
import {
  createStaff,
  enrollVerifiedTotp,
  removeStaff,
  signIn,
  totpCode,
} from "./staff-fixtures";

test.describe("MFA por e-mail da equipe", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];

  test.afterAll(async () => {
    await Promise.all(created.map((id) => removeStaff(id)));
  });

  test("entra no consultório com o código enviado por e-mail", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `mfa-email-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CLINIC_ADMIN"));
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    await expect(page.getByText(/Enviamos um código para /)).toBeVisible();
    const message = latestMemoryStaffEmail(email);
    expect(message).toBeTruthy();
    const code = codeFromStaffEmailSubject(message?.subject ?? "");
    expect(code).toMatch(/^\d{6}$/);
    await page.getByLabel("Código").fill(code ?? "");
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page).toHaveURL(/\/consultorio$/);
    await expect(page.getByRole("heading", { name: "Consultório" })).toBeVisible();
  });

  test("cinco códigos errados pedem outro código", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `mfa-lock-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CLINIC_ADMIN"));
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    await expect(page.getByLabel("Código")).toBeVisible();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.getByLabel("Código").fill("000000");
      await page.getByRole("button", { name: "Confirmar" }).click();
      if (attempt < 4) {
        await expect(page.getByRole("button", { name: "Confirmar" })).toBeEnabled();
      }
    }
    await expect(page.getByText("Peça um novo código.")).toBeVisible();
  });

  test("quem tem TOTP continua entrando pelo aplicativo", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `mfa-totp-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "SUPER_ADMIN"));
    const secret = await enrollVerifiedTotp(email);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("axe na tela de verificação", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `mfa-axe-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CLINIC_ADMIN"));
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
