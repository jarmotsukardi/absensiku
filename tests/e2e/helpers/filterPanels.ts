import { expect, type Locator, type Page } from "@playwright/test";

export const getFilterPanelByPlaceholder = (page: Page, placeholder: string): Locator =>
  page.locator("div").filter({ has: page.getByPlaceholder(placeholder) }).first();

export const selectPanelComboboxOption = async (
  page: Page,
  panel: Locator,
  comboboxIndex: number,
  optionName: string,
) => {
  const trigger = panel.getByRole("combobox").nth(comboboxIndex);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
};
