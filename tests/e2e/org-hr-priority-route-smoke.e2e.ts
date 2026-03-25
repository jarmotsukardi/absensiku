import { expect, test } from "@playwright/test";

import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

test.describe.serial("Org HR Priority Route Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  });

  test("shortcut pengaturan HR membuka workspace prioritas yang valid", async ({ page }) => {
    await page.goto("/org/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Pengaturan HR", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Audit", exact: true }).click();
    await page.getByRole("button", { name: "Buka Prioritas", exact: true }).click();
    await waitForStable(page);

    await expect(page).toHaveURL(/\/org\/hr\/settings\?hr_overlay=.*%2Forg%2Fhr%2Fpriority/);
    await expect(page.getByRole("heading", { name: "Halaman Organisasi Dibuka sebagai Overlay", exact: true })).toBeVisible();
    await expect(page.locator('iframe[title="Overlay /org/hr/priority"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Buka Penuh", exact: true }).click();
    await waitForStable(page);

    await expect(page).toHaveURL(/\/org\/hr\/priority(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Workspace Prioritas HR", exact: true })).toBeVisible();
  });

  test("alias priority-workspace diarahkan ke route canonical", async ({ page }) => {
    await page.goto("/org/hr/priority-workspace", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page).toHaveURL(/\/org\/hr\/priority(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Workspace Prioritas HR", exact: true })).toBeVisible();
  });

  test("sidebar ESS memakai label admin yang konsisten", async ({ page }) => {
    await page.goto("/org/hr", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await page.getByRole("button", { name: /ESS/i }).click();

    await expect(page.getByText("Pengajuan ESS", { exact: true })).toBeVisible();
    await expect(page.getByText("Cuti & Izin ESS", { exact: true })).toBeVisible();
    await expect(page.getByText("Kehadiran ESS", { exact: true })).toBeVisible();
    await expect(page.getByText("Dokumen ESS", { exact: true })).toBeVisible();
    await expect(page.getByText("Profil ESS", { exact: true })).toBeVisible();
  });
});
