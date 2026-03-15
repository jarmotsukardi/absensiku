import { expect, test } from "@playwright/test";
import { tryLoginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

test.describe("Admin Attendance Report Smoke", () => {
  test("halaman laporan absensi admin dapat dibuka", async ({ page }) => {
    const loginAttempt = await tryLoginAsSuperadmin(page);
    test.skip(loginAttempt.skipped, "Kredensial superadmin belum diisi di ops/test-accounts.local.json");
    test.skip(loginAttempt.twoFactorRequired, "Login superadmin berhenti di verifikasi 2FA");

    await page.goto("/admin/reports/attendance", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page).toHaveURL(/\/admin\/reports\/attendance$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Laporan Absensi", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ekspor Excel", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Glosarium", exact: true })).toBeVisible();
    await expect(page.getByText("Filter Laporan", { exact: true })).toBeVisible();
  });
});
