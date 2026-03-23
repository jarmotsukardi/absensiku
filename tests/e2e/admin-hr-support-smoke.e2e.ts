import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";
import { expectMetricCardVisible } from "./helpers/adminMetricCards";

test.describe.serial("Admin HR Support Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/help/support", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Dukungan Global HR" })).toBeVisible();
  });

  test("ringkasan support, sinyal prioritas, dan playbook tampil stabil", async ({ page }) => {
    const metrics = [
      { title: "Tiket Terbuka", note: "Menunggu triase atau follow-up." },
      { title: "Sedang Diproses", note: "Antrian aktif support HR." },
      { title: "Event SLA 24 Jam", note: "Reminder/escalation overdue." },
      { title: "Error Kritis 24 Jam", note: "Belum resolved dan belum diarsipkan." },
    ] as const;

    for (const { title, note } of metrics) {
      await expectMetricCardVisible(page, title, note);
    }

    await expect(page.getByRole("heading", { name: /Perlu fokus ke error kritis HR|Ada sinyal breach SLA|Belum ada sinyal eskalasi tinggi/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Playbook Eskalasi", exact: true })).toBeVisible();
    await expect(page.getByText("Triase Awal", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matriks Prioritas Insiden", exact: true })).toBeVisible();
    await expect(page.getByText("P1", { exact: true })).toBeVisible();
  });

  test("navigasi support dan guide bawah halaman tetap stabil", async ({ page }) => {
    await page.getByRole("link", { name: "Buka Tiket HR", exact: true }).first().click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/help\/tickets$/);

    await page.goto("/admin/hr/help/support", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.getByRole("link", { name: "Buka Log Error HR", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/error-logs$/);

    await page.goto("/admin/hr/help/support", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.getByRole("link", { name: "Buka FAQ", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/help\/faq$/);

    await page.goto("/admin/hr/help/support", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expectAdminPageGuide(page, "Panduan Support HR");
  });
});
