import { expect, test, type Page } from "@playwright/test";
import { loginAsOrgAdmin, toYmd, waitForStable } from "./helpers/orgAuth";

type ReportConfig = {
  emptyReason: string;
  filenamePrefix: string;
  heading: string;
  route: string;
  totalPattern: RegExp;
};

const REPORTS: ReportConfig[] = [
  {
    emptyReason: "Data laporan izin/cuti organisasi tidak tersedia pada runtime saat ini",
    filenamePrefix: "laporan-izin-cuti",
    heading: "Laporan Izin/Cuti",
    route: "/org/reports/leave",
    totalPattern: /Total (\d+) pengajuan/i,
  },
  {
    emptyReason: "Data laporan lembur organisasi tidak tersedia pada runtime saat ini",
    filenamePrefix: "laporan-lembur",
    heading: "Laporan Lembur",
    route: "/org/reports/overtime",
    totalPattern: /Total (\d+) pengajuan lembur/i,
  },
  {
    emptyReason: "Data riwayat mutasi organisasi tidak tersedia pada runtime saat ini",
    filenamePrefix: "riwayat-mutasi",
    heading: "Laporan Riwayat Mutasi",
    route: "/org/reports/mutations",
    totalPattern: /Total (\d+) data mutasi/i,
  },
  {
    emptyReason: "Data laporan WFH dan absensi khusus organisasi tidak tersedia pada runtime saat ini",
    filenamePrefix: "laporan-wfh-absensi-khusus",
    heading: "Laporan WFH & Absensi Khusus",
    route: "/org/reports/flexible",
    totalPattern: /Total (\d+) permohonan/i,
  },
];

const getNumberFromText = async (locator: ReturnType<Page["getByText"]>, pattern: RegExp) => {
  const text = (await locator.first().textContent()) || "";
  const match = text.match(pattern);
  return Number(match?.[1] || "0");
};

const waitForReportRefresh = async (page: Page) => {
  await page
    .getByRole("button", { name: "Memuat...", exact: true })
    .waitFor({ state: "visible", timeout: 1_000 })
    .catch(() => null);
  await waitForStable(page);
  await expect
    .poll(
      async () => {
        const loadingVisible = await page
          .getByRole("button", { name: "Memuat...", exact: true })
          .isVisible()
          .catch(() => false);
        const showEnabled = await page
          .getByRole("button", { name: "Tampilkan", exact: true })
          .isEnabled()
          .catch(() => false);
        return !loadingVisible && showEnabled;
      },
      { timeout: 15_000, intervals: [300, 600, 1_000] },
    )
    .toBeTruthy();
};

const tryLoadReportData = async (page: Page, config: ReportConfig) => {
  const dateInputs = page.locator('input[type="date"]');
  const today = new Date();
  const rangeDays = [30, 90, 180, 365];

  for (const days of rangeDays) {
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    const startDate = toYmd(start);
    const endDate = toYmd(today);

    await dateInputs.nth(0).fill(startDate);
    await dateInputs.nth(1).fill(endDate);
    await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
    await waitForReportRefresh(page);
    await expect(page.getByText(config.totalPattern)).toBeVisible();

    const total = await getNumberFromText(page.getByText(config.totalPattern), config.totalPattern);
    if (total > 0) {
      return { endDate, startDate, total };
    }
  }

  test.skip(true, config.emptyReason);
  return null;
};

test.describe.serial("Org Request Report Download", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin_centralized", "org_admin"]);
  });

  for (const config of REPORTS) {
    test(`${config.heading} dapat mengunduh CSV dan PDF`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(config.route, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: config.heading, exact: true })).toBeVisible();

      const loaded = await tryLoadReportData(page, config);
      test.skip(!loaded, `${config.heading} tidak tersedia`);

      const pdfButton = page.getByRole("button", { name: "Unduh PDF", exact: true });
      const csvButton = page.getByRole("button", { name: "Export CSV", exact: true });
      await expect(pdfButton).toBeEnabled();
      await expect(csvButton).toBeEnabled();

      const csvDownload = page.waitForEvent("download");
      await csvButton.click();
      const csv = await csvDownload;
      expect(await csv.suggestedFilename()).toBe(`${config.filenamePrefix}-${loaded!.startDate}-${loaded!.endDate}.csv`);

      const pdfDownload = page.waitForEvent("download");
      await pdfButton.click();
      const pdf = await pdfDownload;
      expect(await pdf.suggestedFilename()).toBe(`${config.filenamePrefix}-${loaded!.startDate}-${loaded!.endDate}.pdf`);
    });
  }
});
