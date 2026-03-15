import { expect, test, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { selectEssDocumentSource } from "./helpers/adminHrPolicyEditors";
import {
  createOrgAdminHrPage,
  openAdminHrPolicies,
  readOrgHrTenantName,
  selectAdminHrTenantByVisibleName,
} from "./helpers/adminHrPolicyBridge";
import { waitForStable } from "./helpers/orgAuth";
import { expectToast, readSwitchState, setSwitchState } from "./helpers/uiHelpers";

type EssPolicySnapshot = {
  requests: boolean;
  attendance: boolean;
  documents: boolean;
  profile: boolean;
  editableContact: boolean;
  lookbackDays: string;
  documentSource: "Kontrak Kerja" | "Dokumen HR";
};

const readEssPolicySnapshot = async (page: Page): Promise<EssPolicySnapshot> => ({
  requests: await readSwitchState(page.getByTestId("admin-hr-policy-ess-requests")),
  attendance: await readSwitchState(page.getByTestId("admin-hr-policy-ess-attendance")),
  documents: await readSwitchState(page.getByTestId("admin-hr-policy-ess-documents")),
  profile: await readSwitchState(page.getByTestId("admin-hr-policy-ess-profile")),
  editableContact: await readSwitchState(page.getByTestId("admin-hr-policy-ess-profile-editable-contact")),
  lookbackDays: await page.getByTestId("admin-hr-policy-ess-lookback-days").inputValue(),
  documentSource: ((await page.getByTestId("admin-hr-policy-ess-document-source").textContent()) || "").trim() as
    | "Kontrak Kerja"
    | "Dokumen HR",
});

const applyEssPolicySnapshot = async (page: Page, snapshot: EssPolicySnapshot) => {
  await setSwitchState(page.getByTestId("admin-hr-policy-ess-requests"), snapshot.requests);
  await setSwitchState(page.getByTestId("admin-hr-policy-ess-attendance"), snapshot.attendance);
  await setSwitchState(page.getByTestId("admin-hr-policy-ess-documents"), snapshot.documents);
  await setSwitchState(page.getByTestId("admin-hr-policy-ess-profile"), snapshot.profile);
  await setSwitchState(page.getByTestId("admin-hr-policy-ess-profile-editable-contact"), snapshot.editableContact);
  await page.getByTestId("admin-hr-policy-ess-lookback-days").fill(snapshot.lookbackDays);
  await selectEssDocumentSource(page, snapshot.documentSource);
};

test.describe.serial("Admin HR ESS Runtime Bridge", () => {
  test("baseline ESS admin memengaruhi runtime org lalu kembali normal", async ({ page, browser }) => {
    const orgTenantName = await readOrgHrTenantName(browser);

    await loginAsSuperadmin(page);
    await openAdminHrPolicies(page);
    await selectAdminHrTenantByVisibleName(page, orgTenantName);
    await waitForStable(page);

    const saveButton = page.getByTestId("admin-hr-policy-save-ess");
    await expect(saveButton).toBeEnabled({ timeout: 15_000 });

    const originalState = await readEssPolicySnapshot(page);
    const updatedState: EssPolicySnapshot = {
      requests: false,
      attendance: true,
      documents: false,
      profile: true,
      editableContact: true,
      lookbackDays: "17",
      documentSource: "Dokumen HR",
    };

    let orgRuntime: Awaited<ReturnType<typeof createOrgAdminHrPage>> | null = null;

    try {
      await applyEssPolicySnapshot(page, updatedState);
      await saveButton.click();
      await expectToast(page, "Baseline ESS berhasil disimpan.");

      orgRuntime = await createOrgAdminHrPage(browser);

      await orgRuntime.page.goto("/org/hr/ess/requests", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(
        orgRuntime.page.getByText(
          "Ringkasan pengajuan ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.",
          { exact: true },
        ),
      ).toBeVisible();

      await orgRuntime.page.goto("/org/hr/ess/attendance", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByText("Record 17 Hari", { exact: true })).toBeVisible();
      await expect(
        orgRuntime.page.getByText("Menampilkan kehadiran pribadi terbaru dalam 17 hari terakhir.", { exact: true }),
      ).toBeVisible();

      await orgRuntime.page.goto("/org/hr/ess/documents", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(
        orgRuntime.page.getByText(
          "Tampilan dokumen ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.",
          { exact: true },
        ),
      ).toBeVisible();

      await orgRuntime.page.goto("/org/hr/ess/profile", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("link", { name: "Edit Kontak" })).toBeVisible();
      await expect(
        orgRuntime.page.getByText(
          'Baseline tenant mengizinkan pembaruan kontak dari profil organisasi. Gunakan tombol "Edit Kontak" untuk memperbarui data kontak.',
          { exact: true },
        ),
      ).toBeVisible();
    } finally {
      if (orgRuntime) {
        await orgRuntime.context.close();
      }

      await openAdminHrPolicies(page);
      await selectAdminHrTenantByVisibleName(page, orgTenantName);
      await waitForStable(page);
      await expect(saveButton).toBeEnabled({ timeout: 15_000 });
      await applyEssPolicySnapshot(page, originalState);
      await saveButton.click();
      await expectToast(page, "Baseline ESS berhasil disimpan.");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await selectAdminHrTenantByVisibleName(page, orgTenantName);
      await waitForStable(page);

      const restoredState = await readEssPolicySnapshot(page);
      expect(restoredState).toEqual(originalState);
    }
  });
});
