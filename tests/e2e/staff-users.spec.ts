import { expect, type Page, test } from "@playwright/test";

import { LOGIN_ERROR_MESSAGE } from "../../src/modules/identity/staff-session";
import {
  createStaff,
  enrollVerifiedTotp,
  ownerSql,
  removeStaff,
  signIn,
  staffIdByEmail,
  staffPassword,
  totpCode,
} from "./staff-fixtures";

test.describe("gestão de usuários no Supabase local", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];
  let superId = "";
  let superEmail = "";
  let superSecret = "";
  let contentEmail = "";
  let contentSecret = "";

  test.beforeAll(async () => {
    superEmail = `gestao-super-${crypto.randomUUID()}@example.com`;
    contentEmail = `gestao-conteudo-${crypto.randomUUID()}@example.com`;
    superId = await createStaff(superEmail, "SUPER_ADMIN");
    created.push(superId);
    created.push(await createStaff(contentEmail, "CONTENT_ADMIN"));
    superSecret = await enrollVerifiedTotp(superEmail);
    contentSecret = await enrollVerifiedTotp(contentEmail);
  });

  test.afterAll(async () => {
    await Promise.all(created.map((id) => removeStaff(id)));
  });

  test("desativar pela interface corta o acesso e o login", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const staff = await browser.newContext();
    const staffPage = await staff.newPage();
    try {
      await signIn(staffPage, contentEmail);
      await expect(
        staffPage.getByRole("heading", { name: "Administração" }),
      ).toBeVisible();
      await openUsers(page, superEmail, superSecret);
      await confirmAccess(page, contentEmail, "Desativar", "Usuário desativado.");
      await staffPage.goto("/admin");
      await expect(staffPage.getByText("Entrar na equipe")).toBeVisible();
      await expect(staffPage.getByRole("heading", { name: "Administração" })).toHaveCount(
        0,
      );
      await signIn(staffPage, contentEmail);
      await expect(staffPage.getByText(LOGIN_ERROR_MESSAGE)).toBeVisible();
      await expect(staffPage.getByRole("heading", { name: "Administração" })).toHaveCount(
        0,
      );
    } finally {
      await staff.close();
    }
  });

  test("reativar devolve o acesso", async ({ page, browser }) => {
    test.setTimeout(90_000);
    await openUsers(page, superEmail, superSecret);
    await confirmAccess(page, contentEmail, "Reativar", "Usuário reativado.");
    const staff = await browser.newContext();
    const staffPage = await staff.newPage();
    try {
      await signIn(staffPage, contentEmail);
      await expect(
        staffPage.getByRole("heading", { name: "Administração" }),
      ).toBeVisible();
    } finally {
      await staff.close();
    }
  });

  test("trocar papéis muda o acesso às áreas", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const staff = await browser.newContext();
    const staffPage = await staff.newPage();
    try {
      await signIn(staffPage, contentEmail);
      await expect(
        staffPage.getByRole("heading", { name: "Administração" }),
      ).toBeVisible();
      await openUsers(page, superEmail, superSecret);
      const dialog = await openRoleDialog(page, contentEmail);
      await dialog.getByRole("checkbox", { name: "Conteúdo" }).uncheck();
      await dialog.getByRole("checkbox", { name: "Consultório" }).check();
      await dialog.getByRole("button", { name: "Confirmar" }).click();
      await expect(dialog.getByRole("status")).toHaveText("Papéis atualizados.", {
        timeout: 15_000,
      });
      const denied = await staffPage.goto("/admin");
      await expect(staffPage.getByText("Você não tem acesso a esta área.")).toBeVisible();
      expect(staffPage.url()).toContain("/acesso-negado");
      expect(denied?.status()).toBe(403);
      await staffPage.goto("/equipe/sair");
      await signIn(staffPage, contentEmail);
      await staffPage.getByLabel("Código").fill(totpCode(contentSecret));
      await staffPage.getByRole("button", { name: "Verificar" }).click();
      await expect(staffPage.getByRole("heading", { name: "Consultório" })).toBeVisible();
    } finally {
      await staff.close();
    }
  });

  test("convite completo até o primeiro login", async ({ page }) => {
    test.setTimeout(90_000);
    const inviteEmail = `convite-${crypto.randomUUID()}@example.com`;
    const name = "Convidada da equipe";
    try {
      await openUsers(page, superEmail, superSecret);
      const invite = page.locator("form").filter({
        has: page.getByRole("button", { name: "Enviar convite" }),
      });
      await invite.getByLabel("Nome").fill(name);
      await invite.getByLabel("E-mail").fill(inviteEmail);
      await invite.getByRole("checkbox", { name: "Conteúdo" }).check();
      await invite.getByRole("button", { name: "Enviar convite" }).click();
      await expect(invite.getByRole("status")).toHaveText("Convite enviado.", {
        timeout: 15_000,
      });
      const tokenHash = await inviteTokenHash(inviteEmail);
      await page.goto(
        `/equipe/primeiro-acesso?token_hash=${encodeURIComponent(tokenHash)}`,
      );
      await page.getByLabel("Senha").fill(staffPassword);
      await page.getByRole("button", { name: "Criar senha" }).click();
      await expect(page.getByText("Senha redefinida. Entre novamente.")).toBeVisible();
      await signIn(page, inviteEmail);
      await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    } finally {
      const invitedId = await staffIdByEmail(inviteEmail);
      if (invitedId) await removeStaff(invitedId);
    }
  });

  test("o último super admin não perde o papel nem se desativa", async ({ page }) => {
    test.setTimeout(90_000);
    const restore = await keepOnlySuperAdmins([superId]);
    try {
      await openUsers(page, superEmail, superSecret);
      const row = page.getByRole("row", { name: superEmail });
      await expect(row.getByRole("button", { name: "Desativar" })).toHaveCount(0);
      const dialog = await openRoleDialog(page, superEmail);
      await dialog.getByRole("checkbox", { name: "Super admin" }).uncheck();
      await dialog.getByRole("checkbox", { name: "Conteúdo" }).check();
      await dialog.getByRole("button", { name: "Confirmar" }).click();
      await expect(dialog.getByRole("status")).toHaveText(
        "A equipe precisa de um super admin ativo.",
        { timeout: 15_000 },
      );
      await page.getByRole("button", { name: "Close" }).click();
      await expect(row.getByRole("cell", { name: "Super admin" })).toBeVisible();
    } finally {
      await restore();
    }
  });
});

async function openUsers(page: Page, email: string, secret: string): Promise<void> {
  await signIn(page, email);
  await page.getByLabel("Código").fill(totpCode(secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  await page.goto("/admin/usuarios");
  await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
}

async function confirmAccess(
  page: Page,
  email: string,
  button: "Desativar" | "Reativar",
  message: string,
): Promise<void> {
  const row = page.getByRole("row", { name: email });
  await row.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog", {
    name: button === "Desativar" ? "Desativar usuário" : "Reativar usuário",
  });
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
}

async function openRoleDialog(page: Page, email: string) {
  const row = page.getByRole("row", { name: email });
  await row.getByRole("button", { name: "Alterar papéis" }).click();
  const dialog = page.getByRole("dialog", { name: "Alterar papéis" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function inviteTokenHash(email: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const listed = await fetch(
      `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (listed.ok) {
      const body: unknown = await listed.json();
      const id = firstMessageId(body);
      if (id) {
        const message = await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`);
        if (message.ok) {
          const detail: unknown = await message.json();
          const html = messageHtml(detail);
          const token = html.match(/token_hash=([^"&\s]+)/)?.[1];
          if (token) return decodeURIComponent(token);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("O convite não chegou à caixa de e-mail local.");
}

function firstMessageId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("messages" in body)) return null;
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const first = messages[0];
  if (typeof first !== "object" || first === null) return null;
  if ("ID" in first && typeof first.ID === "string") return first.ID;
  if ("id" in first && typeof first.id === "string") return first.id;
  return null;
}

function messageHtml(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  if ("HTML" in body && typeof body.HTML === "string") return body.HTML;
  if ("html" in body && typeof body.html === "string") return body.html;
  return "";
}

async function keepOnlySuperAdmins(
  keepIds: readonly string[],
): Promise<() => Promise<void>> {
  const sql = ownerSql();
  let paused: string[] = [];
  try {
    const others = await sql<{ id: string }[]>`
      select u.id
      from identity.users u
      inner join identity.user_roles r on r.user_id = u.id
      where u.kind = 'STAFF'
        and u.disabled_at is null
        and r.role = 'SUPER_ADMIN'
        and u.id not in ${sql([...keepIds])}
    `;
    paused = others.map((row) => row.id);
    if (paused.length > 0) {
      await sql`
        update identity.users
        set disabled_at = now()
        where id in ${sql(paused)}
      `;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  return async () => {
    if (paused.length === 0) return;
    const restore = ownerSql();
    try {
      await restore`
        update identity.users
        set disabled_at = null
        where id in ${restore(paused)}
      `;
    } finally {
      await restore.end({ timeout: 5 });
    }
  };
}
