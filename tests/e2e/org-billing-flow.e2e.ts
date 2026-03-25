import { test, expect } from "@playwright/test";
import { expectOrgTenantContext, loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

test.describe.serial("Org Billing Flow", () => {
  test("menu offers membuka kalkulator/invoice aktif untuk billing terpusat", async ({ page }) => {
    const account = await loginAsOrgAdmin(page, ["org_admin_centralized"]);
    await expectOrgTenantContext(page, account);

    await page.goto("/org/billing?menu=offers", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByText("Kalkulator Langganan", { exact: false })).toBeVisible();

    const triggerButton = page
      .getByRole("button", { name: /Buka Kalkulator|Lihat Invoice Aktif/i })
      .first();
    await expect(triggerButton).toBeVisible();
    await triggerButton.click();

    await waitForStable(page);

    const calculatorDialogVisible = await page
      .getByRole("dialog")
      .getByText("Kalkulator Langganan", { exact: false })
      .isVisible()
      .catch(() => false);
    const detailDialogVisible = await page
      .getByRole("heading", { name: /Detail Faktur|Detail Invoice/i })
      .isVisible()
      .catch(() => false);
    const invoiceTableVisible = await page
      .getByRole("columnheader", { name: /No\. Invoice|Faktur #/i })
      .first()
      .isVisible()
      .catch(() => false);

    await expect(page).toHaveURL(/\/org\/billing/);
    expect(calculatorDialogVisible || detailDialogVisible || invoiceTableVisible).toBeTruthy();
  });

  test("deep-link invoice yang tidak ada menampilkan overlay informasi", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);

    const missingInvoiceNo = "INV-E2E-TUJUAN-TIDAK-DITEMUKAN";
    await page.goto(`/org/billing?menu=invoices&invoice=${encodeURIComponent(missingInvoiceNo)}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForStable(page);

    const notFoundTitle = page.getByRole("heading", { name: "Invoice tujuan tidak ditemukan" });
    await expect(notFoundTitle).toBeVisible();
    await expect(page.getByText(missingInvoiceNo, { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Tutup" }).first().click();
    await expect(notFoundTitle).not.toBeVisible();
    await expect(page).not.toHaveURL(/invoice=/);
  });
});
