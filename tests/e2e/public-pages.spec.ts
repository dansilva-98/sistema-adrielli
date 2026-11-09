import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { expectPublishedService, expectServiceAbsent } from "./public-service-visibility";
import { saveContact, saveInstagram } from "./site-cms";
import { createStaff, ownerSql, removeStaff, signIn } from "./staff-fixtures";

const PAGES = [
  { path: "/sobre", heading: /Sobre|Quem é/, capture: "sobre" },
  { path: "/servicos", heading: "Como posso ajudar seu filho.", capture: "servicos" },
  { path: "/contato", heading: "Vamos conversar sobre seu filho?", capture: "contato" },
] as const;

const LAYOUT_WIDTHS = [320, 360, 768, 1024, 1280] as const;
const CAPTURE_WIDTHS = [360, 1280] as const;
const EXAMPLE_ABOUT =
  "Acompanho o desenvolvimento da criança com um plano claro. Cada etapa é combinada com a família.";
const EXAMPLE_SERVICES = ["Exemplo: avaliação", "Exemplo: intervenção"] as const;

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function overflowReport(page: Page): Promise<string> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll("*")]
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.right <= limit + 1) return [];
        const className = typeof element.className === "string" ? element.className : "";
        return [
          `${element.tagName.toLowerCase()}.${className.split(/\s+/).slice(0, 3).join(".")} right=${Math.round(rect.right)} w=${Math.round(rect.width)}`,
        ];
      })
      .slice(0, 8)
      .join(" | ");
  });
}

async function expectPage(page: Page, path: string, heading: string | RegExp) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formação" })).toHaveCount(0);
}

async function expectStepLabelsFit(page: Page): Promise<void> {
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll("[data-step-label]")].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.height < 8 || rect.width < 8) return [];
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize) || 12;
      const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
      return [
        {
          text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
          lines: Math.round(rect.height / lineHeight),
          overflow: element.scrollWidth - element.clientWidth,
        },
      ];
    }),
  );
  for (const label of labels) {
    expect(label.overflow, label.text).toBeLessThanOrEqual(1);
    expect(label.lines, label.text).toBeLessThanOrEqual(2);
    expect(label.text.includes("/") && /[a-z]\/[a-z]/i.test(label.text)).toBe(false);
  }
}

async function fillService(page: Page, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Novo serviço" })).toBeVisible();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Resumo").fill("Resumo curto.");
  await page.getByLabel("Texto").fill(`Texto de ${title}.`);
  await expect(page.getByLabel("Publicar no site")).toBeChecked();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço criado.")).toBeVisible({ timeout: 20_000 });
}

async function refreshHiddenList(
  page: Page,
  path: string,
  allowPublish: boolean,
): Promise<void> {
  await page.goto(path);
  const row = page.locator("ul > li").first();
  if ((await row.count()) === 0) return;
  const hide = row.getByRole("button", { name: "Ocultar" });
  if ((await hide.count()) > 0) {
    await hide.click();
    await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (!allowPublish) return;
  await row.getByRole("button", { name: "Publicar" }).click();
  await expect(row.getByText("Publicado")).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Ocultar" }).click();
  await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
}

async function ensureExampleService(page: Page, title: string): Promise<void> {
  await page.goto("/admin/conteudo/servicos");
  const row = page.locator("ul > li").filter({ hasText: title }).first();
  if ((await row.count()) > 0) {
    const publish = row.getByRole("button", { name: "Publicar" });
    const hide = row.getByRole("button", { name: "Ocultar" });
    if ((await hide.count()) > 0) {
      await hide.click();
      await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
    }
    await row.getByRole("button", { name: "Publicar" }).click();
    await expect(row.getByText("Publicado")).toBeVisible({ timeout: 15_000 });
    return;
  }
  await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
  await fillService(page, title);
}

async function saveAbout(page: Page, title: string, body: string): Promise<void> {
  await page.goto("/admin/conteudo/site");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Sobre" }) });
  await form.getByLabel("Título").fill(title);
  await form.getByLabel("Texto").fill(body);
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
}

async function restorePublished(
  sql: ReturnType<typeof ownerSql>,
  table: "services" | "faq" | "testimonials",
  previous: { id: string; published: boolean }[],
): Promise<void> {
  for (const row of previous) {
    if (table === "services") {
      await sql`
        update content.services set published = ${row.published} where id = ${row.id}::uuid
      `;
    } else if (table === "faq") {
      await sql`
        update content.faq set published = ${row.published} where id = ${row.id}::uuid
      `;
    } else {
      await sql`
        update content.testimonials
        set published = ${row.published}
        where id = ${row.id}::uuid
      `;
    }
  }
  const ids = previous.map((row) => row.id);
  if (ids.length === 0) {
    if (table === "services") await sql`update content.services set published = false`;
    else if (table === "faq") await sql`update content.faq set published = false`;
    else await sql`update content.testimonials set published = false`;
    return;
  }
  if (table === "services") {
    await sql`update content.services set published = false where id not in ${sql(ids)}`;
  } else if (table === "faq") {
    await sql`update content.faq set published = false where id not in ${sql(ids)}`;
  } else {
    await sql`update content.testimonials set published = false where id not in ${sql(ids)}`;
  }
}

async function saveContactEmail(page: Page, email: string): Promise<void> {
  await page.goto("/admin/conteudo/site");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Contato" }) });
  await form.getByLabel("E-mail").fill(email);
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
}

for (const width of LAYOUT_WIDTHS) {
  test(`Sobre, Serviços e Contato respondem em ${width}px sem rolagem horizontal`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const item of PAGES) {
      await expectPage(page, item.path, item.heading);
      const overflow = await overflowX(page);
      expect(
        overflow,
        `${item.path} em ${width}px ${await overflowReport(page)}`,
      ).toBeLessThanOrEqual(1);
    }
    if (width <= 360) {
      await page.goto("/");
      await expectStepLabelsFit(page);
      expect(await overflowX(page)).toBeLessThanOrEqual(1);
      await page.goto("/contato");
      await expectStepLabelsFit(page);
      expect(await overflowX(page)).toBeLessThanOrEqual(1);
    }
  });
}

test("capturas 360 e 1280 com dados de exemplo", async ({ page }) => {
  test.setTimeout(240_000);
  const email = `paginas-captura-${crypto.randomUUID()}@example.com`;
  const userId = await createStaff(email, "CONTENT_ADMIN");
  const sql = ownerSql();
  const previousSite = await sql<
    {
      about_title: string;
      about_body: string;
      whatsapp_number: string | null;
      whatsapp_message: string;
      contact_email: string | null;
      instagram_handle: string | null;
    }[]
  >`
    select about_title, about_body, whatsapp_number, whatsapp_message, contact_email,
           instagram_handle
    from content.site_settings
    limit 1
  `;
  const previousServices = await sql<{ id: string; published: boolean }[]>`
    select id, published from content.services
  `;
  const previousFaq = await sql<{ id: string; published: boolean }[]>`
    select id, published from content.faq
  `;
  const previousTestimonials = await sql<{ id: string; published: boolean }[]>`
    select id, published from content.testimonials
  `;
  try {
    await sql`
      update content.services
      set published = false
      where title not in ${sql([...EXAMPLE_SERVICES])}
    `;
    await sql`update content.faq set published = false`;
    await sql`update content.testimonials set published = false`;
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await refreshHiddenList(page, "/admin/conteudo/perguntas", true);
    await refreshHiddenList(page, "/admin/conteudo/depoimentos", false);
    await saveAbout(page, "Quem é Adrielli Flores", EXAMPLE_ABOUT);
    await saveContact(page, "5511999999999", "Olá");
    await saveContactEmail(page, "exemplo@adrielliflores.com.br");
    await saveInstagram(page, "adrielliflores");
    for (const title of EXAMPLE_SERVICES) {
      await ensureExampleService(page, title);
    }
    await page.goto("/servicos");
    for (const title of EXAMPLE_SERVICES) {
      await expectPublishedService(page, title);
    }
    mkdirSync("test-results/l3-capturas", { recursive: true });
    await page.goto("/equipe/sair");
    for (const width of CAPTURE_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const item of PAGES) {
        await expectPage(page, item.path, item.heading);
        if (item.path === "/sobre") {
          await expect(
            page.getByText("Acompanho o desenvolvimento da criança"),
          ).toBeVisible();
          await expect(
            page.getByText("Cada etapa é combinada com a família."),
          ).toBeVisible();
        }
        if (item.path === "/servicos") {
          for (const title of EXAMPLE_SERVICES) {
            await expectPublishedService(page, title);
          }
        }
        if (item.path === "/contato") {
          await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Instagram" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "E-mail" })).toBeVisible();
        }
        await page.screenshot({
          path: `test-results/l3-capturas/${item.capture}-${width}.png`,
        });
      }
    }
  } finally {
    const site = previousSite[0];
    if (site) {
      await sql`
        update content.site_settings
        set about_title = ${site.about_title},
            about_body = ${site.about_body},
            whatsapp_number = ${site.whatsapp_number},
            whatsapp_message = ${site.whatsapp_message},
            contact_email = ${site.contact_email},
            instagram_handle = ${site.instagram_handle}
      `;
    }
    await restorePublished(sql, "services", previousServices);
    await restorePublished(sql, "faq", previousFaq);
    await restorePublished(sql, "testimonials", previousTestimonials);
    await sql.end({ timeout: 5 });
    await removeStaff(userId);
  }
});

for (const item of PAGES) {
  test(`axe não encontra violações em ${item.path}`, async ({ page }) => {
    await page.goto(item.path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test("axe com dois serviços em 360 e 1280 px", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `paginas-servicos-${crypto.randomUUID()}@example.com`;
  const userId = await createStaff(email, "CONTENT_ADMIN");
  const stamp = crypto.randomUUID().slice(0, 8);
  const titles = [`Serviço axe A ${stamp}`, `Serviço axe B ${stamp}`];
  try {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/conteudo/servicos");
    for (const title of titles) {
      await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
      await fillService(page, title);
    }
    for (const width of CAPTURE_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/servicos");
      for (const title of titles) {
        await expectPublishedService(page, title);
      }
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    }
    await page.goto("/admin/conteudo/servicos");
    for (const title of titles) {
      const row = page.locator("ul > li").filter({ hasText: title });
      await row.getByRole("button", { name: "Ocultar" }).click();
      await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
    }
    await page.goto("/servicos");
    for (const title of titles) {
      await expectServiceAbsent(page, title);
    }
  } finally {
    await removeStaff(userId);
  }
});
