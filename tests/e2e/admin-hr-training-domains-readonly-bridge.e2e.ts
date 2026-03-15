import { expect, test, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import {
  createOrgAdminHrPage,
  openAdminHrPoliciesForTenant,
  readAdminHrPrimaryName,
  readOrgHrTenantName,
} from "./helpers/adminHrPolicyBridge";
import { waitForStable } from "./helpers/orgAuth";

type ReadonlyDomainBridge = {
  adminRowPrefix: string;
  orgRowPrefix: string;
  orgPath: string;
  orgHeading: string;
  emptyText: string;
};

const assertDomainMatches = async (orgPage: Page, adminPage: Page, config: ReadonlyDomainBridge) => {
  const adminRows = adminPage.locator(`[data-testid^="${config.adminRowPrefix}"]`);
  const adminRowCount = await adminRows.count();

  await orgPage.goto(config.orgPath, { waitUntil: "domcontentloaded" });
  await waitForStable(orgPage);
  await expect(orgPage.getByRole("heading", { name: config.orgHeading, exact: true })).toBeVisible();

  if (adminRowCount === 0) {
    await expect(orgPage.getByText(config.emptyText, { exact: true })).toBeVisible();
    return;
  }

  const latestName = await readAdminHrPrimaryName(adminRows.first());
  expect(latestName.length).toBeGreaterThan(0);
  await expect(orgPage.locator(`[data-testid^="${config.orgRowPrefix}"]`).filter({ hasText: latestName }).first()).toBeVisible();
};

test.describe.serial("Admin HR Training Domains Readonly Bridge", () => {
  test("pelatihan, sertifikasi, dan skill matrix admin sinkron ke runtime org untuk tenant yang sama", async ({ page, browser }) => {
    const orgTenantName = await readOrgHrTenantName(browser);

    await loginAsSuperadmin(page);
    await openAdminHrPoliciesForTenant(page, orgTenantName);

    const orgRuntime = await createOrgAdminHrPage(browser);
    try {
      await assertDomainMatches(orgRuntime.page, page, {
        adminRowPrefix: "admin-hr-policy-training-row-",
        orgRowPrefix: "org-hr-training-row-",
        orgPath: "/org/hr/training-data",
        orgHeading: "Data Pelatihan",
        emptyText: "Belum ada program pelatihan yang disimpan.",
      });

      await assertDomainMatches(orgRuntime.page, page, {
        adminRowPrefix: "admin-hr-policy-certification-row-",
        orgRowPrefix: "org-hr-certification-row-",
        orgPath: "/org/hr/certifications",
        orgHeading: "Sertifikasi",
        emptyText: "Belum ada aturan sertifikasi yang disimpan.",
      });

      await assertDomainMatches(orgRuntime.page, page, {
        adminRowPrefix: "admin-hr-policy-skill-row-",
        orgRowPrefix: "org-hr-skill-row-",
        orgPath: "/org/hr/skill-matrix",
        orgHeading: "Matriks Kompetensi",
        emptyText: "Belum ada matriks keahlian yang disimpan.",
      });
    } finally {
      await orgRuntime.context.close();
    }
  });
});
