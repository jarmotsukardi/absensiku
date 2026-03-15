import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";
import { confirmBrowserDialogDelete, selectEssDocumentSource } from "./helpers/adminHrPolicyEditors";
import { expectToast, readSwitchState, setSwitchState } from "./helpers/uiHelpers";

test.describe.serial("Admin HR Policy Editors CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/policies", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Kebijakan HR" })).toBeVisible();
  });

  test("baseline program pelatihan bisa dibuat lalu dibersihkan", async ({ page }) => {
    const tempName = `E2E Program ${Date.now()}`;
    const updatedName = `${tempName} Updated`;

    await page.getByTestId("admin-hr-policy-add-training").click();
    await page.fill("#admin-training-name", tempName);
    await page.fill("#admin-training-category", "QA");
    await page.fill("#admin-training-provider", "E2E Provider");
    await page.fill("#admin-training-duration", "6");
    await page.fill("#admin-training-target", "12");
    await page.fill("#admin-training-notes", "restore-safe");
    await page.getByRole("button", { name: "Simpan Program" }).click();

    await expectToast(page, "Program pelatihan berhasil ditambahkan.");

    const row = page.locator('[data-testid^="admin-hr-policy-training-row-"]').filter({ hasText: tempName }).first();
    await expect(row).toBeVisible();

    await row.locator('[data-testid^="admin-hr-policy-training-edit-"]').first().click();
    await page.fill("#admin-training-name", updatedName);
    await page.getByRole("button", { name: "Simpan Program" }).click();
    await expectToast(page, "Program pelatihan berhasil diperbarui.");

    const updatedRow = page.locator('[data-testid^="admin-hr-policy-training-row-"]').filter({ hasText: updatedName }).first();
    await expect(updatedRow).toBeVisible();

    await confirmBrowserDialogDelete(page, updatedRow.locator('[data-testid^="admin-hr-policy-training-delete-"]').first());
    await expectToast(page, "Program pelatihan berhasil dihapus.");
    await expect(updatedRow).toHaveCount(0);
  });

  test("baseline sertifikasi bisa dibuat lalu dibersihkan", async ({ page }) => {
    const tempName = `E2E Sertifikasi ${Date.now()}`;
    const updatedName = `${tempName} Updated`;

    await page.getByTestId("admin-hr-policy-add-certification").click();
    await page.fill("#admin-cert-name", tempName);
    await page.fill("#admin-cert-role", "QA Role");
    await page.fill("#admin-cert-issuer", "E2E Issuer");
    await page.fill("#admin-cert-validity", "18");
    await page.fill("#admin-cert-reminder", "21");
    await page.getByRole("button", { name: "Simpan Sertifikasi" }).click();

    await expectToast(page, "Aturan sertifikasi berhasil ditambahkan.");

    const row = page.locator('[data-testid^="admin-hr-policy-certification-row-"]').filter({ hasText: tempName }).first();
    await expect(row).toBeVisible();

    await row.locator('[data-testid^="admin-hr-policy-certification-edit-"]').first().click();
    await page.fill("#admin-cert-name", updatedName);
    await page.getByRole("button", { name: "Simpan Sertifikasi" }).click();
    await expectToast(page, "Aturan sertifikasi berhasil diperbarui.");

    const updatedRow = page.locator('[data-testid^="admin-hr-policy-certification-row-"]').filter({ hasText: updatedName }).first();
    await expect(updatedRow).toBeVisible();

    await confirmBrowserDialogDelete(page, updatedRow.locator('[data-testid^="admin-hr-policy-certification-delete-"]').first());
    await expectToast(page, "Aturan sertifikasi berhasil dihapus.");
    await expect(updatedRow).toHaveCount(0);
  });

  test("baseline skill matrix bisa dibuat lalu dibersihkan", async ({ page }) => {
    const tempName = `E2E Skill ${Date.now()}`;
    const updatedName = `${tempName} Updated`;

    await page.getByTestId("admin-hr-policy-add-skill").click();
    await page.fill("#admin-skill-name", tempName);
    await page.fill("#admin-skill-function", "QA Function");
    await page.fill("#admin-skill-coverage", "42");
    await page.fill("#admin-skill-gap", "3");
    await page.fill("#admin-skill-linked-training", "Program QA");
    await page.getByRole("button", { name: "Simpan Skill" }).click();

    await expectToast(page, "Skill matrix berhasil ditambahkan.");

    const row = page.locator('[data-testid^="admin-hr-policy-skill-row-"]').filter({ hasText: tempName }).first();
    await expect(row).toBeVisible();

    await row.locator('[data-testid^="admin-hr-policy-skill-edit-"]').first().click();
    await page.fill("#admin-skill-name", updatedName);
    await page.getByRole("button", { name: "Simpan Skill" }).click();
    await expectToast(page, "Skill matrix berhasil diperbarui.");

    const updatedRow = page.locator('[data-testid^="admin-hr-policy-skill-row-"]').filter({ hasText: updatedName }).first();
    await expect(updatedRow).toBeVisible();

    await confirmBrowserDialogDelete(page, updatedRow.locator('[data-testid^="admin-hr-policy-skill-delete-"]').first());
    await expectToast(page, "Skill matrix berhasil dihapus.");
    await expect(updatedRow).toHaveCount(0);
  });

  test("baseline ESS bisa diperbarui lalu dikembalikan", async ({ page }) => {
    const requestsSwitch = page.getByTestId("admin-hr-policy-ess-requests");
    const attendanceSwitch = page.getByTestId("admin-hr-policy-ess-attendance");
    const documentsSwitch = page.getByTestId("admin-hr-policy-ess-documents");
    const profileSwitch = page.getByTestId("admin-hr-policy-ess-profile");
    const editableContactSwitch = page.getByTestId("admin-hr-policy-ess-profile-editable-contact");
    const lookbackInput = page.getByTestId("admin-hr-policy-ess-lookback-days");
    const saveButton = page.getByTestId("admin-hr-policy-save-ess");

    await expect(saveButton).toBeEnabled({ timeout: 15000 });

    const originalState = {
      requests: await readSwitchState(requestsSwitch),
      attendance: await readSwitchState(attendanceSwitch),
      documents: await readSwitchState(documentsSwitch),
      profile: await readSwitchState(profileSwitch),
      editableContact: await readSwitchState(editableContactSwitch),
      lookbackDays: await lookbackInput.inputValue(),
      documentSource: ((await page.getByTestId("admin-hr-policy-ess-document-source").textContent()) || "").trim() as
        | "Kontrak Kerja"
        | "Dokumen HR",
    };

    const updatedState = {
      requests: !originalState.requests,
      attendance: !originalState.attendance,
      documents: !originalState.documents,
      profile: !originalState.profile,
      editableContact: !originalState.editableContact,
      lookbackDays: originalState.lookbackDays === "17" ? "29" : "17",
      documentSource: originalState.documentSource === "Dokumen HR" ? "Kontrak Kerja" : "Dokumen HR",
    } as const;

    try {
      await setSwitchState(requestsSwitch, updatedState.requests);
      await setSwitchState(attendanceSwitch, updatedState.attendance);
      await setSwitchState(documentsSwitch, updatedState.documents);
      await setSwitchState(profileSwitch, updatedState.profile);
      await setSwitchState(editableContactSwitch, updatedState.editableContact);
      await lookbackInput.fill(updatedState.lookbackDays);
      await selectEssDocumentSource(page, updatedState.documentSource);

      await saveButton.click();
      await expectToast(page, "Baseline ESS berhasil disimpan.");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(saveButton).toBeEnabled({ timeout: 15000 });

      await expect(requestsSwitch).toHaveAttribute("aria-checked", String(updatedState.requests));
      await expect(attendanceSwitch).toHaveAttribute("aria-checked", String(updatedState.attendance));
      await expect(documentsSwitch).toHaveAttribute("aria-checked", String(updatedState.documents));
      await expect(profileSwitch).toHaveAttribute("aria-checked", String(updatedState.profile));
      await expect(editableContactSwitch).toHaveAttribute("aria-checked", String(updatedState.editableContact));
      await expect(lookbackInput).toHaveValue(updatedState.lookbackDays);
      await expect(page.getByTestId("admin-hr-policy-ess-document-source")).toContainText(updatedState.documentSource);
    } finally {
      await setSwitchState(requestsSwitch, originalState.requests);
      await setSwitchState(attendanceSwitch, originalState.attendance);
      await setSwitchState(documentsSwitch, originalState.documents);
      await setSwitchState(profileSwitch, originalState.profile);
      await setSwitchState(editableContactSwitch, originalState.editableContact);
      await lookbackInput.fill(originalState.lookbackDays);
      await selectEssDocumentSource(page, originalState.documentSource);

      await saveButton.click();
      await expectToast(page, "Baseline ESS berhasil disimpan.");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(saveButton).toBeEnabled({ timeout: 15000 });

      await expect(requestsSwitch).toHaveAttribute("aria-checked", String(originalState.requests));
      await expect(attendanceSwitch).toHaveAttribute("aria-checked", String(originalState.attendance));
      await expect(documentsSwitch).toHaveAttribute("aria-checked", String(originalState.documents));
      await expect(profileSwitch).toHaveAttribute("aria-checked", String(originalState.profile));
      await expect(editableContactSwitch).toHaveAttribute("aria-checked", String(originalState.editableContact));
      await expect(lookbackInput).toHaveValue(originalState.lookbackDays);
      await expect(page.getByTestId("admin-hr-policy-ess-document-source")).toContainText(originalState.documentSource);
    }
  });
});
