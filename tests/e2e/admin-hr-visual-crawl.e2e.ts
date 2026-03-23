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

test.describe.serial("Admin HR Visual Crawl", () => {
  test("seluruh submenu admin/hr dapat dimuat tanpa 404 dan tanpa tab navigasi ganda", async ({ page }) => {
    test.setTimeout(300_000);

    await loginAsSuperadmin(page);

    const paths = collectHrSidebarPaths();
    const violations: Array<{ path: string; issue: string }> = [];

    for (const target of paths) {
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await waitForStable(page);

      const finalPath = new URL(page.url()).pathname;
      if (!finalPath.startsWith("/admin/hr") && !finalPath.startsWith("/admin/payroll")) {
        violations.push({ path: target, issue: `Keluar workspace: ${finalPath}` });
        continue;
      }

      const bodyText = ((await page.locator("body").innerText()) || "").toLowerCase();
      if (
        bodyText.includes("404") ||
        bodyText.includes("halaman tidak ditemukan") ||
        bodyText.includes("page not found")
      ) {
        violations.push({ path: target, issue: "Terdeteksi konten 404/not found" });
      }

      const headingCount = await page.locator("h1, h2").count();
      if (headingCount === 0) {
        violations.push({ path: target, issue: "Heading utama tidak ditemukan" });
      }

      const tabListCount = await page.locator('[role="tablist"]').count();
      if (tabListCount > 0) {
        violations.push({ path: target, issue: `Tablist ditemukan (${tabListCount})` });
      }
    }

    if (violations.length > 0) {
      console.table(violations);
    }

    expect(violations, `Ditemukan ${violations.length} temuan pada crawl visual admin/hr`).toEqual([]);
  });
});
