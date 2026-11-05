import postgres from "postgres";

import { expect, type Page, test } from "@playwright/test";

import { createStaff, loadLocalEnv, removeStaff, signIn } from "./staff-fixtures";

const NAV_ITEMS = [
  "Início",
  "Sobre",
  "Serviços",
  "Materiais",
  "Contato",
  "Agendar avaliação",
] as const;

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function restoreContact(
  number: string,
  message: string,
  instagram: string,
): Promise<void> {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Ambiente local ausente.");
  const digits = number.replace(/\D/g, "");
  const handle = instagram.trim() || null;
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5 });
  try {
    await sql`
      update content.site_settings
      set whatsapp_number = ${digits || null},
          whatsapp_message = ${message},
          instagram_handle = ${handle}
      where id = 1
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

test("o menu até 1024 px e o rodapé reorganizado", async ({ page, browser }) => {
  test.skip(process.env.EMPTY_SITE === "1", "precisa de WhatsApp e Instagram");
  test.setTimeout(240_000);
  const email = `chrome-${crypto.randomUUID()}@example.com`;
  const userId = await createStaff(email, "CONTENT_ADMIN");
  let previousNumber = "";
  let previousMessage = "";
  let previousInstagram = "";
  let changed = false;
  const visitor = await browser.newPage();
  try {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/conteudo/site");
    const contact = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Contato" }) });
    previousNumber = await contact.getByLabel("WhatsApp").inputValue();
    previousMessage = await contact.getByLabel("Mensagem").inputValue();
    await contact.getByLabel("WhatsApp").fill("5511999999999");
    await contact.getByLabel("Mensagem").fill("Olá");
    await contact.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();

    const search = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Busca e redes" }) });
    previousInstagram = await search.getByLabel("Instagram").inputValue();
    await search.getByLabel("Instagram").fill("adrielliflores");
    await search.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
    changed = true;

    await visitor.setViewportSize({ width: 768, height: 800 });
    await visitor.goto("/");
    await expect(visitor.getByText("Agendar avaliação")).toBeAttached();
    const menu = visitor.getByRole("button", { name: "Abrir menu" });
    await expect(menu).toBeVisible();
    const nav = visitor.getByRole("navigation", { name: "Principal" });
    await expect(nav).toBeHidden();
    await menu.click();
    await expect(visitor.getByRole("button", { name: "Fechar menu" })).toBeVisible();
    for (const name of NAV_ITEMS) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }

    await visitor.setViewportSize({ width: 1280, height: 800 });
    await visitor.goto("/");
    await expect(visitor.getByRole("button", { name: "Abrir menu" })).toBeHidden();
    await expect(nav.getByRole("link", { name: "Início" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Início" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    for (const width of [375, 1280]) {
      await visitor.setViewportSize({ width, height: 800 });
      await visitor.goto("/");
      expect(await overflowX(visitor)).toBeLessThanOrEqual(1);
      const phrase = visitor.getByText("A etapa 1 começa com uma mensagem.");
      const whatsapp = visitor.getByRole("link", { name: "Chamar no WhatsApp" });
      await phrase.scrollIntoViewIfNeeded();
      const phraseBox = await phrase.boundingBox();
      const whatsappBox = await whatsapp.boundingBox();
      expect(phraseBox).not.toBeNull();
      expect(whatsappBox).not.toBeNull();
      if (phraseBox && whatsappBox) {
        expect(phraseBox.y + phraseBox.height).toBeLessThanOrEqual(whatsappBox.y + 1);
      }
      const footerNav = visitor.getByRole("navigation", { name: "Rodapé" });
      const instagram = footerNav.getByRole("link", { name: "Instagram" });
      const privacy = footerNav.getByRole("link", { name: "Privacidade" });
      await instagram.scrollIntoViewIfNeeded();
      const instagramBox = await instagram.boundingBox();
      const privacyBox = await privacy.boundingBox();
      expect(instagramBox).not.toBeNull();
      expect(privacyBox).not.toBeNull();
      if (instagramBox && privacyBox) {
        expect(Math.abs(instagramBox.y - privacyBox.y)).toBeLessThanOrEqual(1);
      }
    }
  } finally {
    await visitor.close();
    try {
      if (changed)
        await restoreContact(previousNumber, previousMessage, previousInstagram);
    } finally {
      await removeStaff(userId);
    }
  }
});
