import { test, expect } from "@playwright/test";
import { loginAsEmployee } from "./helpers/employeeAuth";
import { loginAsOrgAdmin, loginAsOrgUser, waitForStable } from "./helpers/orgAuth";
import { openOrgWorkspaceWithRetry } from "./helpers/orgWorkspace";

test.describe.serial("Org HR Workspace Smoke", () => {
  test("halaman HR workspace utama dapat dibuka", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await openOrgWorkspaceWithRetry(page, "/org/hr");
    await expect(page).toHaveURL(/\/org\/hr(?:\?|$)/, { timeout: 20_000 });

    const pages = [
      { path: "/org/hr/employees", heading: "Data Pegawai" },
      { path: "/org/hr/structure", heading: "Struktur Organisasi" },
      { path: "/org/hr/position-grade", heading: "Jabatan dan Grade" },
      { path: "/org/hr/contracts", heading: "Kontrak Kerja" },
      { path: "/org/hr/documents", heading: "Dokumen HR" },
      { path: "/org/hr/reports", heading: "Laporan HR" },
      { path: "/org/hr/settings", heading: "Pengaturan HR" },
    ];

    await expect(page.getByRole("heading", { name: "Ringkasan HR", exact: true })).toBeVisible();

    for (const item of pages) {
      await page.goto(item.path, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: item.heading, exact: true })).toBeVisible();
    }

    await page.goto("/org/hr", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Aksi Cepat HR", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Data Pegawai", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka Kontrak Kerja", exact: true })).toBeVisible();
  });

  test("halaman HR Contracts dapat dibuka + search keyword spesial aman", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);

    await page.goto("/org/hr/contracts", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Kontrak Kerja", exact: true })).toBeVisible();
    const searchInput = page.getByPlaceholder("Cari nama pegawai, email, nomor kontrak...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`'kontrak, aktif() % test`);
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Kontrak Kerja", exact: true })).toBeVisible();
  });

  test("halaman Pengaturan HR menampilkan kontrol area kerja dan tata kelola tenant", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await page.goto("/org/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Pengaturan HR", exact: true })).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^Area Kerja HR$/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ringkasan Tata Kelola Tenant", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matriks Kebutuhan /org/hr", exact: true })).toBeVisible();
  });

  test("non-admin (pegawai) tidak bisa mengakses HR Settings dan Payroll Workspace", async ({ page }) => {
    try {
      await loginAsEmployee(page, ["employee", "employee_centralized"]);
    } catch {
      await page.goto("/employee/login", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
    }

    await page.goto("/org/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).not.toHaveURL(/\/org\/hr\/settings(?:\?|$)/, { timeout: 20_000 });

    await page.goto("/org/payroll", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).not.toHaveURL(/\/org\/payroll(?:\?|$)/, { timeout: 20_000 });
  });

  test("operator (atasan) tidak bisa mengakses workspace HR/Payroll", async ({ page }) => {
    await loginAsOrgUser(page, ["org_operator"]);

    await page.goto("/org/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).not.toHaveURL(/\/org\/hr\/settings(?:\?|$)/, { timeout: 20_000 });

    await page.goto("/org/payroll", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).not.toHaveURL(/\/org\/payroll(?:\?|$)/, { timeout: 20_000 });
  });
});
