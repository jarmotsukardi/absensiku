import { expect, test, type Page } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import { ensureOrgWorkspaceEnabled } from "./helpers/orgWorkspace";

const assertReadonlyAtsPage = async (
  page: Page,
  path: string,
  heading: string,
  rowSelector: string,
  emptyText: string,
) => {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 15_000 });

  const rows = page.locator(rowSelector);
  const rowCount = await rows.count();
  if (rowCount === 0) {
    await expect(page.getByText(emptyText, { exact: true })).toBeVisible();
  } else {
    await expect(rows.first()).toBeVisible();
  }
};

test.describe.serial("Org HR ATS Readonly Smoke", () => {
  test("empat halaman ATS org stabil dibuka pada tenant aktif", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await assertReadonlyAtsPage(
      page,
      "/org/hr/recruitment/jobs",
      "Lowongan Kerja",
      '[data-testid^="org-hr-ats-job-row-"]',
      "Belum ada data lowongan.",
    );

    await assertReadonlyAtsPage(
      page,
      "/org/hr/recruitment/candidates",
      "Kandidat",
      '[data-testid^="org-hr-ats-candidate-row-"]',
      "Belum ada data kandidat.",
    );

    await assertReadonlyAtsPage(
      page,
      "/org/hr/recruitment/interviews",
      "Tahap Interview",
      '[data-testid^="org-hr-ats-interview-row-"]',
      "Belum ada data interview.",
    );

    await assertReadonlyAtsPage(
      page,
      "/org/hr/recruitment/offers",
      "Penawaran Kerja",
      '[data-testid^="org-hr-ats-offer-row-"]',
      "Belum ada data penawaran.",
    );
  });
});
