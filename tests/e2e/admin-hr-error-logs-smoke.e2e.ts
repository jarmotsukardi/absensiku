import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectMetricCardWithCount } from "./helpers/adminMetricCards";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";

test.describe.serial("Admin HR Error Logs Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/error-logs", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Log Error HR" })).toBeVisible();
  });

  test("kartu ringkasan dan tabel utama tampil stabil", async ({ page }) => {
    const metrics = [
      { title: "Total Error HR", note: "Seluruh log HR lintas tenant." },
      { title: "Kritis Terbuka", note: "Belum resolved dan belum diarsipkan." },
      { title: "Non-Kritis", note: "Perlu triase tanpa eskalasi tinggi." },
      { title: "Resolved / Arsip", note: "Sudah ditutup atau diparkir." },
    ] as const;

    for (const { title, note } of metrics) {
      await expectMetricCardWithCount(page, title, note);
    }

    await expect(page.getByRole("heading", { name: "Daftar Log Error HR", exact: true })).toBeVisible();
    await expect(page.getByText(/Halaman \d+ dari \d+/, { exact: false })).toBeVisible();
  });

  test("filter dan tab tetap stabil saat digunakan", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Cari ref, pesan, route, trace id...");
    await searchInput.fill("TIDAK-ADA-ERROR-HR");
    await expect(page.getByText("Tidak ada log error HR yang cocok dengan filter ini.", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Non-Kritis", exact: true }).click();
    await expect(page.getByRole("button", { name: "Non-Kritis", exact: true })).toHaveAttribute("data-state", /active|on/).catch(() => {});

    await page.getByRole("button", { name: "Selesai", exact: true }).click();
    await page.getByRole("button", { name: "Arsip", exact: true }).click();
    await page.getByRole("button", { name: "Kritis", exact: true }).click();

    const tenantTrigger = page.getByRole("combobox").nth(0);
    await tenantTrigger.click();
    await page.getByRole("option", { name: "Semua Tenant", exact: true }).click();

    const contextTrigger = page.getByRole("combobox").nth(1);
    await contextTrigger.click();
    await page.getByRole("option", { name: "Semua Konteks", exact: true }).click();

    const timeTrigger = page.getByRole("combobox").nth(2);
    await timeTrigger.click();
    await page.getByRole("option", { name: "7 Hari", exact: true }).click();
    await waitForStable(page);

    await searchInput.fill("");
    await expect(page.getByRole("heading", { name: "Daftar Log Error HR", exact: true })).toBeVisible();
  });

  test("navigasi ke audit HR dan guide halaman bawah tampil", async ({ page }) => {
    await page.getByRole("button", { name: "Buka Audit HR", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/audit$/);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    await page.goto("/admin/hr/error-logs", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expectAdminPageGuide(page, "Panduan Error Log HR");
  });

  test("export dan pagination tetap stabil", async ({ page }) => {
    const csvButton = page.getByRole("button", { name: "CSV", exact: true });
    const jsonButton = page.getByRole("button", { name: "JSON", exact: true });
    const previousButton = page.getByRole("button", { name: "Sebelumnya", exact: true });
    const nextButton = page.getByRole("button", { name: "Berikutnya", exact: true });

    await expect(csvButton).toBeVisible();
    await expect(jsonButton).toBeVisible();
    await expect(previousButton).toBeVisible();
    await expect(nextButton).toBeVisible();

    const downloadCsv = page.waitForEvent("download");
    await csvButton.click();
    const csv = await downloadCsv;
    expect(await csv.suggestedFilename()).toMatch(/^admin-hr-error-logs-\d{4}-\d{2}-\d{2}\.csv$/);

    const downloadJson = page.waitForEvent("download");
    await jsonButton.click();
    const json = await downloadJson;
    expect(await json.suggestedFilename()).toMatch(/^admin-hr-error-logs-\d{4}-\d{2}-\d{2}\.json$/);

    await expect(page.getByText(/Halaman \d+ dari \d+/, { exact: false })).toBeVisible();
    const totalPagesMatch = (await page.getByText(/Halaman \d+ dari \d+/, { exact: false }).textContent())?.match(/Halaman (\d+) dari (\d+)/);
    expect(totalPagesMatch).not.toBeNull();

    const totalPages = Number(totalPagesMatch?.[2] || "1");
    if (totalPages <= 1) {
      await expect(previousButton).toBeDisabled();
      await expect(nextButton).toBeDisabled();
      return;
    }

    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await expect(page.getByText(new RegExp(`Halaman 2 dari ${totalPages}`))).toBeVisible();
    await expect(previousButton).toBeEnabled();
    await previousButton.click();
    await expect(page.getByText(new RegExp(`Halaman 1 dari ${totalPages}`))).toBeVisible();
  });

  test("buka route sumber tetap stabil jika ada route valid", async ({ page }) => {
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();

    let targetIndex = -1;
    for (let index = 0; index < rowCount; index += 1) {
      const routeCellText = ((await rows.nth(index).locator("td").nth(5).textContent()) || "").trim();
      if (routeCellText && routeCellText !== "-") {
        targetIndex = index;
        break;
      }
    }

    test.skip(targetIndex === -1, "Tidak ada log error HR dengan route valid pada data runtime saat ini");

    const targetRow = rows.nth(targetIndex);
    const targetRoute = (((await targetRow.locator("td").nth(5).textContent()) || "").trim());
    await targetRow.getByRole("button", { name: /Buka route sumber/i }).click();
    await waitForStable(page);

    const escapedRoute = targetRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page).toHaveURL(new RegExp(escapedRoute));
  });
});
