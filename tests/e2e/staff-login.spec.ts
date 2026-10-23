import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { expect, test } from "@playwright/test";

import {
  SESSION_EXPIRED_MESSAGE,
  signStaffSession,
  STAFF_SESSION_COOKIE,
} from "../../src/modules/identity/staff-session";

test("sessão da equipe expirada pede novo login", async ({ page, context }) => {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) throw new Error("STAFF_SESSION_SECRET ausente.");
  const token = signStaffSession(
    {
      userId: "11111111-1111-1111-1111-111111111111",
      sessionId: "session-expirada",
      startedAt: 0,
      lastActivity: 0,
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

  await page.goto("/equipe/entrar");
  await expect(page.getByText("Entrar na equipe")).toBeVisible();
  await expect(page.getByText(SESSION_EXPIRED_MESSAGE)).toBeVisible();
});

test("configurar o autenticador sem sessão volta para o login", async ({ page }) => {
  await page.goto("/equipe/mfa/configurar");
  await expect(page).toHaveURL(/\/equipe\/entrar$/);
  await expect(page.getByText("Entrar na equipe")).toBeVisible();
});
