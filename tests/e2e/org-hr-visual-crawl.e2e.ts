import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

type CrawlIssueKind = "redirect_unexpected" | "missing_heading" | "not_found_marker" | "menu_tab_overlap";

type CrawlIssue = {
  route: string;
  finalPath: string;
  kind: CrawlIssueKind;
  detail: string;
};

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(CURRENT_DIR, "..", "..");
const APP_FILE = path.join(ROOT_DIR, "src", "App.tsx");
const HR_ROUTE_ACCESS_FILE = path.join(ROOT_DIR, "src", "lib", "hrRouteAccess.ts");

const collectHrRoutes = (): string[] => {
  const content = fs.readFileSync(APP_FILE, "utf8");
  const matches = [...content.matchAll(/path="(\/org\/hr[^"]*)"/g)].map((m) => m[1]);
  const unique = [...new Set(matches)];

  return unique
    .filter((route) => route !== "/org/hr/help")
    .sort((a, b) => a.localeCompare(b));
};

const collectAllowedRedirects = (): Record<string, string[]> => {
  const content = fs.readFileSync(HR_ROUTE_ACCESS_FILE, "utf8");
  const constants: Record<string, string> = {
    HR_HELP_REDIRECT: "/org/hr/help/tickets",
    HR_WORKSPACE_REDIRECT: "/org/hr",
  };
  const redirects: Record<string, string[]> = {};

  const routePolicyPattern =
    /"([^"]+)":\s*\{[^}]*status:\s*"([^"]+)"[^}]*redirectTo:\s*("[^"]+"|HR_HELP_REDIRECT|HR_WORKSPACE_REDIRECT)/g;

  for (const match of content.matchAll(routePolicyPattern)) {
    const route = match[1];
    const status = match[2];
    const rawRedirect = match[3];
    if (status === "tampil") continue;

    const redirectTo = rawRedirect.startsWith('"')
      ? rawRedirect.slice(1, -1)
      : constants[rawRedirect] || "";

    if (!redirectTo) continue;
    redirects[route] = [redirectTo];
  }

  return redirects;
};

const ALLOWED_REDIRECTS = collectAllowedRedirects();

const NOT_FOUND_MARKERS = [
  /halaman tidak ditemukan/i,
  /page not found/i,
  /the page you are looking for/i,
];
const HR_MENU_AND_SUBMENU_LABELS = new Set([
  "dashboard",
  "organization",
  "employee",
  "attendance",
  "leave",
  "performance",
  "training",
  "legal",
  "access",
  "settings",
  "help",
  "organization management",
  "employee management",
  "attendance management",
  "leave & permission",
  "performance management",
  "training & development",
  "document & legal",
  "user & access management",
  "system settings",
  "ringkasan karyawan",
  "statistik kehadiran",
  "status cuti",
  "notifikasi",
  "aktivitas terbaru",
  "data perusahaan",
  "struktur organisasi",
  "departemen",
  "divisi",
  "jabatan",
  "lokasi kerja",
  "kalender kerja",
  "data karyawan",
  "kontrak kerja",
  "status kepegawaian",
  "riwayat jabatan",
  "dokumen karyawan",
  "onboarding",
  "offboarding",
  "jam kerja",
  "shift",
  "hari libur nasional",
  "pengaturan keterlambatan",
  "integrasi absensi",
  "rekap absensi",
  "jenis cuti",
  "kuota cuti",
  "approval flow",
  "rekap cuti",
  "pengaturan masa berlaku",
  "kpi",
  "periode penilaian",
  "form penilaian",
  "360 review",
  "hasil evaluasi",
  "data training",
  "sertifikasi",
  "skill matrix",
  "template dokumen",
  "surat peringatan",
  "kontrak template",
  "digital signature",
  "user management",
  "role management",
  "permission setting",
  "approval hierarchy",
  "audit log",
  "general settings",
  "branding",
  "email & notifikasi",
  "import / export data",
  "backup",
]);

test.describe.serial("Org HR Visual Crawl", () => {
  test("crawl semua submenu /org/hr/* cek heading + 404 + redirect", async ({ page }) => {
    test.setTimeout(420_000);

    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);

    const routes = collectHrRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const issues: CrawlIssue[] = [];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await waitForStable(page);

      const finalPath = new URL(page.url()).pathname;
      const allowedRedirects = ALLOWED_REDIRECTS[route] || [];
      const allowedDirect = finalPath === route || finalPath.startsWith(`${route}/`);
      const allowedMappedRedirect = allowedRedirects.some(
        (redirectPath) => finalPath === redirectPath || finalPath.startsWith(`${redirectPath}/`),
      );

      if (!allowedDirect && !allowedMappedRedirect) {
        issues.push({
          route,
          finalPath,
          kind: "redirect_unexpected",
          detail: "URL akhir tidak sesuai route target",
        });
      }

      const shouldValidateHeading = allowedDirect;
      const mainHeadingCount = await page.locator("main h1, main h2, main [role='heading'], h1").count();
      if (shouldValidateHeading && mainHeadingCount < 1) {
        issues.push({
          route,
          finalPath,
          kind: "missing_heading",
          detail: "Tidak ada heading di area main",
        });
      }

      const bodyText = (await page.locator("body").innerText()).slice(0, 6000);
      const notFoundHit = NOT_FOUND_MARKERS.find((pattern) => pattern.test(bodyText));
      if (notFoundHit) {
        issues.push({
          route,
          finalPath,
          kind: "not_found_marker",
          detail: `Marker terdeteksi: ${notFoundHit}`,
        });
      }

      const tabLabels = (
        await page.locator("[role='tab']").allTextContents()
      ).map((label) => label.trim().toLowerCase());
      const overlap = tabLabels.find((label) => HR_MENU_AND_SUBMENU_LABELS.has(label));
      if (overlap) {
        issues.push({
          route,
          finalPath,
          kind: "menu_tab_overlap",
          detail: `Label tab bentrok menu: ${overlap}`,
        });
      }
    }

    if (issues.length > 0) {
      console.table(issues);
    }

    expect(issues, `Ditemukan ${issues.length} issue visual crawl`).toEqual([]);
  });
});
