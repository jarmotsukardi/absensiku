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

test.describe.serial("Admin HR Certification Runtime Bridge", () => {
  test("sertifikasi dari admin muncul di runtime org lalu dibersihkan", async ({ page, browser }) => {
    const orgTenantName = await readOrgHrTenantName(browser, "/org/hr/certifications");
    const tempName = `Bridge Sertifikasi ${Date.now()}`;
    const updatedName = `${tempName} Updated`;

    await loginAsSuperadmin(page);
    await openAdminHrPolicies(page);
    await selectAdminHrTenantByVisibleName(page, orgTenantName);

    let currentName = tempName;
    let orgRuntime: Awaited<ReturnType<typeof createOrgAdminHrPage>> | null = null;

    const findAdminRow = (name: string) =>
      page.locator('[data-testid^="admin-hr-policy-certification-row-"]').filter({ hasText: name }).first();

    try {
      await page.getByTestId("admin-hr-policy-add-certification").click();
      await page.fill("#admin-cert-name", tempName);
      await page.fill("#admin-cert-role", "Bridge Role");
      await page.fill("#admin-cert-issuer", "Bridge Issuer");
      await page.fill("#admin-cert-validity", "18");
      await page.fill("#admin-cert-reminder", "20");
      await page.getByRole("button", { name: "Simpan Sertifikasi" }).click();
      await expectToast(page, "Aturan sertifikasi berhasil ditambahkan.");

      const createdAdminRow = findAdminRow(tempName);
      await expect(createdAdminRow).toBeVisible();

      orgRuntime = await createOrgAdminHrPage(browser);
      await orgRuntime.page.goto("/org/hr/certifications", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Sertifikasi", exact: true })).toBeVisible();
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-certification-row-"]').filter({ hasText: tempName }).first()).toBeVisible();

      await createdAdminRow.locator('[data-testid^="admin-hr-policy-certification-edit-"]').first().click();
      await page.fill("#admin-cert-name", updatedName);
      await page.getByRole("button", { name: "Simpan Sertifikasi" }).click();
      await expectToast(page, "Aturan sertifikasi berhasil diperbarui.");
      currentName = updatedName;

      await orgRuntime.page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-certification-row-"]').filter({ hasText: updatedName }).first()).toBeVisible();

      await confirmBrowserDialogDelete(
        page,
        findAdminRow(updatedName).locator('[data-testid^="admin-hr-policy-certification-delete-"]').first(),
      );
      await expectToast(page, "Aturan sertifikasi berhasil dihapus.");
      currentName = "";

      await orgRuntime.page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator('[data-testid^="org-hr-certification-row-"]').filter({ hasText: updatedName })).toHaveCount(0);
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
            cleanupRow.locator('[data-testid^="admin-hr-policy-certification-delete-"]').first(),
          );
          await expectToast(page, "Aturan sertifikasi berhasil dihapus.");
        }
      }
    }
  });
});
