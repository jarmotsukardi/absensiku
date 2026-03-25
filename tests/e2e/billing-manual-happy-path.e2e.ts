import { test, expect } from "@playwright/test";
import type { Browser, Locator, Page } from "@playwright/test";
import {
  cleanupInvoicesBestEffort,
  extractInvoiceNumbers,
  getNewInvoiceNumbers,
} from "./helpers/billingCleanup";
import { tryLoginAsSuperadmin } from "./helpers/adminAuth";
import { loginAsEmployee } from "./helpers/employeeAuth";
import { waitForStable } from "./helpers/orgAuth";

const openSuperadminSession = async (browser: Browser, baseURL?: string) => {
  const adminContext = await browser.newContext({ baseURL: baseURL || process.env.DASHBOARD_BASE_URL });
  const adminPage = await adminContext.newPage();
  const loginResult = await tryLoginAsSuperadmin(adminPage);
  if (loginResult.skipped || loginResult.twoFactorRequired) {
    await adminContext.close();
    return { page: null as Page | null, twoFactorRequired: loginResult.twoFactorRequired, skipped: loginResult.skipped };
  }
  return { page: adminPage, twoFactorRequired: false, skipped: false };
};

const extractInvoiceNumber = async (manualConfirmButton: Locator) => {
  const card = manualConfirmButton.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  const cardText = (await card.innerText().catch(() => "")).trim();
  const match = cardText.match(/INV-[A-Z0-9-]+/i);
  return match ? match[0] : null;
};

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

test.describe.serial("Billing Manual Happy Path", () => {
  test.skip(
    !process.env.E2E_BILLING_HAPPY_PATH_FLOW,
    "Set E2E_BILLING_HAPPY_PATH_FLOW=1 untuk menjalankan happy path billing manual penuh.",
  );

  test("employee -> konfirmasi transfer -> admin verify -> status paid -> akses tetap terbuka", async ({
    page,
    browser,
    baseURL,
  }) => {
    await loginAsEmployee(page, ["employee"]);

    await page.goto("/employee/billing", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const centralizedCardVisible = await page
      .getByText("Billing Terpusat", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(centralizedCardVisible, "Tenant ini billing terpusat. Happy path billing mandiri tidak berlaku.");

    const createdInvoiceNumbers = new Set<string>();
    try {
      const beforeInvoiceNumbers = new Set(await collectInvoiceNumbersFromPage(page));

      const createOrContinueButton = page.getByRole("button", { name: /Buat Invoice|Lanjutkan Pembayaran/i }).first();
      const hasCreateButton = await createOrContinueButton.isVisible().catch(() => false);
      if (hasCreateButton) {
        await createOrContinueButton.click();
        await waitForStable(page);
      }

      const afterInvoiceNumbers = await collectInvoiceNumbersFromPage(page);
      for (const invoice of getNewInvoiceNumbers(beforeInvoiceNumbers, afterInvoiceNumbers)) {
        createdInvoiceNumbers.add(invoice);
      }

      const manualConfirmButton = page.getByRole("button", { name: "Konfirmasi Transfer" }).first();
      const hasManualButton = await manualConfirmButton.isVisible().catch(() => false);
      test.skip(!hasManualButton, "Invoice manual transfer belum tersedia untuk flow ini.");

      const invoiceNumber = await extractInvoiceNumber(manualConfirmButton);
      test.skip(!invoiceNumber, "Tidak dapat membaca nomor invoice dari daftar billing employee.");

      await manualConfirmButton.click();
      await expect(page.getByRole("heading", { name: "Konfirmasi Transfer Manual" })).toBeVisible();
      await page.getByLabel(/No\.\s*Ref|Nomor referensi/i).fill(`E2E-${Date.now()}`);
      await page.getByLabel("Saya menyatakan transfer sudah dilakukan sesuai nominal invoice.").click();
      await expect(page.getByRole("button", { name: "Kirim Konfirmasi" })).toBeEnabled();
      await page.getByRole("button", { name: "Kirim Konfirmasi" }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

      const adminSession = await openSuperadminSession(browser, baseURL);
      test.skip(adminSession.skipped, "Kredensial superadmin belum tersedia.");
      test.skip(adminSession.twoFactorRequired, "Login superadmin membutuhkan 2FA, flow otomatis dilewati.");

      const adminPage = adminSession.page!;
      try {
        await adminPage.goto("/admin/billing?tab=manual", { waitUntil: "domcontentloaded" });
        await waitForStable(adminPage);
        await expect(adminPage.getByText("Verifikasi Pembayaran Manual", { exact: false })).toBeVisible();

        const searchInput = adminPage.getByPlaceholder("Cari invoice atau organisasi...");
        await searchInput.fill(invoiceNumber!);

        const verifyButton = adminPage
          .locator("div")
          .filter({ hasText: invoiceNumber! })
          .getByRole("button", { name: "Verifikasi" })
          .first();
        await expect(verifyButton).toBeVisible({ timeout: 12_000 });
        await verifyButton.click();

        await expect(adminPage.getByRole("heading", { name: "Verifikasi Pembayaran Manual" })).toBeVisible();
        await expect(adminPage.getByRole("button", { name: "Setujui Pembayaran" })).toBeEnabled();
        await adminPage.getByRole("button", { name: "Setujui Pembayaran" }).click();
        await expect(adminPage.getByRole("dialog")).not.toBeVisible({ timeout: 12_000 });

        await expect(
          adminPage.locator("div").filter({ hasText: invoiceNumber! }).getByRole("button", { name: "Verifikasi" }),
        ).toHaveCount(0, { timeout: 12_000 });
      } finally {
        await adminPage.context().close();
      }

      await page.goto("/employee/billing", { waitUntil: "domcontentloaded" });
      await waitForStable(page);

      const paidRow = page.locator("div").filter({ hasText: invoiceNumber! }).filter({ hasText: "Lunas" }).first();
      await expect(paidRow).toBeVisible({ timeout: 15_000 });

      await page.goto("/employee/dashboard", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      const lockedOverlayTitle = page.getByRole("heading", { name: "Akses Terkunci" });
      await expect(lockedOverlayTitle).not.toBeVisible();

      const checkInButton = page.getByRole("button", { name: /Absen Masuk/i }).first();
      const canClickCheckIn =
        (await checkInButton.isVisible().catch(() => false)) &&
        (await checkInButton.isEnabled().catch(() => false));

      if (canClickCheckIn) {
        await checkInButton.click();
        await page.waitForTimeout(1200);
        await expect(lockedOverlayTitle).not.toBeVisible();
      }
    } finally {
      if (createdInvoiceNumbers.size > 0) {
        await cleanupInvoicesBestEffort(createdInvoiceNumbers, "billing-manual-happy-path");
      }
    }
  });
});
