import { expect, test, type Page } from "@playwright/test";
import { loginAsOrgAdmin, toYmd, waitForStable } from "./helpers/orgAuth";

const BUSY_HOURS_TEXT = /Jam sibuk absensi sedang berlangsung/i;
const ATTENDANCE_TOTAL_TEXT = /Total (\d+) data absensi/i;
const RECAP_TOTAL_TEXT = /Total (\d+) pegawai/i;

const getNumberFromText = async (locator: ReturnType<Page["getByText"]>, pattern: RegExp) => {
  const text = (await locator.first().textContent()) || "";
  const match = text.match(pattern);
  return Number(match?.[1] || "0");
};

const skipIfBusyHours = async (page: Page) => {
  const isBusy = await page.getByText(BUSY_HOURS_TEXT).first().isVisible().catch(() => false);
  test.skip(isBusy, "Jam sibuk absensi aktif pada runtime saat ini");
};

const tryLoadAttendanceData = async (page: Page) => {
  const dateInputs = page.locator('input[type="date"]');
  const today = new Date();
  const rangeDays = [30, 90, 180];

  for (const days of rangeDays) {
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    await dateInputs.nth(0).fill(toYmd(start));
    await dateInputs.nth(1).fill(toYmd(today));
    await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByText(ATTENDANCE_TOTAL_TEXT)).toBeVisible();

    const total = await getNumberFromText(page.getByText(ATTENDANCE_TOTAL_TEXT), ATTENDANCE_TOTAL_TEXT);
    if (total > 0) {
      return {
        endDate: toYmd(today),
        startDate: toYmd(start),
        total,
      };
    }
  }

  test.skip(true, "Data laporan absensi organisasi tidak tersedia pada runtime saat ini");
  return null;
};

const tryLoadRecapData = async (page: Page) => {
  const now = new Date();
  const monthCandidates = [
    { label: now.toLocaleString("id-ID", { month: "long" }), month: now.getMonth() + 1, year: now.getFullYear() },
    (() => {
      const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        label: previous.toLocaleString("id-ID", { month: "long" }),
        month: previous.getMonth() + 1,
        year: previous.getFullYear(),
      };
    })(),
  ];
  const yearInput = page.locator('input[type="number"]').first();
  const monthTrigger = page.getByRole("combobox").nth(1);

  for (const candidate of monthCandidates) {
    await monthTrigger.click();
    await page.getByRole("option", { name: candidate.label, exact: true }).click();
    await yearInput.fill(String(candidate.year));
    await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
    await waitForStable(page);
    await expect(page.getByText(RECAP_TOTAL_TEXT)).toBeVisible();

    const total = await getNumberFromText(page.getByText(RECAP_TOTAL_TEXT), RECAP_TOTAL_TEXT);
    if (total > 0) {
      return candidate;
    }
  }

  test.skip(true, "Data rekapitulasi absensi organisasi tidak tersedia pada runtime saat ini");
  return null;
};

test.describe.serial("Org Attendance Report Download", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  });

  test("laporan absensi organisasi dapat mengunduh CSV dan PDF", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/org/reports/attendance", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Laporan Absensi", exact: true })).toBeVisible();

    await skipIfBusyHours(page);
    const loaded = await tryLoadAttendanceData(page);
    test.skip(!loaded, "Data laporan absensi tidak tersedia");

    const pdfButton = page.getByRole("button", { name: "Unduh PDF", exact: true });
    const csvButton = page.getByRole("button", { name: "Export CSV", exact: true });
    await expect(pdfButton).toBeEnabled();
    await expect(csvButton).toBeEnabled();

    const csvDownload = page.waitForEvent("download");
    await csvButton.click();
    const csv = await csvDownload;
    expect(await csv.suggestedFilename()).toBe(`laporan-absensi-${loaded!.startDate}-${loaded!.endDate}.csv`);

    const pdfDownload = page.waitForEvent("download");
    await pdfButton.click();
    const pdf = await pdfDownload;
    expect(await pdf.suggestedFilename()).toBe(`laporan-absensi-${loaded!.startDate}-${loaded!.endDate}.pdf`);
  });

  test("rekapitulasi absensi organisasi dapat mengunduh CSV dan PDF", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/org/reports/recap", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Rekapitulasi Absensi", exact: true })).toBeVisible();

    await skipIfBusyHours(page);
    const loaded = await tryLoadRecapData(page);
    test.skip(!loaded, "Data rekapitulasi absensi tidak tersedia");

    const pdfButton = page.getByRole("button", { name: "Unduh PDF", exact: true });
    const csvButton = page.getByRole("button", { name: "Export CSV", exact: true });
    await expect(pdfButton).toBeEnabled();
    await expect(csvButton).toBeEnabled();

    const normalizedMonth = String(loaded!.month).padStart(2, "0");

    const csvDownload = page.waitForEvent("download");
    await csvButton.click();
    const csv = await csvDownload;
    expect(await csv.suggestedFilename()).toBe(`rekapitulasi-${loaded!.year}-${normalizedMonth}.csv`);

    const pdfDownload = page.waitForEvent("download");
    await pdfButton.click();
    const pdf = await pdfDownload;
    expect(await pdf.suggestedFilename()).toBe(`rekapitulasi-${loaded!.year}-${normalizedMonth}.pdf`);
  });
});
