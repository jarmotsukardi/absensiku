import { expect, test, type Browser, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import {
  createOrgAdminHrPage,
  openAdminHrPoliciesForTenant,
  readOrgHrTenantName,
} from "./helpers/adminHrPolicyBridge";
import { waitForStable } from "./helpers/orgAuth";

const countAdminRows = async (page: Page) => ({
  training: await page.locator('[data-testid^="admin-hr-policy-training-row-"]').count(),
  certification: await page.locator('[data-testid^="admin-hr-policy-certification-row-"]').count(),
  skill: await page.locator('[data-testid^="admin-hr-policy-skill-row-"]').count(),
});

const countOrgRows = async (
  browser: Browser,
  expectedCounts: { training: number; certification: number; skill: number },
) => {
  const orgRuntime = await createOrgAdminHrPage(browser);
  try {
    const visitAndCount = async (
      path: string,
      heading: string,
      selector: string,
      emptyText: string,
      expectedCount: number,
    ) => {
      await orgRuntime.page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      if (expectedCount > 0) {
        await expect(orgRuntime.page.locator(selector).first()).toBeVisible();
      } else {
        await expect(orgRuntime.page.getByText(emptyText, { exact: true })).toBeVisible();
      }
      return await orgRuntime.page.locator(selector).count();
    };

    return {
      training: await visitAndCount(
        "/org/hr/training-data",
        "Data Pelatihan",
        '[data-testid^="org-hr-training-row-"]',
        "Belum ada program pelatihan yang disimpan.",
        expectedCounts.training,
      ),
      certification: await visitAndCount(
        "/org/hr/certifications",
        "Sertifikasi",
        '[data-testid^="org-hr-certification-row-"]',
        "Belum ada aturan sertifikasi yang disimpan.",
        expectedCounts.certification,
      ),
      skill: await visitAndCount(
        "/org/hr/skill-matrix",
        "Matriks Kompetensi",
        '[data-testid^="org-hr-skill-row-"]',
        "Belum ada matriks keahlian yang disimpan.",
        expectedCounts.skill,
      ),
    };
  } finally {
    await orgRuntime.context.close();
  }
};

test.describe.serial("Admin HR Training Bundle Readonly", () => {
  test("jumlah baseline pelatihan, sertifikasi, dan skill sinkron antara admin dan org", async ({ page, browser }) => {
    const tenantName = await readOrgHrTenantName(browser);

    await loginAsSuperadmin(page);
    await openAdminHrPoliciesForTenant(page, tenantName);
    await expect(page.getByTestId("admin-hr-policy-save-review360")).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("admin-hr-policy-save-ess")).toBeEnabled({ timeout: 15_000 });

    const adminCounts = await countAdminRows(page);
    const orgCounts = await countOrgRows(browser, adminCounts);

    expect(adminCounts.training).toBe(orgCounts.training);
    expect(adminCounts.certification).toBe(orgCounts.certification);
    expect(adminCounts.skill).toBe(orgCounts.skill);
  });
});
