import { test, expect } from "@playwright/test";
import { tryLoginAsSuperadmin } from "./helpers/adminAuth";
import { loginAsEmployee } from "./helpers/employeeAuth";
import { loginAsOrgAdmin } from "./helpers/orgAuth";

test.describe.parallel("Role Login Smoke", () => {
  test("employee login menuju dashboard", async ({ page }) => {
    await loginAsEmployee(page, ["employee"]);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("org admin login menuju area org", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin"]);
  });

  test("superadmin login valid (dashboard atau verifikasi 2FA)", async ({ page }) => {
    const loginAttempt = await tryLoginAsSuperadmin(page);
    test.skip(loginAttempt.skipped, "Kredensial superadmin belum diisi di ops/test-accounts.local.json");
    const currentPath = new URL(page.url()).pathname;
    const onTwoFactor = await page.getByText("Verifikasi 2FA", { exact: false }).first().isVisible().catch(() => false);
    const leftLoginPage = currentPath !== "/admin/login";
    expect((leftLoginPage && currentPath.startsWith("/admin")) || onTwoFactor).toBeTruthy();
  });
});
