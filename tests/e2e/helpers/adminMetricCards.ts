import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const expectMetricCardVisible = async (page: Page, title: string, note: string) => {
  const card = page
    .locator("div.rounded-xl")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({ hasText: note })
    .first();

  await expect(card).toBeVisible();
};

export const expectMetricCardWithCount = async (page: Page, title: string, note: string) => {
  const card = page
    .locator("div.rounded-xl")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({ hasText: note })
    .first();

  await expect(card).toBeVisible();
  const cardText = ((await card.textContent()) || "").trim();
  const match = cardText.match(/\d+/);
  expect(match).not.toBeNull();
};
