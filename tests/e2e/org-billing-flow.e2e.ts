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

const loginAsOrgAdmin = async (page: Page) => {
  const creds = await getRoleCreds("org_admin");
  test.skip(!creds, "Kredensial org_admin belum diisi di ops/test-accounts.local.json");

  await page.goto("/org/login", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.getByRole("textbox", { name: "Email" }).fill(creds!.email);
  await page.getByRole("textbox", { name: "Password" }).fill(creds!.password);

  const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
    spans.map((span) => (span.textContent || "").trim()).join(""),
  );
  const fallbackMathLabel =
    (await page
      .locator("label")
      .filter({ hasText: /Captcha: Berapa hasil dari|Verifikasi Captcha/i })
      .first()
      .textContent()
      .catch(() => "")) || "";
  const answerFromMath = solveMathExpression(fallbackMathLabel);
  const captchaAnswer = answerFromMath || captchaText;
  expect(captchaAnswer.length).toBeGreaterThan(0);
  await page.getByRole("textbox", { name: /Masukkan kode captcha|Captcha|Jawaban/i }).fill(captchaAnswer);

  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled();
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/org/, { timeout: 20_000 });
};

test.describe.parallel("Org Billing Flow", () => {
  test.skip(
    !process.env.E2E_ORG_BILLING_FLOW,
    "Set E2E_ORG_BILLING_FLOW=1 untuk menjalankan flow billing org end-to-end.",
  );

  test("menu offers mengikuti kondisi invoice aktif atau kalkulator", async ({ page }) => {
    await loginAsOrgAdmin(page);

    await page.goto("/org/billing?menu=offers", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByText("Kalkulator Langganan", { exact: false })).toBeVisible();

    const triggerButton = page
      .getByRole("button", { name: /Buka Kalkulator|Lihat Invoice Aktif/i })
      .first();
    await expect(triggerButton).toBeVisible();
    await triggerButton.click();

    // Dua hasil yang valid:
    // 1) Tidak ada invoice aktif -> dialog kalkulator terbuka.
    // 2) Ada invoice aktif -> diarahkan ke faktur (menu invoices).
    const calculatorDialogVisible = await page
      .getByRole("dialog")
      .getByText("Kalkulator Langganan", { exact: false })
      .isVisible()
      .catch(() => false);

    if (!calculatorDialogVisible) {
      await expect(page).toHaveURL(/\/org\/billing/);
      await expect(page.getByText("Faktur Saya", { exact: false })).toBeVisible();
    }
  });
});
