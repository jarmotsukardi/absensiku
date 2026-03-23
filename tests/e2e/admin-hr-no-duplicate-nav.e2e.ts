import { expect, test } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

const HR_ROUTES = [
  "/admin/hr",
  "/admin/hr/tenants",
  "/admin/hr/policies",
  "/admin/hr/error-logs",
  "/admin/hr/audit",
  "/admin/hr/settings",
  "/admin/hr/help",
  "/admin/hr/help/faq",
  "/admin/hr/help/support",
  "/admin/hr/help/tickets",
  "/admin/hr/sections/struktur-unit-organisasi",
  "/admin/hr/sections/jabatan-grade",
  "/admin/hr/sections/lokasi-kalender-kerja",
];

test.describe.serial("Admin HR No Duplicate Navigation", () => {
  test("halaman /admin/hr tidak menampilkan tab navigasi ganda", async ({ page }) => {
    test.setTimeout(240_000);

    await loginAsSuperadmin(page);

    for (const target of HR_ROUTES) {
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await waitForStable(page);

      const tabListCount = await page.locator('[role="tablist"]').count();
      expect(tabListCount, `Tablist ditemukan di ${target}`).toBe(0);
      const tabCount = await page.locator('[role="tab"]').count();
      expect(tabCount, `Elemen tab ditemukan di ${target}`).toBe(0);
    }
  });
});
