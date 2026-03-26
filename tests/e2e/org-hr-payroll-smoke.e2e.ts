import { test, expect, type Page } from "@playwright/test";
import { loginAsPayrollOrgAdmin, skipIfOrgFirstRunFlowActive, waitForStable } from "./helpers/orgAuth";
import { ensureOrgWorkspaceEnabled, openOrgWorkspaceWithRetry } from "./helpers/orgWorkspace";

const loginAsReadyPayrollOrgAdmin = async (page: Page) => {
  await loginAsPayrollOrgAdmin(page);
  await skipIfOrgFirstRunFlowActive(
    page,
    "Tenant payroll smoke masih berada di flow setup awal sehingga suite HR/Payroll belum bisa dijalankan.",
  );
};

test.describe.serial("Org HR/Payroll Smoke", () => {
  test("halaman HR workspace tambahan dapat dibuka", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    const pages = [
      { path: "/org/hr/employees", heading: "Data Pegawai" },
      { path: "/org/hr/structure", heading: "Struktur Organisasi" },
      { path: "/org/hr/position-grade", heading: "Jabatan dan Grade" },
      { path: "/org/hr/documents", heading: "Dokumen HR" },
      { path: "/org/hr/reports", heading: "Laporan HR" },
      { path: "/org/hr/settings", heading: "Pengaturan HR" },
    ];

    for (const item of pages) {
      await openOrgWorkspaceWithRetry(page, item.path, item.heading);
      await expect(page.getByRole("heading", { name: item.heading, exact: true })).toBeVisible();
    }
  });

  test("halaman HR Contracts dapat dibuka + search keyword spesial aman", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/contracts", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Kontrak Kerja", exact: true })).toBeVisible();
    const searchInput = page.getByPlaceholder("Cari nama pegawai, email, nomor kontrak...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`'kontrak, aktif() % test`);
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Kontrak Kerja", exact: true })).toBeVisible();
  });

  test("halaman Payroll Policies dapat dibuka + search keyword spesial aman", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    await page.goto("/org/payroll/policies", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Kebijakan Payroll", exact: true })).toBeVisible();
    const searchInput = page.getByPlaceholder("Cari tanggal efektif, mode pembulatan, catatan...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`overtime, manual() 'aktif'`);
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Kebijakan Payroll", exact: true })).toBeVisible();
  });

  test("halaman Payroll Periods dapat dibuka + search keyword spesial aman", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    await page.goto("/org/payroll/periods", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Periode Payroll", exact: true })).toBeVisible();
    const searchInput = page.getByPlaceholder("Cari period key, tanggal, atau catatan...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`2026-02, review() 'cek'`);
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Periode Payroll", exact: true })).toBeVisible();
  });

  test("halaman Payroll Validation dapat dibuka + search keyword spesial aman", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    await page.goto("/org/payroll/validation", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Validasi Payroll", exact: true })).toBeVisible();
    const searchInput = page.getByPlaceholder("Cari ID trace, period key, atau catatan...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`trace-1, warning() 'validasi'`);
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Validasi Payroll", exact: true })).toBeVisible();
  });

  test("halaman blueprint Payroll dapat dibuka", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    const pages = [
      { path: "/org/payroll/employees", heading: "Data Pegawai Payroll" },
      { path: "/org/payroll/org-grade", heading: "Struktur Organisasi dan Grade" },
      { path: "/org/payroll/income-components", heading: "Komponen Penghasilan" },
      { path: "/org/payroll/deduction-components", heading: "Komponen Potongan" },
      { path: "/org/payroll/variable-input", heading: "Input Variabel Bulanan" },
      { path: "/org/payroll/run-engine", heading: "Proses Payroll" },
      { path: "/org/payroll/approval", heading: "Persetujuan Payroll" },
      { path: "/org/payroll/slips", heading: "Slip Gaji & Distribusi" },
      { path: "/org/payroll/payment", heading: "Pembayaran & Bank File" },
      { path: "/org/payroll/tax-compliance", heading: "Pajak & Kepatuhan" },
      { path: "/org/payroll/reports", heading: "Laporan Payroll" },
      { path: "/org/payroll/audit-log", heading: "Audit Log Payroll" },
      { path: "/org/payroll/roles", heading: "Hak Akses Payroll" },
      { path: "/org/payroll/integrations", heading: "Integrasi Payroll" },
    ];

    for (const item of pages) {
      await openOrgWorkspaceWithRetry(page, item.path, item.heading);
      await expect(page.getByRole("heading", { name: item.heading, exact: true })).toBeVisible();
    }
  });

  test("halaman Dokumen HR aman untuk filter + search keyword spesial", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/documents", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Dokumen HR", exact: true })).toBeVisible();
    const searchInput = page.getByPlaceholder("Cari kontrak, pegawai, tipe, status...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`'dokumen, terminasi() % test`);
    await page.getByRole("button", { name: "Aktif" }).click();
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Dokumen HR", exact: true })).toBeVisible();
  });

  test("halaman Laporan HR menampilkan statistik kontrak jatuh tempo", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/reports", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Laporan HR", exact: true })).toBeVisible();
    await expect(page.getByText("Kontrak Lewat Jatuh Tempo", { exact: false })).toBeVisible();
    await expect(page.getByText("Status Aktif Tidak Diisi", { exact: false })).toBeVisible();
  });

  test("halaman Analitik Kehadiran HR menampilkan filter tanggal dan export", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/attendance-insights", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    if (page.url().includes("/org/hr/attendance-insights")) {
      await expect(page.getByRole("heading", { name: "Analitik Kehadiran HR", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ekspor CSV", exact: true })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/org\/hr(?:\?.*)?$/);
      await expect(page.getByRole("heading", { name: "Ringkasan HR", exact: true })).toBeVisible();
    }
  });

  test("halaman Tiket HR menampilkan list tiket dan tombol buat tiket", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/help/tickets", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Tiket HR", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buat Tiket HR" })).toBeVisible();
  });

  test("halaman Tiket HR mendukung thread komentar + audit dasar", async ({ page }) => {
    await loginAsReadyPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/help/tickets", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const ticketKey = `E2E-TIK-${Date.now()}`;
    await page.getByRole("button", { name: "Buat Tiket HR" }).click();
    await expect(page.getByRole("heading", { name: "Buat Tiket HR", exact: true })).toBeVisible();
    await page.fill("#subject", ticketKey);
    await page.fill("#message", "E2E thread test");
    await page.getByRole("button", { name: "Kirim Tiket" }).click();
    await waitForStable(page);

    const ticketRow = page.locator("tr", { hasText: ticketKey }).first();
    await expect(ticketRow).toBeVisible();

    await ticketRow.getByRole("button", { name: "Thread" }).click();
    await expect(page.getByRole("heading", { name: "Thread & Audit Tiket", exact: true })).toBeVisible();
    await page.fill('textarea[placeholder="Tambah komentar tindak lanjut..."]', `Komentar ${ticketKey}`);
    await page.getByRole("button", { name: "Tambah Komentar" }).click();
    await expect(page.getByText(`Komentar ${ticketKey}`)).toBeVisible();
  });
});
