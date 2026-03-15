import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";

test.describe.serial("Admin HR Profile Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/profile", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Profil HR Tenant" })).toBeVisible();
  });

  test("editor profil, preview, dan shortcut tampil stabil", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Editor Profil Workspace HR", exact: true })).toBeVisible();
    await expect(page.getByLabel("Label Workspace")).toBeVisible();
    await expect(page.getByLabel("Audiens Utama")).toBeVisible();
    await expect(page.getByLabel("Positioning")).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan Profil", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset Default", exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Preview Ringkas", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shortcut Kontrol", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Policies", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka FAQ", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Audit", exact: true })).toBeVisible();
  });

  test("navigasi shortcut dan guide bawah halaman tetap stabil", async ({ page }) => {
    await page.getByRole("link", { name: "Buka Settings", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/settings$/);

    await page.goto("/admin/hr/profile", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.getByRole("link", { name: "Buka Playbook Support", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/help\/support$/);

    await page.goto("/admin/hr/profile", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.getByRole("link", { name: "Buka Tiket HR", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/help\/tickets$/);

    await page.goto("/admin/hr/profile", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expectAdminPageGuide(page, "Panduan Profil Workspace HR");
  });
});
