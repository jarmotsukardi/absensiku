import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { waitForStable } from "./orgAuth";
import { getRoleCreds, solveMathExpression } from "./testAccounts";

type AdminCreds = {
  email: string;
  password: string;
};

export type SuperadminLoginAttempt = {
  page: Page | null;
  twoFactorRequired: boolean;
  skipped: boolean;
};

export const loginAsSuperadminWithCreds = async (page: Page, creds: AdminCreds) => {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);

  const fallbackMathLabel =
    (await page
      .locator("label")
      .filter({ hasText: /Captcha: Berapa hasil dari|Verifikasi Captcha/i })
      .first()
      .textContent()
      .catch(() => "")) || "";
  const answerFromMath = solveMathExpression(fallbackMathLabel);
  const captchaText = await page
    .locator("div.font-mono.text-xl.tracking-widest span")
    .allTextContents()
    .catch(() => []);
  const captchaAnswer = (answerFromMath || captchaText.join("").trim()).trim();
  expect(captchaAnswer.length).toBeGreaterThanOrEqual(1);
  await page.fill('input[placeholder="Jawaban"], #captcha-input', captchaAnswer);

  await page.getByRole("button", { name: "Masuk ke Panel Admin" }).click();
  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 20_000 });
};

export const loginAsSuperadmin = async (page: Page) => {
  const creds = await getRoleCreds("superadmin");
  test.skip(!creds, "Kredensial superadmin belum diisi di ops/test-accounts.local.json");
  await loginAsSuperadminWithCreds(page, creds!);
  return creds!;
};

export const tryLoginAsSuperadmin = async (
  page: Page,
): Promise<SuperadminLoginAttempt> => {
  const creds = await getRoleCreds("superadmin");
  if (!creds) return { page: null, twoFactorRequired: false, skipped: true };

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);

  const fallbackMathLabel =
    (await page
      .locator("label")
      .filter({ hasText: /Captcha: Berapa hasil dari|Verifikasi Captcha/i })
      .first()
      .textContent()
      .catch(() => "")) || "";
  const answerFromMath = solveMathExpression(fallbackMathLabel);
  const captchaText = await page
    .locator("div.font-mono.text-xl.tracking-widest span")
    .allTextContents()
    .catch(() => []);
  const captchaAnswer = (answerFromMath || captchaText.join("").trim()).trim();
  if (captchaAnswer) {
    await page.fill('input[placeholder="Jawaban"], #captcha-input', captchaAnswer);
  }

  await page.getByRole("button", { name: "Masuk ke Panel Admin" }).click();
  await page.waitForTimeout(2_000);

  const onTwoFactor = await page
    .getByText("Verifikasi 2FA", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);

  if (onTwoFactor) {
    return { page: null, twoFactorRequired: true, skipped: false };
  }

  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 20_000 });
  return { page, twoFactorRequired: false, skipped: false };
};
