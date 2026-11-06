import { expect, type Page, test } from "@playwright/test";

import { createStaff, removeStaff, signIn } from "./staff-fixtures";

async function fillService(page: Page, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Novo serviço" })).toBeVisible();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Resumo").fill("Resumo curto.");
  await page.getByLabel("Texto").fill(`Texto de ${title}.`);
  await expect(page.getByLabel("Publicar no site")).toBeChecked();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço criado.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Serviços" })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
}

test.describe("vários serviços no CMS", () => {
  test("cria 3 serviços seguidos e os três aparecem em /servicos", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-tres-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const stamp = crypto.randomUUID().slice(0, 8);
    const titles = [`Serviço A ${stamp}`, `Serviço B ${stamp}`, `Serviço C ${stamp}`];
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      for (const title of titles) {
        await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
        await fillService(page, title);
      }
      await page.goto("/servicos");
      for (const title of titles) {
        await expect(page.getByRole("heading", { name: title })).toBeVisible();
      }
    } finally {
      await removeStaff(userId);
    }
  });

  test("editar um serviço não altera os outros", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-editar-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const stamp = crypto.randomUUID().slice(0, 8);
    const first = `Serviço um ${stamp}`;
    const second = `Serviço dois ${stamp}`;
    const third = `Serviço três ${stamp}`;
    const edited = `Serviço dois editado ${stamp}`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      for (const title of [first, second, third]) {
        await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
        await fillService(page, title);
      }
      const row = page.locator("li").filter({ hasText: second });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(
        page.getByRole("heading", { name: `Editar serviço: ${second}` }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Voltar para a lista" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Adicionar outro serviço" }),
      ).toBeVisible();
      await page.getByLabel("Título").fill(edited);
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible();
      await page.getByRole("link", { name: "Voltar para a lista" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos(\?|$)/);
      const rows = page.locator("ul > li");
      await expect(rows.filter({ hasText: first })).toBeVisible();
      await expect(rows.filter({ hasText: edited })).toBeVisible();
      await expect(rows.filter({ hasText: third })).toBeVisible();
      await expect(
        rows.filter({ has: page.getByText(second, { exact: true }) }),
      ).toHaveCount(0);
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: first })).toBeVisible();
      await expect(page.getByRole("heading", { name: edited })).toBeVisible();
      await expect(page.getByRole("heading", { name: third })).toBeVisible();
      await expect(page.getByRole("heading", { name: second })).toHaveCount(0);
    } finally {
      await removeStaff(userId);
    }
  });

  test("reabrir depois de Ocultar não republica ao salvar", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-ocultar-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const title = `Serviço ocultar ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
      await fillService(page, title);
      const row = page.locator("ul > li").filter({ hasText: title });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      await expect(
        page.getByRole("heading", { name: `Editar serviço: ${title}` }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("link", { name: "Voltar para a lista" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos(\?|$)/);
      await expect(page.getByText("Carregando os serviços…")).toHaveCount(0);
      await row.getByRole("button", { name: "Ocultar" }).click();
      await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      const editor = page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: `Editar serviço: ${title}` }) })
        .last();
      await expect(editor.getByLabel("Publicar no site")).not.toBeChecked({
        timeout: 15_000,
      });
      await editor.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByText("Este conteúdo foi alterado por outra pessoa"),
      ).toHaveCount(0);
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
    } finally {
      await removeStaff(userId);
    }
  });

  test("salvar depois de Subir na lista não dá conflito", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-subir-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const stamp = crypto.randomUUID().slice(0, 8);
    const first = `Serviço subir A ${stamp}`;
    const second = `Serviço subir B ${stamp}`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      for (const title of [first, second]) {
        await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
        await fillService(page, title);
      }
      const row = page.locator("ul > li").filter({ hasText: second });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      await expect(
        page.getByRole("heading", { name: `Editar serviço: ${second}` }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("link", { name: "Voltar para a lista" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos(\?|$)/);
      await expect(page.getByText("Carregando os serviços…")).toHaveCount(0);
      const order = row.getByText(/ordem \d+/);
      const orderBefore = await order.innerText();
      await row.getByRole("button", { name: "Subir" }).click();
      await expect(order).not.toHaveText(orderBefore, { timeout: 15_000 });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      const editor = page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: `Editar serviço: ${second}` }) })
        .last();
      await expect(
        editor.getByRole("heading", { name: `Editar serviço: ${second}` }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(editor.getByText("Salvo. O site já mostra a alteração.")).toHaveCount(
        0,
      );
      await editor.getByRole("button", { name: "Salvar" }).click();
      await expect(editor.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByText("Este conteúdo foi alterado por outra pessoa"),
      ).toHaveCount(0);
    } finally {
      await removeStaff(userId);
    }
  });

  test("salvar, errar validação e corrigir não dá conflito", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-validar-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const title = `Serviço validar ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
      await fillService(page, title);
      const row = page.locator("ul > li").filter({ hasText: title });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      await expect(
        page.getByRole("heading", { name: `Editar serviço: ${title}` }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByLabel("Resumo").fill("Primeiro resumo salvo.");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel("Título").fill("");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Preencha este campo.")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel("Título").fill(`${title} corrigido`);
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByText("Este conteúdo foi alterado por outra pessoa"),
      ).toHaveCount(0);
    } finally {
      await removeStaff(userId);
    }
  });

  test("salvar duas vezes, ocultar e reabrir não dá conflito", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-duas-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const title = `Serviço duas ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
      await fillService(page, title);
      const row = page.locator("ul > li").filter({ hasText: title });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      await expect(
        page.getByRole("heading", { name: `Editar serviço: ${title}` }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByLabel("Resumo").fill("Resumo um.");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel("Resumo").fill("Resumo dois.");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("link", { name: "Voltar para a lista" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos(\?|$)/);
      await expect(page.getByText("Carregando os serviços…")).toHaveCount(0);
      await row.getByRole("button", { name: "Ocultar" }).click();
      await expect(row.getByText("não aparece no site")).toBeVisible({ timeout: 15_000 });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      const editor = page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: `Editar serviço: ${title}` }) })
        .last();
      await expect(
        editor.getByRole("heading", { name: `Editar serviço: ${title}` }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(editor.getByText("Salvo. O site já mostra a alteração.")).toHaveCount(
        0,
      );
      await expect(editor.getByLabel("Publicar no site")).not.toBeChecked({
        timeout: 15_000,
      });
      await editor.getByRole("button", { name: "Salvar" }).click();
      await expect(editor.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByText("Este conteúdo foi alterado por outra pessoa"),
      ).toHaveCount(0);
      await page.goto("/servicos");
      await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
    } finally {
      await removeStaff(userId);
    }
  });

  test("reabrir depois de salvar não mostra Salvo antigo", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `servicos-aviso-${crypto.randomUUID()}@example.com`;
    const userId = await createStaff(email, "CONTENT_ADMIN");
    const title = `Serviço aviso ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await signIn(page, email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/conteudo/servicos");
      await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
      await fillService(page, title);
      const row = page.locator("ul > li").filter({ hasText: title });
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      await expect(
        page.getByRole("heading", { name: `Editar serviço: ${title}` }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo. O site já mostra a alteração.")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("link", { name: "Voltar para a lista" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos(\?|$)/);
      await expect(page.getByText("Carregando os serviços…")).toHaveCount(0);
      await row.getByRole("link", { name: "Editar" }).click();
      await expect(page).toHaveURL(/\/admin\/conteudo\/servicos\/.+/);
      const editor = page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: `Editar serviço: ${title}` }) })
        .last();
      await expect(
        editor.getByRole("heading", { name: `Editar serviço: ${title}` }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(editor.getByText("Salvo. O site já mostra a alteração.")).toHaveCount(
        0,
      );
    } finally {
      await removeStaff(userId);
    }
  });
});
