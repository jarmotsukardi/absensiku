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

test.describe.serial("Admin HR Training Runtime Bridge", () => {
  test("program pelatihan dari admin muncul di runtime org lalu dibersihkan", async ({ page, browser }) => {
    const orgTenantName = await readOrgHrTenantName(browser, "/org/hr/training-data");
    const tempName = `Bridge Training ${Date.now()}`;
    const updatedName = `${tempName} Updated`;

    await loginAsSuperadmin(page);
    await openAdminHrPolicies(page);
    await selectAdminHrTenantByVisibleName(page, orgTenantName);

    let currentName = tempName;
    let orgRuntime: Awaited<ReturnType<typeof createOrgAdminHrPage>> | null = null;

    const findAdminRow = (name: string) =>
      page.locator('[data-testid^="admin-hr-policy-training-row-"]').filter({ hasText: name }).first();

    try {
      await page.getByTestId("admin-hr-policy-add-training").click();
      await page.fill("#admin-training-name", tempName);
      await page.fill("#admin-training-category", "Bridge QA");
      await page.fill("#admin-training-provider", "Bridge Provider");
      await page.fill("#admin-training-duration", "5");
      await page.fill("#admin-training-target", "9");
      await page.fill("#admin-training-notes", "runtime bridge");
      await page.getByRole("button", { name: "Simpan Program" }).click();
      await expectToast(page, "Program pelatihan berhasil ditambahkan.");

      const createdAdminRow = findAdminRow(tempName);
      await expect(createdAdminRow).toBeVisible();

      orgRuntime = await createOrgAdminHrPage(browser);
      await orgRuntime.page.goto("/org/hr/training-data", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Data Pelatihan", exact: true })).toBeVisible();
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-training-row-"]').filter({ hasText: tempName }).first()).toBeVisible();

      await createdAdminRow.locator('[data-testid^="admin-hr-policy-training-edit-"]').first().click();
      await page.fill("#admin-training-name", updatedName);
      await page.getByRole("button", { name: "Simpan Program" }).click();
      await expectToast(page, "Program pelatihan berhasil diperbarui.");
      currentName = updatedName;

      await orgRuntime.page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-training-row-"]').filter({ hasText: updatedName }).first()).toBeVisible();

      await confirmBrowserDialogDelete(
        page,
        findAdminRow(updatedName).locator('[data-testid^="admin-hr-policy-training-delete-"]').first(),
      );
      await expectToast(page, "Program pelatihan berhasil dihapus.");
      currentName = "";

      await orgRuntime.page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-training-row-"]').filter({ hasText: updatedName })).toHaveCount(0);
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
            cleanupRow.locator('[data-testid^="admin-hr-policy-training-delete-"]').first(),
          );
          await expectToast(page, "Program pelatihan berhasil dihapus.");
        }
      }
    }
  });
});
