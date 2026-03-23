import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";
import { expectMetricCardVisible } from "./helpers/adminMetricCards";

test.describe.serial("Admin HR Help Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/help", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Pusat Bantuan Platform HR" })).toBeVisible();
  });

  test("ringkasan helpdesk dan kartu navigasi tampil stabil", async ({ page }) => {
    const metrics = [
      { title: "Terbuka", note: "Tiket menunggu triase." },
      { title: "Sedang Diproses", note: "Tiket sedang diproses." },
      { title: "Selesai", note: "Tiket sudah selesai." },
      { title: "Event 24 Jam", note: "Perubahan status dalam 24 jam." },
    ] as const;

    for (const { title, note } of metrics) {
      await expectMetricCardVisible(page, title, note);
    }

    await expect(page.getByRole("link", { name: "Buka Tiket HR", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka FAQ HR", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Bantuan HR", exact: true })).toBeVisible();
  });

  test("filter tenant, reload, dan navigasi kartu tetap stabil", async ({ page }) => {
    const tenantSearch = page.getByPlaceholder("Cari tenant...");
    await tenantSearch.fill("TENANT-HELP-HR-TIDAK-ADA");

    const tenantTrigger = page.getByRole("combobox").first();
    await tenantTrigger.click();
    await expect(page.getByRole("option", { name: "Semua Tenant", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Semua Tenant", exact: true }).click();
    await waitForStable(page);

    await tenantSearch.fill("");
    await page.getByRole("button", { name: "Muat Ulang", exact: true }).click();
    await waitForStable(page);

    await page.getByRole("link", { name: "Buka FAQ HR", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/help\/faq$/);
  });

  test("guide halaman helpdesk tampil di bagian bawah", async ({ page }) => {
    await expectAdminPageGuide(page, "Panduan Helpdesk HR");
  });
});
