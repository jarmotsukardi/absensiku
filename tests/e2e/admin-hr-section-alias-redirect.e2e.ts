import { expect, test } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

const ALIAS_ROUTES: Array<{ oldPath: string; canonicalPath: string }> = [
  { oldPath: "/admin/hr/sections/struktur-organisasi", canonicalPath: "/admin/hr/sections/struktur-unit-organisasi" },
  { oldPath: "/admin/hr/sections/departemen", canonicalPath: "/admin/hr/sections/struktur-unit-organisasi" },
  { oldPath: "/admin/hr/sections/divisi", canonicalPath: "/admin/hr/sections/struktur-unit-organisasi" },
  { oldPath: "/admin/hr/sections/jabatan", canonicalPath: "/admin/hr/sections/jabatan-grade" },
  { oldPath: "/admin/hr/sections/lokasi-kerja", canonicalPath: "/admin/hr/sections/lokasi-kalender-kerja" },
  { oldPath: "/admin/hr/sections/kalender-kerja", canonicalPath: "/admin/hr/sections/lokasi-kalender-kerja" },
];

test.describe.serial("Admin HR Section Alias Redirect", () => {
  test("route alias lama otomatis redirect ke canonical route", async ({ page }) => {
    test.setTimeout(240_000);

    await loginAsSuperadmin(page);

    for (const route of ALIAS_ROUTES) {
      await page.goto(route.oldPath, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      expect(new URL(page.url()).pathname).toBe(route.canonicalPath);
    }
  });
});
