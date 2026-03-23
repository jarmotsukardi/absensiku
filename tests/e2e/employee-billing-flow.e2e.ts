import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getRoleCreds, solveMathExpression } from "./helpers/testAccounts";

const waitForStable = async (page: Page) => {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    // Abaikan jika ada polling.
  }
};

const loginAsEmployee = async (page: Page) => {
  const creds = await getRoleCreds("employee");
  test.skip(!creds, "Kredensial employee belum diisi di ops/test-accounts.local.json");

  await page.goto("/employee/login", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.fill("#email", creds!.email);
  await page.fill("#password", creds!.password);

  const captchaInput = page.locator("#captcha-input");
  const hasCaptcha = await captchaInput.isVisible().catch(() => false);
  if (hasCaptcha) {
    const fallbackMathLabel =
      (await page
        .locator("label")
        .filter({ hasText: /Captcha: Berapa hasil dari|Verifikasi Captcha/i })
        .first()
        .textContent()
        .catch(() => "")) || "";
    const answerFromMath = solveMathExpression(fallbackMathLabel);
    const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((span) => (span.textContent || "").trim()).join(""),
    );
    const captchaAnswer = (answerFromMath || captchaText).trim();
    expect(captchaAnswer.length).toBeGreaterThanOrEqual(1);
    await captchaInput.fill(captchaAnswer);
  }

  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/employee\/login(?:\?|$)/, { timeout: 20_000 });
};

test.describe.parallel("Employee Billing Flow", () => {
  test.skip(
    !process.env.E2E_EMPLOYEE_BILLING_FLOW,
    "Set E2E_EMPLOYEE_BILLING_FLOW=1 untuk menjalankan flow billing employee end-to-end.",
  );

  test("employee dapat membuka halaman billing dan dialog konfirmasi transfer manual", async ({ page }) => {
    await loginAsEmployee(page);

    await page.goto("/employee/billing", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Billing Pegawai" })).toBeVisible();

    const centralizedCardVisible = await page.getByText("Billing Terpusat", { exact: false }).first().isVisible().catch(() => false);
    if (centralizedCardVisible) {
      await expect(page.getByText("pembayaran dikelola admin organisasi", { exact: false })).toBeVisible();
      return;
    }

    await expect(
      page.getByRole("button", { name: /Buat Invoice|Lanjutkan Pembayaran/i }).first(),
    ).toBeVisible();

    const manualConfirmButton = page.getByRole("button", { name: "Konfirmasi Transfer" }).first();
    const canConfirmManual = await manualConfirmButton.isVisible().catch(() => false);

    if (!canConfirmManual) return;

    await manualConfirmButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Konfirmasi Transfer Manual" })).toBeVisible();
    await expect(page.getByLabel("Tanggal transfer")).toBeVisible();
    await expect(page.getByLabel("Nomor referensi (opsional)")).toBeVisible();
    await expect(page.getByLabel("Saya menyatakan transfer sudah dilakukan sesuai nominal invoice.")).toBeVisible();

    await page.getByRole("button", { name: "Batal" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("dashboard employee tidak memunculkan overlay billing saat akses sudah terbuka", async ({ page }) => {
    test.skip(
      !process.env.E2E_EMPLOYEE_BILLING_ACCESS_FLOW,
      "Set E2E_EMPLOYEE_BILLING_ACCESS_FLOW=1 untuk validasi akses dashboard pasca-lunas.",
    );

    await loginAsEmployee(page);
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
    }

    await expect(lockedOverlayTitle).not.toBeVisible();
  });

  test("fallback xendit nonaktif mengarahkan employee ke konfirmasi transfer manual", async ({ page }) => {
    test.skip(
      !process.env.E2E_EMPLOYEE_BILLING_MANUAL_FALLBACK_FLOW,
      "Set E2E_EMPLOYEE_BILLING_MANUAL_FALLBACK_FLOW=1 untuk validasi fallback manual transfer.",
    );

    await loginAsEmployee(page);
    await page.goto("/employee/billing", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const centralizedCardVisible = await page
      .getByText("Billing Terpusat", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(centralizedCardVisible, "Tenant ini billing terpusat. Fallback manual di sisi employee tidak berlaku.");

    const createOrContinueButton = page.getByRole("button", { name: /Buat Invoice|Lanjutkan Pembayaran/i }).first();
    await expect(createOrContinueButton).toBeVisible();
    await createOrContinueButton.click();

    const manualConfirmButton = page.getByRole("button", { name: "Konfirmasi Transfer" }).first();
    await expect(manualConfirmButton).toBeVisible({ timeout: 12000 });

    await manualConfirmButton.click();
    const manualDialog = page.getByRole("dialog");
    await expect(page.getByRole("heading", { name: "Konfirmasi Transfer Manual" })).toBeVisible();

    const declaration = page.getByLabel("Saya menyatakan transfer sudah dilakukan sesuai nominal invoice.");
    await declaration.click();
    await expect(page.getByRole("button", { name: "Kirim Konfirmasi" })).toBeEnabled();

    await page.getByRole("button", { name: "Batal" }).click();
    await expect(manualDialog).not.toBeVisible({ timeout: 10000 });
  });
});
