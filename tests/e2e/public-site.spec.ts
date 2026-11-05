import { mkdirSync } from "node:fs";
import postgres from "postgres";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { createStaff, loadLocalEnv, removeStaff, signIn } from "./staff-fixtures";

const WHATSAPP_HREF = "https://wa.me/5511999999999?text=Ol%C3%A1";

function overlaps(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function floatingWhatsApp(page: Page): Locator {
  return page.locator('a[aria-label="Conversar pelo WhatsApp"]');
}

async function expectClearOfButton(link: Locator, button: Locator): Promise<void> {
  const linkBox = await link.boundingBox();
  const buttonBox = await button.boundingBox();
  expect(linkBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  if (!linkBox || !buttonBox) return;
  expect(buttonBox.width).toBeGreaterThanOrEqual(48);
  expect(buttonBox.height).toBeGreaterThanOrEqual(48);
  expect(overlaps(linkBox, buttonBox)).toBe(false);
}

async function restoreWhatsapp(number: string, message: string): Promise<void> {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Ambiente local ausente.");
  const digits = number.replace(/\D/g, "");
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5 });
  try {
    await sql`
      update content.site_settings
      set whatsapp_number = ${digits || null},
          whatsapp_message = ${message}
      where id = 1
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function saveContact(page: Page, number: string, message: string): Promise<void> {
  await page.goto("/admin/conteudo/site");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Contato" }) });
  await form.getByLabel("WhatsApp").fill(number);
  await form.getByLabel("Mensagem").fill(message);
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
}

const PAGES = [
  "/",
  "/sobre",
  "/servicos",
  "/contato",
  "/privacidade",
  "/materiais",
] as const;

test.describe("site público", () => {
  for (const width of [360, 1280]) {
    test(`responde nas páginas públicas em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of PAGES) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(
          page.getByRole("banner").getByRole("link", { name: "Adrielli Flores" }),
        ).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Rodapé" })).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      }
      await expect(page.getByText("Em breve.")).toBeVisible();
    });
  }

  test("a privacidade está no rodapé sem aviso de rascunho", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Rodapé" })
      .getByRole("link", { name: "Privacidade" })
      .click();
    await expect(page).toHaveURL(/\/privacidade$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacidade" }),
    ).toBeVisible();
    await expect(page.getByText(/rascunho para revisão/)).toHaveCount(0);
    await expect(page.getByText(/não substitui orientação jurídica/)).toHaveCount(0);
    await expect(page.getByText("Adrielli Flores").first()).toBeVisible();
  });

  test("salvar no CMS aparece no site e o serviço oculto fica de fora", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const email = `publico-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    let previousNumber = "";
    let previousMessage = "";
    let changedContact = false;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      const name = `Nome ${crypto.randomUUID().slice(0, 8)}`;
      await page.goto("/admin/conteudo/site");
      await page.getByLabel("Nome").fill(name);
      await page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: "Topo" }) })
        .getByRole("button", { name: "Salvar" })
        .click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Materiais" })).toBeVisible();
      await page.getByRole("link", { name: "Ver materiais" }).click();
      await expect(page).toHaveURL(/\/materiais$/);

      const title = `Serviço ${crypto.randomUUID().slice(0, 8)}`;
      await page.goto("/admin/conteudo/servicos/novo");
      await page.getByLabel("Título").fill(title);
      await page.getByLabel("Resumo").fill("Resumo curto.");
      await page.getByLabel("Texto").fill("Texto do serviço.");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/[0-9a-f-]{36}$/, {
        timeout: 20_000,
      });
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
      await page.goto("/admin/conteudo/servicos");
      const row = page.locator("li").filter({ hasText: title });
      await row.getByRole("button", { name: "Publicar" }).click();
      await expect(row.getByText("Publicado")).toBeVisible({ timeout: 15_000 });
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: title })).toBeVisible({
        timeout: 15_000,
      });

      await page.goto("/admin/conteudo/site");
      const form = page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: "Contato" }) });
      previousNumber = await form.getByLabel("WhatsApp").inputValue();
      previousMessage = await form.getByLabel("Mensagem").inputValue();
      await saveContact(page, "5511999999999", "Olá");
      changedContact = true;
      await page.goto("/equipe/sair");
      await expect(page).toHaveURL(/\/equipe\/entrar/);
      await expect(
        page.getByRole("link", { name: "Conversar pelo WhatsApp" }),
      ).toHaveCount(0);

      mkdirSync("test-results/l2-capturas", { recursive: true });
      for (const path of ["/", "/contato"]) {
        await page.goto(path);
        const button = floatingWhatsApp(page);
        await expect(button).toBeVisible();
        await expect(button).toHaveAttribute("href", WHATSAPP_HREF);
        await expect(button).toHaveAttribute("target", "_blank");
        await expect(button).toHaveAttribute("rel", "noopener noreferrer");
      }

      await page.goto("/");
      const heroWhatsApp = page
        .getByRole("main")
        .getByRole("link", { name: "Conversar pelo WhatsApp" });
      await expect(heroWhatsApp).toBeVisible();
      await expect(heroWhatsApp).toHaveAttribute("href", WHATSAPP_HREF);
      await expect(heroWhatsApp).toHaveAttribute("target", "_blank");
      const schedule = page
        .getByRole("banner")
        .getByRole("link", { name: "Agendar avaliação" });
      await expect(schedule).toBeVisible();
      await expect(schedule).toHaveAttribute("href", WHATSAPP_HREF);
      const footerWhatsApp = page.getByRole("link", { name: "Chamar no WhatsApp" });
      await expect(footerWhatsApp).toBeVisible();
      await expect(footerWhatsApp).toHaveAttribute("href", WHATSAPP_HREF);
      await expect(page.getByText("A etapa 1 começa com uma mensagem.")).toBeVisible();

      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto("/");
      await page.getByRole("heading", { name: "Materiais" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: "test-results/l2-capturas/celular-360.png" });
      const privacy = page
        .getByRole("navigation", { name: "Rodapé" })
        .getByRole("link", { name: "Privacidade" });
      await privacy.scrollIntoViewIfNeeded();
      await expectClearOfButton(privacy, floatingWhatsApp(page));
      const mobilePad = await page
        .locator("footer > div")
        .evaluate((element) => getComputedStyle(element).paddingBottom);
      expect(Number.parseFloat(mobilePad)).toBeGreaterThan(24);
      await page.screenshot({ path: "test-results/l2-capturas/celular-360-rodape.png" });
      await privacy.click();
      await expect(page).toHaveURL(/\/privacidade$/);

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");
      await page.getByRole("heading", { name: "Materiais" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: "test-results/l2-capturas/desktop-1280.png" });
      await privacy.scrollIntoViewIfNeeded();
      await expectClearOfButton(privacy, floatingWhatsApp(page));
      const desktopPad = await page
        .locator("footer > div")
        .evaluate((element) => getComputedStyle(element).paddingBottom);
      expect(desktopPad).toBe("40px");
      await page.screenshot({ path: "test-results/l2-capturas/desktop-1280-rodape.png" });
      await restoreWhatsapp(previousNumber, previousMessage);
      changedContact = false;
    } finally {
      try {
        if (changedContact) await restoreWhatsapp(previousNumber, previousMessage);
      } finally {
        await removeStaff(userId);
      }
    }
  });

  test("as abas de Como funciona respondem ao teclado", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(page.getByText("Etapa 1 de 4")).toBeVisible();
    await tabs.first().focus();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(tabs.first()).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Etapa 2 de 4")).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(tabs.first()).toBeFocused();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Etapa 1 de 4")).toBeVisible();

    await page.keyboard.press("End");
    await expect(tabs.last()).toBeFocused();
    await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Etapa 4 de 4")).toBeVisible();

    await page.keyboard.press("Home");
    await expect(tabs.first()).toBeFocused();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Etapa 1 de 4")).toBeVisible();
  });

  test("a linha dourada termina no último marcador a 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("tab")).toHaveCount(4);
    const tablist = page.locator("#como-funciona [role='tablist']");
    await tablist.scrollIntoViewIfNeeded();
    const alignment = await tablist.evaluate((list) => {
      const line = list.previousElementSibling;
      const tabs = list.querySelectorAll('[role="tab"]');
      const marker = tabs[tabs.length - 1]?.querySelector("span");
      if (!(line instanceof HTMLElement) || !(marker instanceof HTMLElement)) {
        return { ok: false, delta: Number.POSITIVE_INFINITY };
      }
      const lineRight = line.getBoundingClientRect().right;
      const markerBox = marker.getBoundingClientRect();
      return {
        ok: true,
        delta: Math.abs(lineRight - (markerBox.left + markerBox.width / 2)),
      };
    });
    expect(alignment.ok).toBe(true);
    expect(alignment.delta).toBeLessThanOrEqual(2);
  });
});
