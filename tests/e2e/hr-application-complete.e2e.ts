import { expect, test } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import type { Page } from "@playwright/test";
import { HR_FOCUSED_SIDEBAR_GROUPS, HR_WORKSPACE_ROUTE_DEFINITIONS } from "@/lib/hrWorkspaceRegistry";

/**
 * E2E Test: HR Application - Route policy aware
 * Tanggal: 2026-03-22
 * Status: mengikuti kontrak HR aktual dari registry, sidebar, dan redirect policy saat ini
 */

const navigateAndVerify = async (page: Page, path: string, heading: string) => {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 10000 });
};

const HR_PAGE_HEADINGS: Record<string, string> = {
  "/org/hr": "Ringkasan HR",
  "/org/hr/employees": "Data Pegawai",
  "/org/hr/structure": "Struktur Organisasi",
  "/org/hr/position-grade": "Jabatan dan Grade",
  "/org/hr/contracts": "Kontrak Kerja",
  "/org/hr/documents": "Dokumen HR",
  "/org/hr/reports": "Laporan HR",
  "/org/hr/settings": "Pengaturan HR",
  "/org/hr/help/faq": "FAQ HR",
  "/org/hr/help/tickets": "Tiket HR",
  "/org/hr/help/error-logs": "Log Error HR",
  "/org/hr/attendance-insights": "Analitik Kehadiran HR",
  "/org/hr/employee-status": "Status Kepegawaian",
  "/org/hr/job-history": "Riwayat Jabatan",
  "/org/hr/document-templates": "Templat Dokumen",
  "/org/hr/onboarding": "Proses Masuk Pegawai",
  "/org/hr/offboarding": "Proses Keluar Pegawai",
  "/org/hr/work-hours": "Data Jam Kerja",
  "/org/hr/shifts": "Pola Shift",
  "/org/hr/late-settings": "Pengaturan Keterlambatan",
  "/org/hr/leave-types": "Jenis Cuti",
  "/org/hr/leave-quota": "Kuota Cuti",
  "/org/hr/leave-approval": "Alur Persetujuan Cuti",
  "/org/hr/mutation-approval": "Permohonan Mutasi",
  "/org/hr/leave-validity": "Masa Berlaku Cuti",
  "/org/hr/kpi": "KPI",
  "/org/hr/performance-periods": "Periode Penilaian",
  "/org/hr/performance-forms": "Form Penilaian",
  "/org/hr/review-360": "Ulasan 360",
  "/org/hr/evaluation-results": "Hasil Evaluasi",
  "/org/hr/training-data": "Data Pelatihan",
  "/org/hr/certifications": "Sertifikasi",
  "/org/hr/skill-matrix": "Matriks Kompetensi",
  "/org/hr/recruitment/jobs": "Lowongan Kerja",
  "/org/hr/recruitment/candidates": "Kandidat",
  "/org/hr/recruitment/interviews": "Tahap Interview",
  "/org/hr/recruitment/offers": "Penawaran Kerja",
  "/org/hr/priority": "Workspace Prioritas HR",
  "/org/hr/ess/requests": "Pengajuan ESS",
  "/org/hr/ess/leave-requests": "Cuti & Izin ESS",
  "/org/hr/ess/wfh-requests": "Pengajuan WFH",
  "/org/hr/ess/flexible-attendance": "Absensi Khusus",
  "/org/hr/ess/overtime-requests": "Pengajuan Lembur",
  "/org/hr/ess/attendance": "Kehadiran ESS",
  "/org/hr/ess/documents": "Dokumen ESS",
  "/org/hr/ess/profile": "Profil ESS",
};

const HR_ROUTE_LABELS = new Map(HR_WORKSPACE_ROUTE_DEFINITIONS.map((route) => [route.path, route.label]));

const HR_SIDEBAR_GROUPS_TO_VERIFY = HR_FOCUSED_SIDEBAR_GROUPS.filter((group) =>
  ["Pegawai", "Administrasi HR", "Operasional", "Kinerja", "Pengembangan", "Rekrutmen", "ESS", "Konfigurasi HR"].includes(group.label),
).map((group) => ({
  label: group.label,
  expectedItems: group.items.map((item) => item.title ?? HR_ROUTE_LABELS.get(item.path) ?? item.path),
}));

const HR_REDIRECT_EXPECTATIONS = HR_WORKSPACE_ROUTE_DEFINITIONS.filter((route) => route.status === "redirect");

test.describe("HR Application - Complete Menu Test", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  });

  test("halaman HR aktif tetap bisa diakses", async ({ page }) => {
    test.setTimeout(300000);

    const failures: Array<{ path: string; heading: string; error: string }> = [];

    for (const [path, heading] of Object.entries(HR_PAGE_HEADINGS)) {
      try {
        await navigateAndVerify(page, path, heading);
      } catch (error) {
        failures.push({
          path,
          heading,
          error: (error as Error).message,
        });
      }
    }

    expect(failures).toEqual([]);
  });

  test("sidebar HR menampilkan label dan grup terbaru", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/org/hr", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    for (const group of HR_SIDEBAR_GROUPS_TO_VERIFY) {
      await page.getByRole("button", { name: group.label, exact: true }).click();
      for (const expectedItem of group.expectedItems) {
        await expect(page.getByText(expectedItem, { exact: true }).first()).toBeVisible();
      }
    }

    await expect(page.getByText("Alias", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Tunda", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Internal", { exact: true })).toHaveCount(0);
  });

  test("route alias diarahkan ke target policy aktual", async ({ page }) => {
    test.setTimeout(180000);

    for (const item of HR_REDIRECT_EXPECTATIONS) {
      await page.goto(item.path, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page).toHaveURL(new RegExp(`${item.redirectTo.replace(/\//g, "\\/")}(?:\\?|$)`));
    }
  });
});
