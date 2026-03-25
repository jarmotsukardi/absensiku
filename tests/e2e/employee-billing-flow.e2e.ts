import { test, expect, type Page } from "@playwright/test";
import {
  cleanupInvoicesBestEffort,
  extractInvoiceNumbers,
  getNewInvoiceNumbers,
} from "./helpers/billingCleanup";
import { loginAsEmployee } from "./helpers/employeeAuth";
import { waitForStable } from "./helpers/orgAuth";

const collectInvoiceNumbersFromPage = async (page: Page): Promise<string[]> => {
  const historyHeading = page.getByText("Riwayat Invoice Anda", { exact: false }).first();
  const hasHistory = await historyHeading.isVisible().catch(() => false);
  if (hasHistory) {
    const cardText =
      (await historyHeading
        .locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
        .innerText()
        .catch(() => "")) || "";
    if (cardText) return extractInvoiceNumbers(cardText);
  }

  const pageText = (await page.locator("body").innerText().catch(() => "")) || "";
  return extractInvoiceNumbers(pageText);
};

test.describe.serial("Employee Billing Flow", () => {
  test("employee billing terpusat hanya melihat info pembayaran dikelola admin", async ({ page }) => {
    await loginAsEmployee(page, ["employee_centralized"]);

    await page.goto("/employee/billing", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Billing Pegawai" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Billing Terpusat" })).toBeVisible();
    await expect(page.getByText("pembayaran dikelola admin organisasi", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /Buat Invoice|Lanjutkan Pembayaran/i })).toHaveCount(0);
  });

  test("employee billing mandiri dapat membuka dialog konfirmasi transfer manual", async ({ page }) => {
    await loginAsEmployee(page, ["employee"]);

    await page.goto("/employee/billing", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Billing Pegawai" })).toBeVisible();
    await expect(page.getByText("Billing Terpusat", { exact: false })).toHaveCount(0);

    await expect(
      page.getByRole("button", { name: /Buat Invoice|Lanjutkan Pembayaran/i }).first(),
    ).toBeVisible();

    const manualConfirmButton = page.getByRole("button", { name: "Konfirmasi Transfer" }).first();
    const canConfirmManual = await manualConfirmButton.isVisible().catch(() => false);

    if (!canConfirmManual) return;

    await manualConfirmButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const manualHeading = page.getByRole("heading", { name: "Konfirmasi Transfer Manual" });
    const detailHeading = page.getByRole("heading", { name: "Detail Invoice" });
    const openedManualDialog = await manualHeading.isVisible().catch(() => false);
    if (openedManualDialog) {
      await expect(page.getByLabel("Tanggal transfer")).toBeVisible();
      await expect(page.getByLabel(/No\.\s*Ref|Nomor referensi/i)).toBeVisible();
      await expect(page.getByLabel("Saya menyatakan transfer sudah dilakukan sesuai nominal invoice.")).toBeVisible();
    } else {
      await expect(detailHeading).toBeVisible();
      await expect(page.getByText("Transfer Manual", { exact: false }).first()).toBeVisible();
    }

    const dismissButton = openedManualDialog
      ? page.getByRole("button", { name: "Batal" })
      : page.getByRole("button", { name: "Tutup" });
    await dismissButton.click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("dashboard employee tidak memunculkan overlay billing saat halaman dibuka", async ({ page }) => {
    await loginAsEmployee(page, ["employee"]);

    await page.goto("/employee/dashboard", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const lockedOverlayTitle = page.getByRole("heading", { name: "Akses Terkunci" });
    await expect(lockedOverlayTitle).not.toBeVisible();
  });

  test("fallback xendit nonaktif mengarahkan employee ke transfer manual + cleanup invoice uji", async ({
    page,
  }) => {
    await loginAsEmployee(page, ["employee"]);
    await page.goto("/employee/billing", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByText("Billing Terpusat", { exact: false })).toHaveCount(0);

    const beforeInvoiceNumbers = new Set(await collectInvoiceNumbersFromPage(page));
    const createdInvoiceNumbers = new Set<string>();

    try {
      const createOrContinueButton = page.getByRole("button", {
        name: /Buat Invoice|Lanjutkan Pembayaran/i,
      }).first();
      await expect(createOrContinueButton).toBeVisible();
      await createOrContinueButton.click();

      const fallbackTitle = page.getByRole("heading", { name: "Pembayaran Xendit Tidak Aktif" });
      const isFallbackVisible = await fallbackTitle.isVisible().catch(() => false);
      if (isFallbackVisible) {
        await page.getByRole("button", { name: "Lanjutkan Transfer Manual" }).click();
        const manualDialogHeading = page.getByRole("heading", { name: "Konfirmasi Transfer Manual" });
        const openedFromFallback = await manualDialogHeading.isVisible().catch(() => false);
        if (openedFromFallback) {
          await page.getByLabel(/No\.\s*Ref|Nomor referensi/i).fill(`E2E-EMP-${Date.now()}`);
          await page.getByLabel("Saya menyatakan transfer sudah dilakukan sesuai nominal invoice.").click();
          await expect(page.getByRole("button", { name: "Kirim Konfirmasi" })).toBeEnabled();
          await page.getByRole("button", { name: "Batal" }).click();
          await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });
          return;
        }
        if (await fallbackTitle.isVisible().catch(() => false)) {
          await page.getByRole("button", { name: /^Tutup$/ }).click();
        }
      }

      await waitForStable(page);

      const afterInvoiceNumbers = await collectInvoiceNumbersFromPage(page);
      for (const invoice of getNewInvoiceNumbers(beforeInvoiceNumbers, afterInvoiceNumbers)) {
        createdInvoiceNumbers.add(invoice);
      }

      const manualConfirmButtons = page.getByRole("button", { name: "Konfirmasi Transfer" });
      const hasManualConfirmButton = await manualConfirmButtons.first().isVisible().catch(() => false);
      if (!hasManualConfirmButton) {
        await expect(page.getByText(/Transfer Manual|Menunggu pembayaran|Belum Lunas/i).first()).toBeVisible();
        return;
      }

      const buttonCount = await manualConfirmButtons.count();
      let openedManualDialog = false;
      for (let i = 0; i < buttonCount; i += 1) {
        const button = manualConfirmButtons.nth(i);
        const isEnabled = await button.isEnabled().catch(() => false);
        if (!isEnabled) continue;
        await button.click();
        openedManualDialog = true;
        break;
      }

      if (!openedManualDialog) {
        await expect(page.getByText(/Menunggu Verifikasi|Belum Lunas|Lunas/i).first()).toBeVisible();
        return;
      }

      await expect(page.getByRole("heading", { name: "Konfirmasi Transfer Manual" })).toBeVisible();
      await page.getByLabel(/No\.\s*Ref|Nomor referensi/i).fill(`E2E-EMP-${Date.now()}`);
      await page.getByLabel("Saya menyatakan transfer sudah dilakukan sesuai nominal invoice.").click();
      await expect(page.getByRole("button", { name: "Kirim Konfirmasi" })).toBeEnabled();

      await page.getByRole("button", { name: "Batal" }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });
    } finally {
      if (createdInvoiceNumbers.size > 0) {
        await cleanupInvoicesBestEffort(
          createdInvoiceNumbers,
          "employee-billing-flow.manual-fallback",
        );
      }
    }
  });
});
