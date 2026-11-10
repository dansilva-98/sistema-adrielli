import { expect, test } from "@playwright/test";

import { EXAMPLE_ADDRESS } from "../../src/db/seed";
import { MAPS_LINK_LABEL, mapsSearchUrl } from "../../src/modules/content/maps";

const mapsHref = mapsSearchUrl(EXAMPLE_ADDRESS);

test("a home e o contato abrem o endereço no mapa", async ({ page }) => {
  test.skip(process.env.EMPTY_SITE === "1", "precisa do endereço de exemplo");
  expect(mapsHref).toBeTruthy();
  for (const path of ["/", "/contato"]) {
    await page.goto(path);
    const link = page.getByRole("link", { name: MAPS_LINK_LABEL });
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Ver no mapa");
    await expect(link).toHaveAttribute("href", mapsHref!);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.goto("/");
  await expect(page.getByText("Atendimento presencial")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});
