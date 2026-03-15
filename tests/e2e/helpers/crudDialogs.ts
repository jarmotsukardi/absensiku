import { expect, type Locator, type Page } from "@playwright/test";
import { waitForStable } from "./orgAuth";

export const latestDialog = (page: Page) => page.getByRole("dialog").last();

export const canOpenCreateDialog = async (page: Page, buttonLabel: string, dialogHeading: string) => {
  const addButton = page.getByRole("button", { name: buttonLabel });
  const visible = await addButton.isVisible().catch(() => false);
  if (!visible) return false;
  await addButton.click();
  return page.getByRole("heading", { name: dialogHeading, exact: true }).isVisible().catch(() => false);
};

export const closeDialogIfVisible = async (page: Page, dialogHeading: string) => {
  const headingLocator = latestDialog(page).getByRole("heading", { name: dialogHeading, exact: true });
  const stillOpen = await headingLocator.isVisible().catch(() => false);
  if (!stillOpen) return;

  const cancelButton = latestDialog(page).getByRole("button", { name: "Batal" });
  if (await cancelButton.isVisible().catch(() => false)) {
    await cancelButton.click();
  } else {
    await page.keyboard.press("Escape");
  }

  await expect(headingLocator).toHaveCount(0, { timeout: 10_000 });
};

export const saveDialogOrFallback = async (page: Page, dialogHeading: string, pageHeading: string) => {
  await latestDialog(page).getByRole("button", { name: "Simpan" }).click();
  await page.waitForTimeout(2_000);

  const stillOpen = await latestDialog(page)
    .getByRole("heading", { name: dialogHeading, exact: true })
    .isVisible()
    .catch(() => false);

  if (!stillOpen) {
    await waitForStable(page);
    return true;
  }

  await closeDialogIfVisible(page, dialogHeading);
  await expect(page.getByRole("heading", { name: pageHeading, exact: true })).toBeVisible();
  return false;
};

export const clickResilient = async (target: Locator) => {
  try {
    await target.click({ timeout: 10_000 });
  } catch {
    await target.click({ force: true, timeout: 10_000 });
  }
};

export const selectDialogOption = async (dialogRoot: Locator, index: number, optionName: string) => {
  await dialogRoot.getByRole("combobox").nth(index).click();
  await dialogRoot.page().getByRole("option", { name: optionName, exact: true }).click();
};
