import { expect, test } from "@playwright/test";

import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

test.describe.serial("Org HR Leave Route Context", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  });

  test("route approval cuti HR memakai konteks HR, bukan tab absensi umum", async ({ page }) => {
    await page.goto("/org/hr/leave-approval", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Alur Persetujuan Cuti", exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Proses antrian persetujuan cuti/izin dari perspektif HR dan pastikan keputusan tetap sinkron dengan kuota serta hierarki tenant.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Kuota Cuti", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Jenis Cuti", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Hierarki Persetujuan", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Panduan Persetujuan Cuti", exact: true }).first()).toBeVisible();
    await expect(page.getByText("Glosarium & Penjelasan Permohonan Kehadiran", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Pengajuan Lembur", exact: true })).toHaveCount(0);
  });

  test("route ESS leave HR memakai konteks ESS dan menahan affordance approve", async ({ page }) => {
    await page.goto("/org/hr/ess/leave-requests", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Cuti & Izin ESS", exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Pantau dan proses permohonan cuti/izin dari kanal self-service pegawai tanpa keluar dari konteks HR tenant.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Ringkasan ESS", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Panduan Pengajuan Cuti ESS", exact: true }).first()).toBeVisible();
    await expect(page.getByText("Capability halaman: monitoring hanya-baca", { exact: true })).toBeVisible();
    await expect(page.locator("tbody tr td.text-right button:not([disabled])")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Pengajuan Lembur", exact: true })).toHaveCount(0);
  });
});
