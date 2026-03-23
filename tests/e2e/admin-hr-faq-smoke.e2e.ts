import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";
import { expectMetricCardVisible } from "./helpers/adminMetricCards";

test.describe.serial("Admin HR FAQ Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/help/faq", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "FAQ Platform HR" })).toBeVisible();
  });

  test("kartu ringkasan dan panel FAQ tampil stabil", async ({ page }) => {
    const metrics = [
      { title: "FAQ Aktif", note: "Item FAQ yang siap dipakai tim support." },
      { title: "Kategori", note: "Kelompok topik untuk navigasi internal." },
      { title: "Hasil Pencarian", note: "Item yang cocok dengan query saat ini." },
    ] as const;

    for (const { title, note } of metrics) {
      await expectMetricCardVisible(page, title, note);
    }

    await expect(page.getByRole("heading", { name: "Cari FAQ HR", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Manajemen FAQ Global", exact: true })).toBeVisible();
  });

  test("search FAQ, accordion, dan navigasi global tetap stabil", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Cari topik, pertanyaan, atau jawaban...");
    await searchInput.fill("tenant");
    await waitForStable(page);
    await expect(page.getByText(/Hasil Pencarian/i)).toBeVisible();

    const firstTrigger = page.getByRole("button").filter({ hasText: /\?$/ }).first();
    await expect(firstTrigger).toBeVisible();
    await firstTrigger.click();
    await expect(firstTrigger).toHaveAttribute("data-state", "open");

    await page.getByRole("link", { name: "Buka Manajemen FAQ Global", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/faq$/);
  });

  test("guide halaman faq tampil di bagian bawah", async ({ page }) => {
    await page.goto("/admin/hr/help/faq", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expectAdminPageGuide(page, "Panduan FAQ HR Platform");
  });
});
