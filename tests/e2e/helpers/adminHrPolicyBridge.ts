import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./orgAuth";

export const createOrgAdminHrPage = async (browser: Browser) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  return { context, page };
};

export const readOrgHrTenantName = async (browser: Browser, path = "/org/hr") => {
  const orgRuntime = await createOrgAdminHrPage(browser);
  try {
    await orgRuntime.page.goto(path, { waitUntil: "domcontentloaded" });
    await waitForStable(orgRuntime.page);
    const tenantName =
      ((await orgRuntime.page.locator("span.font-bold.text-sidebar-foreground.truncate").first().textContent()) || "").trim();
    expect(tenantName.length).toBeGreaterThan(0);
    return tenantName;
  } finally {
    await orgRuntime.context.close();
  }
};

export const openAdminHrPolicies = async (page: Page) => {
  await page.goto("/admin/hr/policies", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page.locator("h1").filter({ hasText: "Kebijakan HR" })).toBeVisible();
};

export const selectAdminHrTenantByVisibleName = async (page: Page, tenantName: string) => {
  await page.getByRole("combobox", { name: "Tenant HR" }).click();
  await page.getByRole("option").filter({ hasText: tenantName }).first().click();
  await expect(page.getByTestId("admin-hr-policy-selected-tenant")).toContainText(tenantName);
};

export const openAdminHrPoliciesForTenant = async (page: Page, tenantName: string) => {
  await openAdminHrPolicies(page);
  await selectAdminHrTenantByVisibleName(page, tenantName);
};

export const readAdminHrPolicyCardCount = async (page: Page, label: string) => {
  const card = page.locator("div.rounded-lg.border.p-3").filter({ hasText: label }).first();
  return Number((((await card.locator("p.mt-2.text-xl.font-semibold").textContent()) || "0").trim()));
};

export const readAdminHrPrimaryName = async (row: Locator) =>
  (((await row.locator(".font-medium").first().textContent()) || "").trim());
