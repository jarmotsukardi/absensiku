import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(CURRENT_DIR, "..", "..");
const SIDEBAR_FILE = path.join(ROOT_DIR, "src", "components", "admin", "superadmin", "SuperAdminSidebar.tsx");

const collectHrSidebarPaths = (): string[] => {
  const content = fs.readFileSync(SIDEBAR_FILE, "utf8");
  const start = content.indexOf("const hrMenuGroups");
  const end = content.indexOf("const payrollMenuGroups");
  const section = content.slice(start, end);
  const paths = [...section.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
  return [...new Set(paths)];
};

test.describe.serial("Admin HR Menu Route Guard", () => {
  test("semua link menu/submenu HR superadmin tidak boleh lari ke absensi umum", async ({ page }) => {
    test.setTimeout(240_000);

    await loginAsSuperadmin(page);

    await page.goto("/admin/hr", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const paths = collectHrSidebarPaths();
    const violations: Array<{ path: string; finalPath: string }> = [];

    for (const target of paths) {
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      const finalPath = new URL(page.url()).pathname;
      const allowed = finalPath.startsWith("/admin/hr") || finalPath.startsWith("/admin/payroll");
      if (!allowed) {
        violations.push({ path: target, finalPath });
      }
    }

    if (violations.length > 0) {
      console.table(violations);
    }

    expect(violations, `Ditemukan ${violations.length} link menu HR yang keluar workspace`).toEqual([]);
  });
});
