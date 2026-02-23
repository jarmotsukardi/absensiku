import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getRoleCreds } from "./helpers/testAccounts";

const CSV_HEADERS = [
  "NIK",
  "NIP",
  "Nama Lengkap",
  "Gelar Depan",
  "Gelar Belakang",
  "Email",
  "No. Telepon",
  "WhatsApp",
  "Jenis Kelamin (L/P)",
  "Jabatan",
  "Golongan",
  "Kode OPD",
  "Alamat",
];

const waitForStable = async (page: Page) => {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    // Abaikan jika ada polling panjang.
  }
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

const uniqueDigits = (length: number): string => {
  const source = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  return source.slice(-length).padStart(length, "0");
};

const solveSimpleCaptcha = async (page: Page) => {
  const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
    spans.map((span) => (span.textContent || "").trim()).join(""),
  );
  expect(captchaText.length).toBeGreaterThanOrEqual(6);
  await page.fill("#captcha-input", captchaText);
};

const loginAsOrgAdmin = async (page: Page) => {
  const creds = await getRoleCreds("org_admin");
  test.skip(!creds, "Kredensial org_admin belum diisi di ops/test-accounts.local.json");

  await page.goto("/org/login", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.fill("#email", creds!.email);
  await page.fill("#password", creds!.password);
  await solveSimpleCaptcha(page);
  await page.getByRole("button", { name: "Masuk" }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/org/login"), { timeout: 20_000 });
};

const openImportPage = async (page: Page) => {
  await page.goto("/org/master/employee-import", { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Import Pegawai" }).waitFor({ state: "visible", timeout: 20_000 });
};

const selectOfficeMapping = async (page: Page) => {
  const officeSection = page.locator("div.space-y-2").filter({ hasText: "Lokasi Kerja Mapping (Wajib)" }).first();
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
  const input = page.locator('input[type="file"][accept=".csv"]').first();
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
      await loginAsOrgAdmin(page);
      await openImportPage(page);
      await selectOfficeMapping(page);

      const golonganOptions = await waitGolonganReferenceReady(page);
      const validGolongan = golonganOptions[0];
      const invalidGolongan = "X/99";
      const seed = uniqueDigits(8);

      const validRow = [
        uniqueDigits(16),
        "",
        `Uji Valid ${seed}`,
        "",
        "",
        `e2e.valid.${seed}@example.com`,
        "081234567890",
        "081234567890",
        "L",
        "Staff Uji",
        validGolongan,
        "",
        "Alamat Uji Valid",
      ];

      const invalidRow = [
        uniqueDigits(16),
        "",
        `Uji Invalid ${seed}`,
        "",
        "",
        `e2e.invalid.${seed}@example.com`,
        "081234567891",
        "081234567891",
        "P",
        "Staff Uji",
        invalidGolongan,
        "",
        "Alamat Uji Invalid",
      ];

      await fs.writeFile(validCsvPath, `${buildCsvLine(CSV_HEADERS)}\n${buildCsvLine(validRow)}\n`, "utf8");
      await fs.writeFile(invalidCsvPath, `${buildCsvLine(CSV_HEADERS)}\n${buildCsvLine(invalidRow)}\n`, "utf8");

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
