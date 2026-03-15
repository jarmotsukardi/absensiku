import { expect, test } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import type { Page } from "@playwright/test";

/**
 * E2E Test: HR Application - Route policy aware
 * Tanggal: 2026-03-12
 * Status: menghormati badge Alias/Tunda/Internal sesuai policy HR saat ini
 */

const navigateAndVerify = async (page: Page, path: string, heading: string) => {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 10000 });
};

test.describe("HR Application - Complete Menu Test", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  });

  test("halaman HR aktif tetap bisa diakses", async ({ page }) => {
    test.setTimeout(120000);

    const menus = [
      { path: "/org/hr", heading: "Ringkasan HR" },
      { path: "/org/hr/employees", heading: "Data Pegawai" },
      { path: "/org/hr/employee-status", heading: "Status Kepegawaian" },
      { path: "/org/hr/job-history", heading: "Riwayat Jabatan" },
      { path: "/org/hr/structure", heading: "Struktur Organisasi" },
      { path: "/org/hr/position-grade", heading: "Jabatan dan Grade" },
      { path: "/org/hr/contracts", heading: "Kontrak Kerja" },
      { path: "/org/hr/documents", heading: "Dokumen HR" },
      { path: "/org/hr/document-templates", heading: "Template Dokumen" },
      { path: "/org/hr/onboarding", heading: "Proses Masuk Pegawai" },
      { path: "/org/hr/offboarding", heading: "Proses Keluar Pegawai" },
      { path: "/org/hr/work-hours", heading: "Data Jam Kerja" },
      { path: "/org/hr/shifts", heading: "Pola Shift" },
      { path: "/org/hr/reports", heading: "Laporan HR" },
      { path: "/org/hr/late-settings", heading: "Pengaturan Keterlambatan" },
      { path: "/org/hr/leave-types", heading: "Jenis Cuti" },
      { path: "/org/hr/leave-quota", heading: "Kuota Cuti" },
      { path: "/org/hr/leave-approval", heading: "Permohonan Cuti" },
      { path: "/org/hr/leave-validity", heading: "Masa Berlaku Cuti" },
      { path: "/org/hr/kpi", heading: "KPI" },
      { path: "/org/hr/performance-periods", heading: "Periode Penilaian" },
      { path: "/org/hr/performance-forms", heading: "Form Penilaian" },
      { path: "/org/hr/review-360", heading: "Ulasan 360" },
      { path: "/org/hr/evaluation-results", heading: "Hasil Evaluasi" },
      { path: "/org/hr/training-data", heading: "Data Pelatihan" },
      { path: "/org/hr/certifications", heading: "Sertifikasi" },
      { path: "/org/hr/skill-matrix", heading: "Matriks Kompetensi" },
      { path: "/org/hr/recruitment/jobs", heading: "Lowongan Kerja" },
      { path: "/org/hr/recruitment/candidates", heading: "Kandidat" },
      { path: "/org/hr/recruitment/interviews", heading: "Tahap Interview" },
      { path: "/org/hr/recruitment/offers", heading: "Penawaran Kerja" },
      { path: "/org/hr/ess/requests", heading: "Pengajuan ESS" },
      { path: "/org/hr/ess/leave-requests", heading: "Permohonan Cuti" },
      { path: "/org/hr/ess/attendance", heading: "Kehadiran Saya" },
      { path: "/org/hr/ess/documents", heading: "Dokumen Saya" },
      { path: "/org/hr/ess/profile", heading: "Profil Saya" },
      { path: "/org/hr/help/faq", heading: "FAQ HR" },
      { path: "/org/hr/help/tickets", heading: "Tiket HR" },
      { path: "/org/hr/settings", heading: "Pengaturan HR" },
    ];

    const failures: Array<{ path: string; heading: string; error: string }> = [];

    for (const menu of menus) {
      try {
        await navigateAndVerify(page, menu.path, menu.heading);
      } catch (error) {
        failures.push({
          path: menu.path,
          heading: menu.heading,
          error: (error as Error).message,
        });
      }
    }

    expect(failures).toEqual([]);
  });

  test("sidebar HR menampilkan badge status route", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/org/hr", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await page.getByRole("button", { name: /Operasional SDM/i }).click();
    await page.getByRole("button", { name: /Layanan Pegawai/i }).click();
    await page.getByRole("button", { name: /Monitoring/i }).click();
    await page.getByRole("button", { name: /Kinerja/i }).click();
    await page.getByRole("button", { name: /Pelatihan/i }).click();
    await page.getByRole("button", { name: /Rekrutmen/i }).click();
    await page.getByRole("button", { name: /ESS/i }).click();
    await page.getByRole("button", { name: /Konfigurasi/i }).click();

    await expect(page.getByText("Status Kepegawaian")).toBeVisible();
    await expect(page.getByText("Template Dokumen")).toBeVisible();
    await expect(page.getByText("Proses Masuk Pegawai")).toBeVisible();
    await expect(page.getByText("Analitik Kehadiran HR")).toBeVisible();
    await expect(page.getByText("KPI")).toBeVisible();
    await expect(page.getByText("Data Pelatihan")).toBeVisible();
    await expect(page.getByText("Lowongan Kerja")).toBeVisible();
    await expect(page.getByText("Pengajuan Saya")).toBeVisible();
    await expect(page.getByText("Hierarki Persetujuan")).toBeVisible();

    await expect(
      page.locator("button, a").filter({ hasText: "Status Kepegawaian" }).getByText("Alias"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Riwayat Jabatan" }).getByText("Alias"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Template Dokumen" }).getByText("Alias"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Proses Keluar Pegawai" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Proses Masuk Pegawai" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Jam Kerja" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Pola Shift" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Pengaturan Keterlambatan" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Jenis Cuti" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Kuota Cuti" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Alur Persetujuan Cuti" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Masa Berlaku Cuti" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Kehadiran Saya" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Dokumen Saya" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Profil Saya" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "KPI" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Data Pelatihan" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Lowongan Kerja" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Pengajuan Saya" }).getByText("Tunda"),
    ).toHaveCount(0);
    await expect(
      page.locator("button, a").filter({ hasText: "Analitik Kehadiran HR" }).getByText("Internal"),
    ).toBeVisible();
    await expect(
      page.locator("button, a").filter({ hasText: "Hierarki Persetujuan" }).getByText("Alias"),
    ).toBeVisible();
  });

  test("route alias dan route tunda diarahkan ke halaman target policy", async ({ page }) => {
    test.setTimeout(90000);

    const redirects = [
      { path: "/org/hr/approval-hierarchy", target: "/org/hr/settings" },
      { path: "/org/hr/attendance-insights", target: "/org/hr" },
      { path: "/org/hr/help/error-logs", target: "/org/hr" },
    ];

    for (const item of redirects) {
      await page.goto(item.path, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page).toHaveURL(new RegExp(`${item.target.replace(/\//g, "\\/")}(?:\\?|$)`));
    }
  });
});
