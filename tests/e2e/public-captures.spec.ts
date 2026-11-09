import { mkdirSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { CAPTURE_WIDTHS, expectPage, fillService, PAGES } from "./public-pages-fixtures";
import { expectPublishedService } from "./public-service-visibility";
import { saveContact, saveInstagram } from "./site-cms";
import { createStaff, ownerSql, removeStaff, signIn } from "./staff-fixtures";

const CAPTURE_DIR = "test-results/l3-capturas";
const EXAMPLE_ABOUT =
  "Acompanho o desenvolvimento da criança com um plano claro. Cada etapa é combinada com a família.";
const EXAMPLE_SERVICES = ["Exemplo: avaliação", "Exemplo: intervenção"] as const;

type Sql = ReturnType<typeof ownerSql>;

function contentRow(page: Page, label: string) {
  return page
    .locator("ul > li")
    .filter({ has: page.locator("p.font-medium", { hasText: label }) })
    .first();
}

async function hideRow(page: Page, label: string): Promise<void> {
  const row = contentRow(page, label);
  const hide = row.getByRole("button", { name: "Ocultar" });
  if ((await hide.count()) === 0) return;
  await hide.click();
  await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
}

async function publishRow(page: Page, label: string): Promise<void> {
  const row = contentRow(page, label);
  await row.getByRole("button", { name: "Publicar" }).click();
  await expect(row.getByText("Publicado")).toBeVisible({ timeout: 15_000 });
}

async function firstLabel(page: Page, published: boolean): Promise<string | null> {
  const row = page
    .locator("ul > li")
    .filter({
      has: page.getByRole("button", { name: published ? "Ocultar" : "Publicar" }),
    })
    .first();
  if ((await row.count()) === 0) return null;
  return row.locator("p.font-medium").innerText();
}

async function refreshListAfterHiding(
  page: Page,
  path: string,
  allowPublish: boolean,
): Promise<void> {
  await page.goto(path);
  const label = allowPublish ? await firstLabel(page, false) : null;
  if (!label) return;
  await publishRow(page, label);
  await hideRow(page, label);
}

async function refreshListAfterRestore(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const label = await firstLabel(page, true);
  if (!label) return;
  await hideRow(page, label);
  await publishRow(page, label);
}

async function ensureExampleService(page: Page, title: string): Promise<void> {
  await page.goto("/admin/conteudo/servicos");
  if ((await contentRow(page, title).count()) > 0) {
    await hideRow(page, title);
    await publishRow(page, title);
    return;
  }
  await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
  await fillService(page, title);
}

async function restoreExampleService(
  page: Page,
  title: string,
  wasPublished: boolean,
): Promise<void> {
  await page.goto("/admin/conteudo/servicos");
  if ((await contentRow(page, title).count()) === 0) return;
  await hideRow(page, title);
  if (wasPublished) await publishRow(page, title);
}

async function saveSiteForm(
  page: Page,
  heading: string,
  fields: Record<string, string>,
): Promise<void> {
  await page.goto("/admin/conteudo/site");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: heading }) });
  for (const [label, value] of Object.entries(fields)) {
    await form.getByLabel(label).fill(value);
  }
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
}

async function publishedIds(
  sql: Sql,
  table: "services" | "faq" | "testimonials",
): Promise<string[]> {
  const rows =
    table === "services"
      ? await sql<{ id: string }[]>`
          select id from content.services
          where published and title not in ${sql([...EXAMPLE_SERVICES])}
        `
      : table === "faq"
        ? await sql<{ id: string }[]>`select id from content.faq where published`
        : await sql<
            { id: string }[]
          >`select id from content.testimonials where published`;
  return rows.map((row) => row.id);
}

async function setPublished(
  sql: Sql,
  table: "services" | "faq" | "testimonials",
  ids: string[],
  published: boolean,
): Promise<void> {
  if (ids.length === 0) return;
  if (table === "services") {
    await sql`update content.services set published = ${published} where id in ${sql(ids)}`;
  } else if (table === "faq") {
    await sql`update content.faq set published = ${published} where id in ${sql(ids)}`;
  } else {
    await sql`
      update content.testimonials set published = ${published} where id in ${sql(ids)}
    `;
  }
}

test("capturas 360 e 1280 com dados de exemplo", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const email = `paginas-captura-${crypto.randomUUID()}@example.com`;
  const userId = await createStaff(email, "CONTENT_ADMIN");
  const sql = ownerSql();
  const [site] = await sql<
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
  const examples = await sql<{ title: string; published: boolean }[]>`
    select distinct on (title) title, published
    from content.services
    where title in ${sql([...EXAMPLE_SERVICES])}
    order by title, sort_order
  `;
  const hidden = {
    services: await publishedIds(sql, "services"),
    faq: await publishedIds(sql, "faq"),
    testimonials: await publishedIds(sql, "testimonials"),
  };
  const visitor = await browser.newContext();
  try {
    await setPublished(sql, "services", hidden.services, false);
    await setPublished(sql, "faq", hidden.faq, false);
    await setPublished(sql, "testimonials", hidden.testimonials, false);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
    await refreshListAfterHiding(page, "/admin/conteudo/perguntas", true);
    await refreshListAfterHiding(page, "/admin/conteudo/depoimentos", false);
    await saveSiteForm(page, "Sobre", {
      Título: "Quem é Adrielli Flores",
      Texto: EXAMPLE_ABOUT,
    });
    await saveContact(page, "5511999999999", "Olá");
    await saveSiteForm(page, "Contato", { "E-mail": "exemplo@adrielliflores.com.br" });
    await saveInstagram(page, "adrielliflores");
    for (const title of EXAMPLE_SERVICES) {
      await ensureExampleService(page, title);
    }

    mkdirSync(CAPTURE_DIR, { recursive: true });
    const view = await visitor.newPage();
    for (const width of CAPTURE_WIDTHS) {
      await view.setViewportSize({ width, height: 800 });
      for (const item of PAGES) {
        await expectPage(view, item.path, item.heading);
        if (item.path === "/sobre") {
          await expect(
            view.getByText("Acompanho o desenvolvimento da criança"),
          ).toBeVisible();
          await expect(
            view.getByText("Cada etapa é combinada com a família."),
          ).toBeVisible();
        }
        if (item.path === "/servicos") {
          for (const title of EXAMPLE_SERVICES) {
            await expectPublishedService(view, title);
          }
        }
        if (item.path === "/contato") {
          await expect(view.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
          await expect(view.getByRole("heading", { name: "Instagram" })).toBeVisible();
          await expect(view.getByRole("heading", { name: "E-mail" })).toBeVisible();
        }
        await view.screenshot({ path: `${CAPTURE_DIR}/${item.capture}-${width}.png` });
        if (item.path === "/contato" && width === 360) {
          await view
            .locator("section")
            .filter({ has: view.locator("#depois-da-mensagem") })
            .screenshot({ path: `${CAPTURE_DIR}/contato-trilha-360.png` });
        }
      }
    }
  } finally {
    await visitor.close();
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
    await setPublished(sql, "services", hidden.services, true);
    await setPublished(sql, "faq", hidden.faq, true);
    await setPublished(sql, "testimonials", hidden.testimonials, true);
    await sql.end({ timeout: 5 });
    try {
      for (const title of EXAMPLE_SERVICES) {
        const before = examples.find((row) => row.title === title);
        await restoreExampleService(page, title, before?.published ?? false);
      }
      if (hidden.faq.length > 0) {
        await refreshListAfterRestore(page, "/admin/conteudo/perguntas");
      }
      if (hidden.testimonials.length > 0) {
        await refreshListAfterRestore(page, "/admin/conteudo/depoimentos");
      }
      await saveSiteForm(page, "Busca e redes", {});
    } finally {
      await removeStaff(userId);
    }
  }
});
