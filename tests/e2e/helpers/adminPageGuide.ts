import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const expectAdminPageGuide = async (page: Page, heading: string) => {
  await page.getByText("Penjelasan Halaman", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText("Penjelasan Halaman", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(page.getByText("Glosarium Halaman", { exact: true })).toBeVisible();
};
