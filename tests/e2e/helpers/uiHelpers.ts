import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export const expectToast = async (page: Page, text: string) => {
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
};

export const readSwitchState = async (locator: Locator) => (await locator.getAttribute("aria-checked")) === "true";

export const setSwitchState = async (locator: Locator, nextState: boolean) => {
  const currentState = await readSwitchState(locator);
  if (currentState !== nextState) {
    await locator.click();
  }
};

export const dismissDialogByButtonIfPresent = async (page: Page, buttonName: string) => {
  const closeButton = page.getByRole("button", { name: buttonName }).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await expect(closeButton).not.toBeVisible({ timeout: 10_000 });
  }
};
