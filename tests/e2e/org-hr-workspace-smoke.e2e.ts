import { test, expect } from "@playwright/test";
import { loginAsEmployee } from "./helpers/employeeAuth";
import { loginAsOrgAdmin, loginAsOrgUser, waitForStable } from "./helpers/orgAuth";
import type { Page } from "@playwright/test";
import {
  ensureOrgWorkspaceStateFromOnboarding,
  openOrgWorkspaceWithRetry,
  setOrgWorkspaceToggle,
} from "./helpers/orgWorkspace";

test.describe.serial("Org HR Workspace Smoke", () => {
  test("halaman HR workspace utama dapat dibuka", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceStateFromOnboarding(page, "Aktifkan workspace HR", true);
    await setOrgWorkspaceToggle(page, "Aktifkan workspace Payroll", true);
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
    await expect(page.getByText("Laporan Absensi & Rekap")).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    const header = page.locator("header").first();
    await header.getByRole("button", { name: "HR", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Absensi" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Payroll" })).toHaveCount(1);
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

  test("guard HR aktif: saat HR dimatikan akses /org/hr diarahkan ke /org lalu bisa diaktifkan lagi", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceStateFromOnboarding(page, "Aktifkan workspace HR", true);

    await page.goto("/org/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Pengaturan HR", exact: true })).toBeVisible();

    const hrSwitch = page.getByRole("switch", { name: "Workspace HR" });
    const initialChecked = await hrSwitch.isChecked();
    if (!initialChecked) {
      await hrSwitch.click();
      await waitForStable(page);
    }

    await hrSwitch.click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/org(?:\?|$)/, { timeout: 20_000 });

    await page.goto("/org/hr", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).toHaveURL(/\/org(?:\?|$)/, { timeout: 20_000 });

    await ensureOrgWorkspaceStateFromOnboarding(page, "Aktifkan workspace HR", true);

    await page.goto("/org/hr", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await openOrgWorkspaceWithRetry(page, "/org/hr");
    await expect(page).toHaveURL(/\/org\/hr(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Ringkasan HR", exact: true })).toBeVisible();
  });

  test("guard Payroll aktif: saat Payroll dimatikan akses /org/payroll diarahkan ke /org lalu bisa diaktifkan lagi", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceStateFromOnboarding(page, "Aktifkan workspace Payroll", true);

    await ensureOrgWorkspaceStateFromOnboarding(page, "Aktifkan workspace Payroll", false);

    await page.goto("/org/payroll", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).toHaveURL(/\/org(?:\?|$)/, { timeout: 20_000 });

    await ensureOrgWorkspaceStateFromOnboarding(page, "Aktifkan workspace Payroll", true);

    await page.goto("/org/payroll", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await openOrgWorkspaceWithRetry(page, "/org/payroll");
    await expect(page).toHaveURL(/\/org\/payroll(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Payroll Workspace", exact: true })).toBeVisible();
  });

  test("non-admin (pegawai) tidak bisa mengakses HR Settings dan Payroll Workspace", async ({ page }) => {
    await loginAsEmployee(page, ["employee", "employee_centralized"]);

    await page.goto("/org/hr/settings", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).toHaveURL(/\/employee\/dashboard(?:\?|$)/, { timeout: 20_000 });

    await page.goto("/org/payroll", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page).toHaveURL(/\/employee\/dashboard(?:\?|$)/, { timeout: 20_000 });
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

  test("app switcher sinkron dengan toggle workspace HR/Payroll", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);

    await page.goto("/org/onboarding", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await setOrgWorkspaceToggle(page, "Aktifkan workspace HR", false);
    await setOrgWorkspaceToggle(page, "Aktifkan workspace Payroll", false);

    const header = page.locator("header").first();
    await header.getByRole("button", { name: "Absensi", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "HR" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Payroll" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await ensureOrgWorkspaceStateFromOnboarding(page, "Aktifkan workspace HR", true);
    await setOrgWorkspaceToggle(page, "Aktifkan workspace Payroll", true);

    await header.getByRole("button", { name: "Absensi", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "HR" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Payroll" })).toHaveCount(1);
  });
});
