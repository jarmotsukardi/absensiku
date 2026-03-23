import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";

test.describe.serial("Admin HR Settings Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Pengaturan" })).toBeVisible();
  });

  test("coverage map dan baseline cards tampil stabil", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Matriks Pengaturan Org ke Admin", exact: true })).toBeVisible();
    await expect(page.getByText("Cakupan /org/hr", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/structure", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "/admin/hr/tenants", exact: true }).first()).toBeVisible();

    await expect(page.getByRole("heading", { name: "Area Kerja Bawaan Tenant Baru", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan Bawaan Global", exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Acuan Bawaan Peringatan Realtime HR", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan Acuan Bawaan Peringatan", exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Acuan Bawaan Kebijakan Tiket HR", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan Acuan Bawaan Kebijakan Tiket", exact: true })).toBeVisible();
  });

  test("filter tenant dan status tetap stabil", async ({ page }) => {
    const searchInput = page.getByLabel("Cari tenant");
    await searchInput.fill("TENANT-SETTINGS-HR-TIDAK-ADA");
    await expect(page.getByText("Tidak ada tenant untuk filter saat ini.", { exact: true }).first()).toBeVisible();

    await searchInput.fill("");
    const statusTrigger = page.getByRole("combobox").first();
    await statusTrigger.click();
    await page.getByRole("option", { name: "Aktif", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Area Kerja per Tenant", exact: true })).toBeVisible();

    await statusTrigger.click();
    await page.getByRole("option", { name: "Nonaktif", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Area Kerja per Tenant", exact: true })).toBeVisible();

    await statusTrigger.click();
    await page.getByRole("option", { name: "Semua", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Area Kerja per Tenant", exact: true })).toBeVisible();
  });

  test("link coverage map menuju kontrol admin tetap benar", async ({ page }) => {
    await page.getByRole("link", { name: "/admin/hr/audit", exact: true }).first().click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/audit$/);

    await page.goto("/admin/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.getByRole("link", { name: "/admin/hr/error-logs", exact: true }).first().click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/error-logs$/);
  });

  test("guide halaman settings tampil di bagian bawah", async ({ page }) => {
    await expectAdminPageGuide(page, "Panduan Pengaturan HR");
  });
});
