import { expect, type Page } from "@playwright/test";
import { waitForStable } from "./orgAuth";

export type OrgWorkspaceSwitchName = "Aktifkan workspace HR" | "Aktifkan workspace Payroll";

export const setOrgWorkspaceToggle = async (page: Page, switchName: OrgWorkspaceSwitchName, enabled: boolean) => {
  const saveButton = page.getByRole("button", { name: "Simpan Workspace" });
  await expect(saveButton).toBeEnabled();
  const toggle = page.getByRole("switch", { name: switchName });
  if ((await toggle.isChecked()) !== enabled) {
    await toggle.click();
    await saveButton.click();
    await waitForStable(page);
  }
};

export const ensureOrgWorkspaceStateFromOnboarding = async (
  page: Page,
  switchName: OrgWorkspaceSwitchName,
  enabled: boolean,
) => {
  await page.goto("/org/onboarding", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await setOrgWorkspaceToggle(page, switchName, enabled);
  await page.getByRole("button", { name: "Muat Ulang" }).first().click();
  await waitForStable(page);
  await setOrgWorkspaceToggle(page, switchName, enabled);
};

export const ensureOrgWorkspaceEnabled = async (page: Page, switchName: OrgWorkspaceSwitchName) => {
  await ensureOrgWorkspaceStateFromOnboarding(page, switchName, true);
};

export const openOrgWorkspaceWithRetry = async (page: Page, path: string, heading?: string) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const urlReady = page.url().includes(path);
    if (!heading && urlReady) {
      return;
    }

    if (heading) {
      const headingVisible = await page.getByRole("heading", { name: heading, exact: true }).isVisible().catch(() => false);
      if (urlReady && headingVisible) {
        return;
      }
    }

    await page.waitForTimeout(1_000);
  }
};
