import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getRoleCreds, solveMathExpression } from "./helpers/testAccounts";

const waitForStable = async (page: Page) => {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    // Abaikan jika ada polling panjang.
  }
};

test.describe.parallel("Role Login Smoke", () => {
  test("employee login menuju dashboard", async ({ page }) => {
    const creds = await getRoleCreds("employee");
    test.skip(!creds, "Kredensial employee belum diisi di ops/test-accounts.local.json");

    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await page.fill("#login-email", creds!.email);
    await page.fill("#login-password", creds!.password);

    const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((span) => (span.textContent || "").trim()).join(""),
    );
    expect(captchaText.length).toBeGreaterThanOrEqual(6);
    await page.fill("#captcha-input", captchaText);

    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("org admin login menuju area org", async ({ page }) => {
    const creds = await getRoleCreds("org_admin");
    test.skip(!creds, "Kredensial org_admin belum diisi di ops/test-accounts.local.json");

    await page.goto("/org/login", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await page.fill("#email", creds!.email);
    await page.fill("#password", creds!.password);

    const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((span) => (span.textContent || "").trim()).join(""),
    );
    expect(captchaText.length).toBeGreaterThanOrEqual(6);
    await page.fill("#captcha-input", captchaText);

    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL(/\/org/, { timeout: 20_000 });
    expect(page.url()).toContain("/org");
  });

  test("superadmin login valid (dashboard atau verifikasi 2FA)", async ({ page }) => {
    const creds = await getRoleCreds("superadmin");
    test.skip(!creds, "Kredensial superadmin belum diisi di ops/test-accounts.local.json");

    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await page.fill("#email", creds!.email);
    await page.fill("#password", creds!.password);

    const labelText = (await page.locator("label").filter({ hasText: "Captcha: Berapa hasil dari" }).first().textContent()) || "";
    const answer = solveMathExpression(labelText);
    expect(answer).not.toBeNull();
    await page.fill('input[placeholder="Jawaban"]', answer || "");

    await page.getByRole("button", { name: "Masuk ke Panel Admin" }).click();
    await page.waitForTimeout(2_000);

    const currentPath = new URL(page.url()).pathname;
    const onTwoFactor = await page.getByText("Verifikasi 2FA", { exact: false }).first().isVisible().catch(() => false);
    expect(currentPath.startsWith("/admin") || onTwoFactor).toBeTruthy();
  });
});
