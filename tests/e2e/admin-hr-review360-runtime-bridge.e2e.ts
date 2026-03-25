import { expect, test, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";
import {
  createOrgAdminHrPage,
  openAdminHrPolicies,
  readOrgHrTenantName,
  selectAdminHrTenantByVisibleName,
} from "./helpers/adminHrPolicyBridge";
import { expectToast, readSwitchState, setSwitchState } from "./helpers/uiHelpers";

type Review360Snapshot = {
  enabled: boolean;
  anonymous: boolean;
  peerCount: string;
  managerWeight: string;
};

const readReview360Snapshot = async (page: Page): Promise<Review360Snapshot> => ({
  enabled: await readSwitchState(page.getByTestId("admin-hr-policy-review360-enabled")),
  anonymous: await readSwitchState(page.getByTestId("admin-hr-policy-review360-anonymous")),
  peerCount: await page.getByTestId("admin-hr-policy-review360-peer-count").inputValue(),
  managerWeight: await page.getByTestId("admin-hr-policy-review360-manager-weight").inputValue(),
});

const applyReview360Snapshot = async (page: Page, snapshot: Review360Snapshot) => {
  await setSwitchState(page.getByTestId("admin-hr-policy-review360-enabled"), snapshot.enabled);
  await setSwitchState(page.getByTestId("admin-hr-policy-review360-anonymous"), snapshot.anonymous);
  await page.getByTestId("admin-hr-policy-review360-peer-count").fill(snapshot.peerCount);
  await page.getByTestId("admin-hr-policy-review360-manager-weight").fill(snapshot.managerWeight);
};

test.describe.serial("Admin HR Review360 Runtime Bridge", () => {
  test("baseline Ulasan 360 admin memengaruhi runtime org lalu kembali normal", async ({ page, browser }) => {
    const orgTenantName = await readOrgHrTenantName(browser);

    await loginAsSuperadmin(page);
    await openAdminHrPolicies(page);
    await selectAdminHrTenantByVisibleName(page, orgTenantName);

    const saveButton = page.getByTestId("admin-hr-policy-save-review360");
    await expect(saveButton).toBeEnabled({ timeout: 15000 });

    const originalState = await readReview360Snapshot(page);
    const updatedState: Review360Snapshot = {
      enabled: !originalState.enabled,
      anonymous: !originalState.anonymous,
      peerCount: originalState.peerCount === "2" ? "4" : "2",
      managerWeight: originalState.managerWeight === "50" ? "55" : "50",
    };

    let orgRuntime: Awaited<ReturnType<typeof createOrgAdminHrPage>> | null = null;

    try {
      await applyReview360Snapshot(page, updatedState);
      await saveButton.click();
      await expectToast(page, "Acuan bawaan Ulasan 360 berhasil disimpan.");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await selectAdminHrTenantByVisibleName(page, orgTenantName);
      await expect(saveButton).toBeEnabled({ timeout: 15000 });

      await expect(page.getByTestId("admin-hr-policy-review360-enabled")).toHaveAttribute("aria-checked", String(updatedState.enabled));
      await expect(page.getByTestId("admin-hr-policy-review360-anonymous")).toHaveAttribute("aria-checked", String(updatedState.anonymous));
      await expect(page.getByTestId("admin-hr-policy-review360-peer-count")).toHaveValue(updatedState.peerCount);
      await expect(page.getByTestId("admin-hr-policy-review360-manager-weight")).toHaveValue(updatedState.managerWeight);

      orgRuntime = await createOrgAdminHrPage(browser);
      await orgRuntime.page.goto("/org/hr/review-360", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);

      await expect(orgRuntime.page.getByRole("heading", { name: "Ulasan 360", exact: true })).toBeVisible();
      await expect(orgRuntime.page.getByTestId("org-hr-review360-enabled")).toHaveAttribute("aria-checked", String(updatedState.enabled));
      await expect(orgRuntime.page.getByTestId("org-hr-review360-anonymous")).toHaveAttribute("aria-checked", String(updatedState.anonymous));
      await expect(orgRuntime.page.getByTestId("org-hr-review360-peer-count")).toHaveValue(updatedState.peerCount);
      await expect(orgRuntime.page.getByTestId("org-hr-review360-manager-weight")).toHaveValue(updatedState.managerWeight);
    } finally {
      if (orgRuntime) {
        await orgRuntime.context.close();
      }

      await openAdminHrPolicies(page);
      await selectAdminHrTenantByVisibleName(page, orgTenantName);
      await expect(saveButton).toBeEnabled({ timeout: 15000 });
      await applyReview360Snapshot(page, originalState);
      await saveButton.click();
      await expectToast(page, "Acuan bawaan Ulasan 360 berhasil disimpan.");
    }
  });
});
