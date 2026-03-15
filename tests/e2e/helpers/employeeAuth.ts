import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { waitForStable } from "./orgAuth";
import { getRoleCredsWithFallback, solveMathExpression, type RoleKey } from "./testAccounts";

export const loginAsEmployee = async (page: Page, roles: RoleKey[] = ["employee"]) => {
  const creds = await getRoleCredsWithFallback(roles);
  test.skip(!creds, `Kredensial ${roles.join(" / ")} belum diisi di ops/test-accounts.local.json`);

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
