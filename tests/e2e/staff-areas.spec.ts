import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  readStaffSession,
  SESSION_EXPIRED_MESSAGE,
  signStaffSession,
  STAFF_IDLE_MS,
  STAFF_SESSION_COOKIE,
} from "../../src/modules/identity/staff-session";
import {
  createStaff,
  disableStaff,
  enrollVerifiedTotp,
  expiredAuditCount,
  loadLocalEnv,
  removeStaff,
  signIn,
  totpCode,
} from "./staff-fixtures";

test.describe("áreas da equipe", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];

  test.afterAll(async () => {
    await Promise.all(created.map((id) => removeStaff(id)));
  });

  test("CONTENT_ADMIN abre a administração e recebe 403 nas outras áreas", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = `area-conteudo-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CONTENT_ADMIN"));
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    const opened = await page.goto("/admin");
    expect(opened?.status()).toBe(200);
    await expectDenied(page, "/consultorio");
    await expectDenied(page, "/admin/usuarios");
  });

  test("CLINIC_ADMIN abre o consultório e recebe 403 na administração", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = `area-clinica-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CLINIC_ADMIN"));
    const secret = await enrollVerifiedTotp(email);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/consultorio$/);
    await expect(page.getByRole("heading", { name: "Consultório" })).toBeVisible();
    await expectDenied(page, "/admin");
  });

  test("SUPER_ADMIN abre as três áreas", async ({ page }) => {
    test.setTimeout(90_000);
    const email = `area-super-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "SUPER_ADMIN"));
    const secret = await enrollVerifiedTotp(email);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    const users = await page.goto("/admin/usuarios");
    expect(users?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    const clinic = await page.goto("/consultorio");
    expect(clinic?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Consultório" })).toBeVisible();
  });

  test("navegar na administração renova a última atividade", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const email = `area-atividade-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CONTENT_ADMIN"));
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    const before = await activity(context);
    await page.waitForTimeout(1100);
    const reloaded = await page.goto("/admin");
    expect(reloaded?.status()).toBe(200);
    const after = await activity(context);
    expect(after).toBeGreaterThan(before);
  });

  test("cookies antigos depois de sair voltam para o login", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const email = `area-sair-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CONTENT_ADMIN"));
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    const saved = await context.cookies();
    await page.goto("/equipe/sair");
    await expect(page).toHaveURL(/\/equipe\/entrar/);
    await context.clearCookies();
    await context.addCookies(saved);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/equipe\/entrar/);
    await expect(page.getByText("Entrar na equipe")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Administração" })).toHaveCount(0);
  });

  test("usuário desativado perde o acesso na próxima requisição", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const email = `area-desativado-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    created.push(userId);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    await disableStaff(userId);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/equipe\/entrar/);
    await expect(page.getByText("Entrar na equipe")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Administração" })).toHaveCount(0);
    expect(await staffCookie(context)).toBeUndefined();
  });

  test("sessão expirada pede novo login, apaga o cookie e grava a auditoria", async ({
    page,
    context,
  }) => {
    loadLocalEnv();
    const secret = process.env.STAFF_SESSION_SECRET;
    if (!secret) throw new Error("STAFF_SESSION_SECRET ausente.");
    const userId = crypto.randomUUID();
    const now = Date.now();
    const token = signStaffSession(
      {
        userId,
        sessionId: "sessao-expirada",
        startedAt: now - STAFF_IDLE_MS - 5_000,
        lastActivity: now - STAFF_IDLE_MS - 1_000,
      },
      secret,
    );
    await context.addCookies([
      {
        name: STAFF_SESSION_COOKIE,
        value: token,
        url: "http://127.0.0.1:3000",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/equipe\/entrar\?motivo=sessao/);
    await expect(page.getByText(SESSION_EXPIRED_MESSAGE)).toBeVisible();
    expect(await staffCookie(context)).toBeUndefined();
    expect(await expiredAuditCount(userId)).toBeGreaterThan(0);
  });
});

async function expectDenied(page: Page, path: string) {
  const response = await page.goto(path);
  await expect(page.getByText("Você não tem acesso a esta área.")).toBeVisible();
  expect(page.url()).toContain("/acesso-negado");
  expect(response?.status()).toBe(403);
}

async function staffCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === STAFF_SESSION_COOKIE);
}

async function activity(context: BrowserContext): Promise<number> {
  loadLocalEnv();
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) throw new Error("STAFF_SESSION_SECRET ausente.");
  const cookie = await staffCookie(context);
  if (!cookie) throw new Error("Cookie da equipe ausente.");
  const session = readStaffSession(cookie.value, secret);
  if (!session) throw new Error("Cookie da equipe inválido.");
  return session.lastActivity;
}
