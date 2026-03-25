import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { loginAsOrgAdmin as sharedLoginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

const DEFAULT_TEMPLATE_VALUES: Record<string, string> = {
  NIK: "",
  NIP: "",
  "Nama Lengkap": "",
  "Gelar Depan": "",
  "Gelar Belakang": "",
  Email: "",
  "No. Telepon": "",
  WhatsApp: "",
  "Jenis Kelamin (L/P)": "",
  Jabatan: "",
  Golongan: "",
  "Kategori Pegawai": "",
  "Kode OPD": "",
  "Lokasi Kerja": "",
  Alamat: "",
};

const buildCsvLine = (values: string[]): string =>
  values
    .map((value) => {
      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, "\"\"")}"`;
      }
      return value;
    })
    .join(",");

const getActiveTemplateHeaders = async (page: Page): Promise<string[]> => {
  const helper = page
    .locator("p.text-xs.text-muted-foreground")
    .filter({ hasText: "Kolom template aktif:" })
    .first();
  await helper.waitFor({ state: "visible", timeout: 15_000 });
  const text = ((await helper.textContent()) || "").replace(/\s+/g, " ").trim();
  return text
    .split(":")
    .slice(1)
    .join(":")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const buildRowFromHeaders = (
  headers: string[],
  overrides: Record<string, string>,
): string[] => {
  const rowValues: Record<string, string> = {
    ...DEFAULT_TEMPLATE_VALUES,
    ...overrides,
  };
  return headers.map((header) => rowValues[header] ?? "");
};

const uniqueDigits = (length: number): string => {
  const source = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  return source.slice(-length).padStart(length, "0");
};

const openImportPage = async (page: Page) => {
  await page.goto("/org/master/employee-import", { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Import Pegawai" }).waitFor({ state: "visible", timeout: 20_000 });
};

const selectOfficeMapping = async (page: Page) => {
  const officeSection = page.locator("div.space-y-2").filter({ hasText: /Lokasi Kerja Mapping/i }).first();
  await officeSection.waitFor({ state: "visible", timeout: 15_000 });

  const officeTrigger = officeSection.getByRole("combobox").first();
  await expect(officeTrigger).toBeEnabled();
  await officeTrigger.click();

  const firstOption = page.getByRole("option").first();
  await firstOption.waitFor({ state: "visible", timeout: 10_000 });
  await firstOption.click();
};

const waitGolonganReferenceReady = async (page: Page): Promise<string[]> => {
  const loadingHint = page.getByText("Memuat referensi golongan aktif...");
  if (await loadingHint.isVisible().catch(() => false)) {
    await loadingHint.waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
  }

  const helper = page
    .locator("p.text-xs.text-muted-foreground")
    .filter({ hasText: "Golongan valid mengikuti master data aktif:" })
    .first();
  await helper.waitFor({ state: "visible", timeout: 20_000 });

  const text = ((await helper.textContent()) || "").replace(/\s+/g, " ").trim();
  const values = text
    .split(":")
    .slice(1)
    .join(":")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  expect(values.length).toBeGreaterThan(0);
  return values;
};

const uploadCsv = async (page: Page, filePath: string) => {
  const input = page.locator('input[type="file"]').first();
  await expect(input).toBeEnabled();
  await input.setInputFiles(filePath);
  await page.getByRole("heading", { name: "Preview Data" }).waitFor({ state: "visible", timeout: 20_000 });
};

test.describe.parallel("Org Employee Import Golongan", () => {
  test("validasi golongan mengikuti master aktif pada preview CSV", async ({ page }) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "absensiku-import-golongan-"));
    const validCsvPath = path.join(tmpDir, "valid-golongan.csv");
    const invalidCsvPath = path.join(tmpDir, "invalid-golongan.csv");

    try {
      await sharedLoginAsOrgAdmin(page, ["org_admin"]);
      await openImportPage(page);
      await selectOfficeMapping(page);
      const activeHeaders = await getActiveTemplateHeaders(page);
      test.skip(!activeHeaders.includes("Golongan"), "Modul golongan nonaktif, skenario ini tidak relevan.");

      const golonganOptions = await waitGolonganReferenceReady(page);
      const validGolongan = golonganOptions[0];
      const invalidGolongan = "X/99";
      const seed = uniqueDigits(8);

      const validRow = buildRowFromHeaders(activeHeaders, {
        NIK: uniqueDigits(16),
        "Nama Lengkap": `Uji Valid ${seed}`,
        Email: `e2e.valid.${seed}@example.com`,
        "No. Telepon": "081234567890",
        WhatsApp: "081234567890",
        "Jenis Kelamin (L/P)": "L",
        Jabatan: "Staff Uji",
        Golongan: validGolongan,
        Alamat: "Alamat Uji Valid",
      });

      const invalidRow = buildRowFromHeaders(activeHeaders, {
        NIK: uniqueDigits(16),
        "Nama Lengkap": `Uji Invalid ${seed}`,
        Email: `e2e.invalid.${seed}@example.com`,
        "No. Telepon": "081234567891",
        WhatsApp: "081234567891",
        "Jenis Kelamin (L/P)": "P",
        Jabatan: "Staff Uji",
        Golongan: invalidGolongan,
        Alamat: "Alamat Uji Invalid",
      });

      await fs.writeFile(validCsvPath, `${buildCsvLine(activeHeaders)}\n${buildCsvLine(validRow)}\n`, "utf8");
      await fs.writeFile(invalidCsvPath, `${buildCsvLine(activeHeaders)}\n${buildCsvLine(invalidRow)}\n`, "utf8");

      await uploadCsv(page, validCsvPath);
      await expect(page.getByText("Error: 0").first()).toBeVisible();
      const validImportButton = page.getByRole("button", { name: /Import \d+ Data/i }).first();
      await expect(validImportButton).toBeEnabled();
      await expect(validImportButton).toContainText("Import 1 Data");

      await page.getByRole("button", { name: "Reset" }).first().click();
      await page.getByRole("heading", { name: "Preview Data" }).waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});

      await uploadCsv(page, invalidCsvPath);
      await expect(page.getByText(`Golongan "${invalidGolongan}" tidak ada di master golongan aktif`).first()).toBeVisible();
      const invalidImportButton = page.getByRole("button", { name: /Import \d+ Data/i }).first();
      await expect(invalidImportButton).toContainText("Import 0 Data");
      await expect(invalidImportButton).toBeDisabled();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
