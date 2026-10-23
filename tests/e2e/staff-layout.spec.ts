import { expect, test } from "@playwright/test";

import {
  createStaff,
  enrollVerifiedTotp,
  removeStaff,
  signIn,
  staffIdByEmail,
  totpCode,
} from "./staff-fixtures";

test.describe("layouts da equipe", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];

  test.afterAll(async () => {
    await Promise.all(created.map((id) => removeStaff(id)));
  });

  test("sem sessão a área não aparece", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText("Em construção")).toHaveCount(0);
    await expect(page.getByText("Dashboard")).toHaveCount(0);
    await expect(page.getByText("Entrar na equipe")).toBeVisible();
  });

  test("administração e consultório em 360px e 1280px", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `layout-super-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "SUPER_ADMIN"));
    const secret = await enrollVerifiedTotp(email);
    await signIn(page, email);
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();

    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 800 });
      const opened = await page.goto("/admin");
      expect(opened?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
      await expect(page.getByText("Em construção")).toBeVisible();
      await expect(page.getByText("Painel administrativo")).toBeVisible();
      await expect(page.locator('a[href="/equipe/sair"]')).toHaveCount(0);
      const leave = page.getByRole("button", { name: "Sair" });
      await expect(leave).toHaveAttribute("type", "submit");
      if (width === 360) {
        await page.getByRole("button", { name: "Menu" }).click();
      }
      await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
      await expect(page.getByText("SISTEMA")).toBeVisible();
      await expect(page.getByRole("link", { name: "Usuários" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }

    const clinic = await page.goto("/consultorio");
    expect(clinic?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Consultório" })).toBeVisible();
    await expect(page.getByText("Atendimento clínico")).toBeVisible();
    await expect(page.locator("[data-area=consultorio]")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trocar de área" })).toBeVisible();
  });

  test("conteúdo não vê usuários e o sair encerra a sessão", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `layout-conteudo-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CONTENT_ADMIN"));
    await signIn(page, email);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    const opened = await page.goto("/admin");
    expect(opened?.status()).toBe(200);
    await expect(page.getByText("Em construção")).toBeVisible();
    await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Trocar de área" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/equipe\/entrar$/);
    await expect(page.getByText("Entrar na equipe")).toBeVisible();
    await expect(page.getByText("Em construção")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Administração" })).toHaveCount(0);
  });

  test("super admin vê a lista de usuários", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `layout-lista-${crypto.randomUUID()}@example.com`;
    const name = "Lista da equipe";
    created.push(await createStaff(email, "SUPER_ADMIN"));
    const secret = await enrollVerifiedTotp(email);
    await signIn(page, email);
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    const response = await page.goto("/admin/usuarios");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Não foi possível carregar os usuários.")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "E-mail" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "MFA" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Situação" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Último login" })).toBeVisible();
    const ownRow = page.getByRole("row", { name: email });
    await expect(ownRow.getByRole("cell", { name: "sim" })).toBeVisible();
    await expect(ownRow.getByRole("button", { name: "Desativar" })).toHaveCount(0);
    await ownRow.getByRole("button", { name: "Alterar papéis" }).click();
    await expect(page.getByRole("dialog", { name: "Alterar papéis" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    const inviteEmail = `convite-${crypto.randomUUID()}@example.com`;
    const invite = page.locator("form").filter({
      has: page.getByRole("button", { name: "Enviar convite" }),
    });
    await invite.getByLabel("Nome").fill(name);
    await invite.getByLabel("E-mail").fill(inviteEmail);
    await invite.getByRole("checkbox", { name: "Conteúdo" }).check();
    await invite.getByRole("button", { name: "Enviar convite" }).click();
    try {
      await expect(invite.getByRole("status")).toHaveText("Convite enviado.", {
        timeout: 15_000,
      });
      await expect(page.getByRole("cell", { name })).toBeVisible();
    } finally {
      const invitedId = await staffIdByEmail(inviteEmail);
      if (invitedId) created.push(invitedId);
    }
  });
});
