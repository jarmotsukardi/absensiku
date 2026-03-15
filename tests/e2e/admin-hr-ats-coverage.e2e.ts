import { expect, test } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

test.describe.serial("Admin HR ATS Coverage", () => {
  test("audit HR menampilkan ringkasan dan drilldown ATS", async ({ page }) => {
    await loginAsSuperadmin(page);

    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lowongan Draft", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kandidat Tanpa Lowongan", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interview Terlewat", exact: true })).toBeVisible();
    await expect(page.getByText("Penawaran kedaluwarsa", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Drilldown Lowongan Draft ATS", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Drilldown Offer ATS Kedaluwarsa", exact: true })).toBeVisible();
  });

  test("section bridge rekrutmen ATS menampilkan target org dan status route", async ({ page }) => {
    await loginAsSuperadmin(page);

    await page.goto("/admin/hr/sections/rekrutmen-ats", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.locator("h1").filter({ hasText: "Rekrutmen (ATS)" })).toBeVisible();
    await expect(
      page.getByText("Governance superadmin untuk modul rekrutmen HR berbasis pipeline.").first(),
    ).toBeVisible();
    await expect(page.getByText("/org/hr/recruitment/jobs", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/recruitment/candidates", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/recruitment/interviews", { exact: true })).toBeVisible();
    await expect(page.getByText("/org/hr/recruitment/offers", { exact: true })).toBeVisible();
    await expect(page.getByText("Aktif", { exact: true })).toHaveCount(4);
    await expect(page.getByText("/admin/hr/policies", { exact: true })).toBeVisible();
    await expect(page.getByText("/admin/hr/audit", { exact: true })).toBeVisible();
  });
});
