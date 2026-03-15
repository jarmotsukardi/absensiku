import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectMetricCardWithCount } from "./helpers/adminMetricCards";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";

test.describe.serial("Admin HR Tenants Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/tenants", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Tenant HR" })).toBeVisible();
  });

  test("kartu ringkasan dan tabel tenant tampil stabil", async ({ page }) => {
    const metrics = [
      { title: "Total Tenant", note: "Tenant yang terdaftar di platform." },
      { title: "HR Aktif", note: "Tenant dengan workspace HR aktif." },
      { title: "Alert Realtime", note: "Tenant yang menyalakan alert error HR." },
      { title: "Perlu Perhatian", note: "Tenant dengan error kritis terbuka." },
    ] as const;

    for (const { title, note } of metrics) {
      await expectMetricCardWithCount(page, title, note);
    }

    await expect(page.getByRole("heading", { name: "Daftar Tenant HR", exact: true })).toBeVisible();
    await expect(page.getByText(/Menampilkan \d+-\d+ dari \d+ tenant/, { exact: false })).toBeVisible();
    await expect(page.getByText(/Halaman \d+ \/ \d+/, { exact: false })).toBeVisible();
  });

  test("search, reload, dan pagination tetap stabil", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Cari nama, kode, atau id tenant...");
    const previousButton = page.getByRole("button", { name: "Sebelumnya", exact: true });
    const nextButton = page.getByRole("button", { name: "Berikutnya", exact: true });

    await searchInput.fill("TENANT-HR-TIDAK-ADA");
    await expect(page.getByText("Tidak ada tenant yang cocok dengan pencarian ini.", { exact: true })).toBeVisible();
    await expect(page.getByText("Menampilkan 0-0 dari 0 tenant", { exact: true })).toBeVisible();

    await searchInput.fill("");
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Daftar Tenant HR", exact: true })).toBeVisible();

    const pageText = (await page.getByText(/Halaman \d+ \/ \d+/, { exact: false }).textContent()) || "";
    const pageMatch = pageText.match(/Halaman (\d+) \/ (\d+)/);
    expect(pageMatch).not.toBeNull();
    const totalPages = Number(pageMatch?.[2] || "1");

    if (totalPages <= 1) {
      await expect(previousButton).toBeDisabled();
      await expect(nextButton).toBeDisabled();
    } else {
      await expect(nextButton).toBeEnabled();
      await nextButton.click();
      await expect(page.getByText(new RegExp(`Halaman 2 \\/ ${totalPages}`))).toBeVisible();
      await expect(previousButton).toBeEnabled();
      await previousButton.click();
      await expect(page.getByText(new RegExp(`Halaman 1 \\/ ${totalPages}`))).toBeVisible();
    }

    await page.getByRole("button", { name: "Muat Ulang", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Daftar Tenant HR", exact: true })).toBeVisible();
  });

  test("link tenant menuju error logs dan settings tetap benar", async ({ page }) => {
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();

    const firstRow = rows.first();
    const tenantMeta = (((await firstRow.locator("td").first().textContent()) || "").trim());
    const tenantIdMatch = tenantMeta.match(/[0-9a-fA-F-]{36}/);
    expect(tenantIdMatch).not.toBeNull();
    const tenantId = tenantIdMatch?.[0] || "";

    await firstRow.getByRole("link", { name: "Log Error", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(new RegExp(`/admin/hr/error-logs\\?tenant=${tenantId}`));

    await page.goto("/admin/hr/tenants", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.locator("tbody tr").first().getByRole("link", { name: "Settings", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/settings#workspace-tenant$/);
  });

  test("guide halaman tenant tampil di bagian bawah", async ({ page }) => {
    await expectAdminPageGuide(page, "Panduan Tenant HR");
  });
});
