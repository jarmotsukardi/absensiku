import { expect, test, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import {
  createOrgAdminHrPage,
  openAdminHrPoliciesForTenant,
  readAdminHrPolicyCardCount,
  readOrgHrTenantName,
} from "./helpers/adminHrPolicyBridge";
import { waitForStable } from "./helpers/orgAuth";
import { readSwitchState } from "./helpers/uiHelpers";

type PerformanceSnapshot = {
  tenantName: string;
  kpiCount: number;
  periodCount: number;
  formCount: number;
  review360Enabled: boolean;
  review360Anonymous: boolean;
  review360PeerCount: string;
  review360ManagerWeight: string;
};

const readPerformanceSnapshot = async (page: Page): Promise<PerformanceSnapshot> => ({
  tenantName: (((await page.getByTestId("admin-hr-policy-selected-tenant").textContent()) || "").trim()),
  kpiCount: await readAdminHrPolicyCardCount(page, "KPI"),
  periodCount: await readAdminHrPolicyCardCount(page, "Periode"),
  formCount: await readAdminHrPolicyCardCount(page, "Form"),
  review360Enabled: await readSwitchState(page.getByTestId("admin-hr-policy-review360-enabled")),
  review360Anonymous: await readSwitchState(page.getByTestId("admin-hr-policy-review360-anonymous")),
  review360PeerCount: await page.getByTestId("admin-hr-policy-review360-peer-count").inputValue(),
  review360ManagerWeight: await page.getByTestId("admin-hr-policy-review360-manager-weight").inputValue(),
});

const assertOrgPage = async (
  page: Page,
  path: string,
  heading: string,
  rowSelector: string,
  emptyText: string,
  expectedCount: number,
) => {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 15_000 });

  if (expectedCount === 0) {
    await expect(page.getByText(emptyText, { exact: true })).toBeVisible();
    await expect(page.locator(rowSelector)).toHaveCount(0);
    return;
  }

  await expect(page.locator(rowSelector).first()).toBeVisible();
  await expect(page.locator(rowSelector)).toHaveCount(expectedCount);
};

test.describe.serial("Admin HR Performance Readonly Bridge", () => {
  test("baseline kinerja tenant default terbaca konsisten di runtime org", async ({ page, browser }) => {
    const tenantName = await readOrgHrTenantName(browser);

    await loginAsSuperadmin(page);
    await openAdminHrPoliciesForTenant(page, tenantName);
    await expect(page.getByTestId("admin-hr-policy-save-review360")).toBeEnabled({ timeout: 15_000 });
    const snapshot = await readPerformanceSnapshot(page);
    expect(snapshot.tenantName).toContain(tenantName);

    const orgRuntime = await createOrgAdminHrPage(browser);
    try {
      await orgRuntime.page.goto("/org/hr", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator("span.font-bold.text-sidebar-foreground.truncate").first()).toContainText(tenantName);

      await assertOrgPage(
        orgRuntime.page,
        "/org/hr/kpi",
        "KPI",
        '[data-testid^="org-hr-kpi-row-"]',
        "Belum ada baseline KPI yang disimpan.",
        snapshot.kpiCount,
      );

      await assertOrgPage(
        orgRuntime.page,
        "/org/hr/performance-periods",
        "Periode Penilaian",
        '[data-testid^="org-hr-performance-period-row-"]',
        "Belum ada periode penilaian yang disimpan.",
        snapshot.periodCount,
      );

      await assertOrgPage(
        orgRuntime.page,
        "/org/hr/performance-forms",
        "Form Penilaian",
        '[data-testid^="org-hr-performance-form-row-"]',
        "Belum ada form penilaian yang disimpan.",
        snapshot.formCount,
      );

      await orgRuntime.page.goto("/org/hr/review-360", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Ulasan 360", exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(orgRuntime.page.getByTestId("org-hr-review360-enabled")).toHaveAttribute("aria-checked", String(snapshot.review360Enabled));
      await expect(orgRuntime.page.getByTestId("org-hr-review360-anonymous")).toHaveAttribute("aria-checked", String(snapshot.review360Anonymous));
      await expect(orgRuntime.page.getByTestId("org-hr-review360-peer-count")).toHaveValue(snapshot.review360PeerCount);
      await expect(orgRuntime.page.getByTestId("org-hr-review360-manager-weight")).toHaveValue(snapshot.review360ManagerWeight);
    } finally {
      await orgRuntime.context.close().catch(() => undefined);
    }
  });
});
