import type { Locator, Page } from "@playwright/test";

export const selectEssDocumentSource = async (page: Page, value: "Kontrak Kerja" | "Dokumen HR") => {
  await page.getByTestId("admin-hr-policy-ess-document-source").click();
  await page.getByRole("option", { name: value, exact: true }).click();
};

export const confirmBrowserDialogDelete = async (page: Page, deleteButton: Locator) => {
  page.once("dialog", (dialog) => dialog.accept());
  await deleteButton.click();
};
