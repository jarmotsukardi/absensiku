import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";
import { expectMetricCardVisible } from "./helpers/adminMetricCards";

test.describe.serial("Admin HR Tickets Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/help/tickets", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Tiket HR Lintas Tenant" })).toBeVisible();
  });

  test("kartu ringkasan dan tabel tiket tampil stabil", async ({ page }) => {
    const metrics = [
      { title: "Total", note: "Tiket hasil filter saat ini." },
      { title: "Terbuka", note: "Butuh triase awal." },
      { title: "Sedang Diproses", note: "Sedang ditangani." },
      { title: "Selesai", note: "Sudah selesai." },
    ] as const;

    for (const { title, note } of metrics) {
      await expectMetricCardVisible(page, title, note);
    }

    await expect(page.getByRole("heading", { name: "Ringkasan per Tenant", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tiket Terbaru", exact: true })).toBeVisible();
    await expect(page.getByText(/Halaman \d+ dari \d+ \(\d+ tiket\)/, { exact: false })).toBeVisible();
  });

  test("filter, reload, dan pagination tetap stabil", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Cari tiket...");
    const previousButton = page.getByRole("button", { name: "Sebelumnya", exact: true });
    const nextButton = page.getByRole("button", { name: "Berikutnya", exact: true });

    await searchInput.fill("TIKET-HR-TIDAK-ADA");
    await expect(page.getByText("Tidak ada tiket untuk filter saat ini.", { exact: true })).toBeVisible();
    await expect(page.getByText("Tidak ada data tenant untuk filter saat ini.", { exact: true })).toBeVisible();

    await searchInput.fill("");
    const statusTrigger = page.getByRole("combobox").nth(0);
    await statusTrigger.click();
    await page.getByRole("option", { name: "Sedang Diproses", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Tiket Terbaru", exact: true })).toBeVisible();

    const tenantTrigger = page.getByRole("combobox").nth(1);
    await tenantTrigger.click();
    await page.getByRole("option", { name: "Semua Tenant", exact: true }).click();
    await waitForStable(page);

    const pageText = (await page.getByText(/Halaman \d+ dari \d+ \(\d+ tiket\)/, { exact: false }).textContent()) || "";
    const pageMatch = pageText.match(/Halaman (\d+) dari (\d+)/);
    expect(pageMatch).not.toBeNull();
    const totalPages = Number(pageMatch?.[2] || "1");

    if (totalPages <= 1) {
      await expect(previousButton).toBeDisabled();
      await expect(nextButton).toBeDisabled();
    } else {
      await expect(nextButton).toBeEnabled();
      await nextButton.click();
      await expect(page.getByText(new RegExp(`Halaman 2 dari ${totalPages}`))).toBeVisible();
      await expect(previousButton).toBeEnabled();
      await previousButton.click();
      await expect(page.getByText(new RegExp(`Halaman 1 dari ${totalPages}`))).toBeVisible();
    }

    await page.getByRole("button", { name: "Muat Ulang", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Tiket Terbaru", exact: true })).toBeVisible();
  });

  test("navigasi ke dukungan global HR dan guide bawah tampil", async ({ page }) => {
    await page.getByRole("button", { name: "Buka Dukungan Global HR", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/help\/support$/);

    await page.goto("/admin/hr/help/tickets", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expectAdminPageGuide(page, "Panduan Tiket HR Platform");
  });
});
