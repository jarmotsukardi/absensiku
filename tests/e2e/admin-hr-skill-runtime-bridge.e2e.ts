import { expect, test, type Browser, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { confirmBrowserDialogDelete } from "./helpers/adminHrPolicyEditors";
import { waitForStable } from "./helpers/orgAuth";
import {
  createOrgAdminHrPage,
  openAdminHrPolicies,
  readOrgHrTenantName,
  selectAdminHrTenantByVisibleName,
} from "./helpers/adminHrPolicyBridge";
import { expectToast } from "./helpers/uiHelpers";

test.describe.serial("Admin HR Skill Runtime Bridge", () => {
  test("skill matrix dari admin muncul di runtime org lalu dibersihkan", async ({ page, browser }) => {
    const orgTenantName = await readOrgHrTenantName(browser, "/org/hr/skill-matrix");
    const tempName = `Bridge Skill ${Date.now()}`;
    const updatedName = `${tempName} Updated`;

    await loginAsSuperadmin(page);
    await openAdminHrPolicies(page);
    await selectAdminHrTenantByVisibleName(page, orgTenantName);

    let currentName = tempName;
    let orgRuntime: Awaited<ReturnType<typeof createOrgAdminHrPage>> | null = null;

    const findAdminRow = (name: string) =>
      page.locator('[data-testid^="admin-hr-policy-skill-row-"]').filter({ hasText: name }).first();

    try {
      await page.getByTestId("admin-hr-policy-add-skill").click();
      await page.fill("#admin-skill-name", tempName);
      await page.fill("#admin-skill-function", "Bridge Function");
      await page.fill("#admin-skill-coverage", "44");
      await page.fill("#admin-skill-gap", "2");
      await page.fill("#admin-skill-linked-training", "Bridge Training");
      await page.getByRole("button", { name: "Simpan Skill" }).click();
      await expectToast(page, "Skill matrix berhasil ditambahkan.");

      const createdAdminRow = findAdminRow(tempName);
      await expect(createdAdminRow).toBeVisible();

      orgRuntime = await createOrgAdminHrPage(browser);
      await orgRuntime.page.goto("/org/hr/skill-matrix", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Matriks Kompetensi", exact: true })).toBeVisible();
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-skill-row-"]').filter({ hasText: tempName }).first()).toBeVisible();

      await createdAdminRow.locator('[data-testid^="admin-hr-policy-skill-edit-"]').first().click();
      await page.fill("#admin-skill-name", updatedName);
      await page.getByRole("button", { name: "Simpan Skill" }).click();
      await expectToast(page, "Skill matrix berhasil diperbarui.");
      currentName = updatedName;

      await orgRuntime.page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-skill-row-"]').filter({ hasText: updatedName }).first()).toBeVisible();

      await confirmBrowserDialogDelete(
        page,
        findAdminRow(updatedName).locator('[data-testid^="admin-hr-policy-skill-delete-"]').first(),
      );
      await expectToast(page, "Skill matrix berhasil dihapus.");
      currentName = "";

      await orgRuntime.page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-skill-row-"]').filter({ hasText: updatedName })).toHaveCount(0);
    } finally {
      if (orgRuntime) {
        await orgRuntime.context.close();
      }

      if (currentName) {
        await openAdminHrPolicies(page);
        await selectAdminHrTenantByVisibleName(page, orgTenantName);
        const cleanupRow = findAdminRow(currentName);
        if ((await cleanupRow.count()) > 0) {
          await confirmBrowserDialogDelete(
            page,
            cleanupRow.locator('[data-testid^="admin-hr-policy-skill-delete-"]').first(),
          );
          await expectToast(page, "Skill matrix berhasil dihapus.");
        }
      }
    }
  });
});
