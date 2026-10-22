import { expect, test } from "@playwright/test";

test("a home responde 200 e mostra a marca", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Ana Aprender" }),
  ).toBeVisible();
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

for (const width of [360, 1280]) {
  test(`a home não rola na horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    if (width === 360) {
      await page.getByRole("button", { name: "Menu" }).click();
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
