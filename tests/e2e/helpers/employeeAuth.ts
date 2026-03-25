import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { waitForStable } from "./orgAuth";
import { getRoleCredsWithFallback, solveMathExpression, type RoleKey } from "./testAccounts";

export const loginAsEmployee = async (page: Page, roles: RoleKey[] = ["employee"]) => {
  const creds = await getRoleCredsWithFallback(roles);
  test.skip(!creds, `Kredensial ${roles.join(" / ")} belum diisi di ops/test-accounts.local.json`);

  // Employee login is guarded against desktop browsers. Mimic the approved Safari iPhone path for E2E.
  await page.addInitScript(() => {
    const safariIphoneUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () => safariIphoneUa,
    });
  });

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
  return creds!;
};
