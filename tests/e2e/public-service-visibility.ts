import { expect, type Page } from "@playwright/test";

const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 360, height: 800 } as const;

export async function expectPublishedService(page: Page, title: string): Promise<void> {
  const previous = page.viewportSize() ?? DESKTOP;
  await page.setViewportSize(DESKTOP);
  await expect(
    page
      .getByRole("tab", { name: title, exact: true })
      .or(page.getByRole("heading", { name: title, exact: true }))
      .first(),
  ).toBeVisible();
  await page.setViewportSize(MOBILE);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.setViewportSize(previous);
}

export async function expectServiceAbsent(page: Page, title: string): Promise<void> {
  const previous = page.viewportSize() ?? DESKTOP;
  await page.setViewportSize(DESKTOP);
  await expect(page.getByRole("tab", { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await page.setViewportSize(MOBILE);
  await expect(page.getByRole("button", { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await page.setViewportSize(previous);
}
