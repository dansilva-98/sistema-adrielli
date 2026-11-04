import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a home responde 200 e mostra a marca", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Adrielli Flores" }),
  ).toBeVisible();
});

test("o cabeçalho leva às páginas públicas e marca a atual", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const pages = [
    { name: "Sobre", url: /\/sobre$/ },
    { name: "Serviços", url: /\/servicos$/ },
    { name: "Materiais", url: /\/materiais$/ },
    { name: "Contato", url: /\/contato$/ },
  ] as const;
  for (const item of pages) {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: item.name })
      .click();
    await expect(page).toHaveURL(item.url);
    await expect(
      page
        .getByRole("navigation", { name: "Principal" })
        .getByRole("link", { name: item.name }),
    ).toHaveAttribute("aria-current", "page");
  }
  await expect(page.getByRole("link", { name: "Agendar avaliação" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Chamar no WhatsApp" })).toHaveCount(0);
  await expect(page.getByText("A etapa 1 começa com uma mensagem.")).toBeVisible();
});

test("axe não encontra violações na home", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("os cabeçalhos de segurança estão na home e na saúde", async ({ request }) => {
  for (const path of ["/", "/api/health"]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  }

  const health = await request.get("/api/health");
  const body = await health.json();
  expect(Object.keys(body)).toEqual(["status"]);
  expect(["ok", "degraded"]).toContain(body.status);
});

test("a linha dourada termina no último marcador a 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const tablist = page.locator("#como-funciona [role='tablist']");
  test.skip((await tablist.count()) === 0, "Como funciona sem etapas publicadas");
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

for (const width of [360, 1280]) {
  test(`a home não rola na horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    if (width === 360) {
      const menu = page.getByRole("button", { name: "Abrir menu" });
      const menuBox = await menu.boundingBox();
      expect(menuBox).not.toBeNull();
      if (menuBox) {
        expect(menuBox.width).toBeGreaterThanOrEqual(44);
        expect(menuBox.height).toBeGreaterThanOrEqual(44);
      }
      await menu.click();
      await expect(
        page
          .getByRole("navigation", { name: "Principal" })
          .getByRole("link", { name: "Contato" }),
      ).toBeVisible();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    if (width === 360) {
      await page
        .getByRole("navigation", { name: "Principal" })
        .getByRole("link", { name: "Sobre" })
        .click();
      await expect(page).toHaveURL(/\/sobre$/);
    }
  });
}
