import { expect, test } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

test.describe.serial("Admin HR Domain Coverage", () => {
  test("kebijakan HR menampilkan domain kinerja, pelatihan, dan ESS", async ({ page }) => {
    await loginAsSuperadmin(page);

    await page.goto("/admin/hr/policies", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.locator("h1").filter({ hasText: "Kebijakan HR" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kontrol Domain Tenant", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Baseline Ulasan 360", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Readiness Pelatihan", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kontrol ESS", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan Baseline Ulasan 360" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan Baseline ESS" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tambah Program" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Tambah Sertifikasi" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tambah Skill" })).toBeVisible();
    await expect(page.getByText("Kinerja dan Pelatihan", { exact: true })).toBeVisible();
    await expect(page.getByText("Rekrutmen dan ESS", { exact: true })).toBeVisible();
    await expect(page.getByText("Fokus Admin", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Siap Operasional", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("KPI dan periode evaluasi", { exact: true })).toBeVisible();
    await expect(page.getByText("Kualitas data personal ESS", { exact: true })).toBeVisible();

    await expect(page.getByText("KPI", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Periode Penilaian", { exact: true })).toBeVisible();
    await expect(page.getByText("Form Penilaian", { exact: true })).toBeVisible();
    await expect(page.getByText("Ulasan 360", { exact: true })).toBeVisible();
    await expect(page.getByText("Hasil Evaluasi", { exact: true })).toBeVisible();
    await expect(page.getByText("Data Pelatihan", { exact: true })).toBeVisible();
    await expect(page.getByText("Sertifikasi", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Matriks Keahlian", { exact: true })).toBeVisible();
    await expect(page.getByText("ESS Pengajuan", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ESS Kehadiran", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ESS Dokumen", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ESS Profil", { exact: true }).first()).toBeVisible();

    await expect(page.getByText("/org/hr/kpi", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/training-data", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/ess/profile", { exact: true }).first()).toBeVisible();
  });

  test("section KPI dan kinerja menampilkan target route org yang aktif", async ({ page }) => {
    await loginAsSuperadmin(page);

    await page.goto("/admin/hr/sections/kpi-performance-baseline", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.locator("h1").filter({ hasText: "KPI & Kinerja Baseline" })).toBeVisible();
    await expect(page.getByText("Template KPI default", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/kpi", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/performance-periods", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/review-360", { exact: true })).toBeVisible();
    await expect(page.getByText("Aktif", { exact: true })).toHaveCount(3);
    await expect(page.getByText("/admin/hr/policies", { exact: true })).toBeVisible();
    await expect(page.getByText("/admin/hr/settings#coverage-map", { exact: true })).toBeVisible();
  });

  test("section ESS menampilkan target layanan mandiri karyawan", async ({ page }) => {
    await loginAsSuperadmin(page);

    await page.goto("/admin/hr/sections/layanan-mandiri-karyawan", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.locator("h1").filter({ hasText: "Layanan Mandiri Karyawan (ESS)" })).toBeVisible();
    await expect(page.getByText("Kontrol baseline superadmin untuk pengalaman self service karyawan.").first()).toBeVisible();
    await expect(page.getByText("/org/hr/ess/requests", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/ess/leave-requests", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/ess/attendance", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/ess/documents", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/ess/profile", { exact: true })).toBeVisible();
    await expect(page.getByText("Aktif", { exact: true })).toHaveCount(5);
    await expect(page.getByText("/admin/hr/audit", { exact: true })).toBeVisible();
    await expect(page.getByText("/admin/hr/policies", { exact: true })).toBeVisible();
  });
});
