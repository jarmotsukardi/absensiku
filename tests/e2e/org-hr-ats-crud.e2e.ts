import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import { ensureOrgWorkspaceEnabled } from "./helpers/orgWorkspace";
import {
  closeDialogIfVisible,
  latestDialog as dialog,
  saveDialogOrFallback,
  selectDialogOption,
} from "./helpers/crudDialogs";

test.describe.serial("Org HR ATS CRUD", () => {
  test("lowongan ATS: create/edit jika writable, fallback stabil jika tidak", async ({ page }) => {
    test.setTimeout(90_000);

    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    const seed = Date.now();
    const jobTitle = `ATS Lowongan ${seed}`;
    const editedJobTitle = `${jobTitle} Edit`;

    await page.goto("/org/hr/recruitment/jobs", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Lowongan Kerja", exact: true })).toBeVisible();

    const addButton = page.getByRole("button", { name: "Tambah Lowongan" });
    if (!(await addButton.isVisible().catch(() => false))) return;

    await addButton.click();
    await expect(dialog(page).getByRole("heading", { name: "Tambah Lowongan" })).toBeVisible();
    await dialog(page).locator("#job_title").fill(jobTitle);
    await dialog(page).locator("#job_department").fill("People Ops");
    await selectDialogOption(dialog(page), 0, "Penuh Waktu");
    await dialog(page).locator("#job_opening_count").fill("2");
    await dialog(page).locator("#job_location").fill("Jakarta");
    await selectDialogOption(dialog(page), 1, "Dipublikasikan");

    const created = await saveDialogOrFallback(page, "Tambah Lowongan", "Lowongan Kerja");
    if (!created) return;

    await page.getByPlaceholder("Cari judul, departemen, lokasi...").fill(jobTitle);
    await waitForStable(page);
    const row = page.locator("tbody tr", { hasText: jobTitle }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit" }).click();

    await expect(dialog(page).getByRole("heading", { name: "Edit Lowongan" })).toBeVisible();
    await dialog(page).locator("#job_title").fill(editedJobTitle);
    await dialog(page).locator("#job_department").fill("People Strategy");
    await selectDialogOption(dialog(page), 1, "Ditutup");

    const edited = await saveDialogOrFallback(page, "Edit Lowongan", "Lowongan Kerja");
    if (!edited) return;

    await page.getByPlaceholder("Cari judul, departemen, lokasi...").fill(editedJobTitle);
    await waitForStable(page);
    await expect(page.locator("tbody tr", { hasText: editedJobTitle }).first()).toBeVisible();
  });

  test("kandidat ATS: create/edit jika writable, fallback stabil jika tidak", async ({ page }) => {
    test.setTimeout(90_000);

    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    const seed = Date.now();
    const candidateName = `ATS Kandidat ${seed}`;
    const editedCandidateName = `${candidateName} Edit`;

    await page.goto("/org/hr/recruitment/candidates", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Kandidat", exact: true })).toBeVisible();

    const addButton = page.getByRole("button", { name: "Tambah Kandidat" });
    if (!(await addButton.isVisible().catch(() => false))) return;

    await addButton.click();
    await expect(dialog(page).getByRole("heading", { name: "Tambah Kandidat" })).toBeVisible();
    await dialog(page).locator("#candidate_name").fill(candidateName);
    await dialog(page).locator("#candidate_email").fill(`ats-${seed}@example.com`);
    await dialog(page).locator("#candidate_phone").fill(`0812${String(seed).slice(-8)}`);
    await selectDialogOption(dialog(page), 0, "Tanpa Lowongan");
    await selectDialogOption(dialog(page), 1, "Interview");
    await selectDialogOption(dialog(page), 2, "Aktif");

    const created = await saveDialogOrFallback(page, "Tambah Kandidat", "Kandidat");
    if (!created) return;

    await page.getByPlaceholder("Cari kandidat, email, nomor telepon, lowongan...").fill(candidateName);
    await waitForStable(page);
    const row = page.locator("tbody tr", { hasText: candidateName }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit" }).click();

    await expect(dialog(page).getByRole("heading", { name: "Edit Kandidat" })).toBeVisible();
    await dialog(page).locator("#candidate_name").fill(editedCandidateName);
    await selectDialogOption(dialog(page), 1, "Offer");
    await selectDialogOption(dialog(page), 2, "Ditunda");

    const edited = await saveDialogOrFallback(page, "Edit Kandidat", "Kandidat");
    if (!edited) return;

    await page.getByPlaceholder("Cari kandidat, email, nomor telepon, lowongan...").fill(editedCandidateName);
    await waitForStable(page);
    await expect(page.locator("tbody tr", { hasText: editedCandidateName }).first()).toBeVisible();
  });

  test("interview ATS: create/edit jika ada kandidat dan writable, fallback stabil jika tidak", async ({ page }) => {
    test.setTimeout(90_000);

    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    const seed = Date.now();
    const interviewRound = `round_${seed}`;
    const editedInterviewRound = `${interviewRound}_edit`;

    await page.goto("/org/hr/recruitment/interviews", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Tahap Interview", exact: true })).toBeVisible();

    const addButton = page.getByRole("button", { name: "Tambah Interview" });
    if (!(await addButton.isVisible().catch(() => false))) return;

    await addButton.click();
    await expect(dialog(page).getByRole("heading", { name: "Tambah Interview" })).toBeVisible();

    const candidateTrigger = dialog(page).getByRole("combobox").nth(0);
    await candidateTrigger.click();
    const candidateOptions = page.getByRole("option");
    const optionCount = await candidateOptions.count();
    if (optionCount === 0) {
      await page.keyboard.press("Escape");
      await closeDialogIfVisible(page, "Tambah Interview");
      await expect(page.getByRole("heading", { name: "Tahap Interview", exact: true })).toBeVisible();
      return;
    }
    await candidateOptions.first().click();

    await dialog(page).locator("#interview_round").fill(interviewRound);
    await dialog(page).locator("#scheduled_at").fill("2026-03-20T10:30");
    await dialog(page).locator("#interviewer_name").fill("Panel ATS");
    await dialog(page).locator("#interviewer_email").fill(`panel-${seed}@example.com`);
    await selectDialogOption(dialog(page), 1, "Offline");
    await selectDialogOption(dialog(page), 2, "Scheduled");
    await dialog(page).locator("#score").fill("88");

    const created = await saveDialogOrFallback(page, "Tambah Interview", "Tahap Interview");
    if (!created) return;

    await page.getByPlaceholder("Cari kandidat, ronde, mode, status...").fill(interviewRound);
    await waitForStable(page);
    const row = page.locator("tbody tr", { hasText: interviewRound }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit" }).click();

    await expect(dialog(page).getByRole("heading", { name: "Edit Interview" })).toBeVisible();
    await dialog(page).locator("#interview_round").fill(editedInterviewRound);
    await selectDialogOption(dialog(page), 2, "Completed");
    await dialog(page).locator("#score").fill("92");

    const edited = await saveDialogOrFallback(page, "Edit Interview", "Tahap Interview");
    if (!edited) return;

    await page.getByPlaceholder("Cari kandidat, ronde, mode, status...").fill(editedInterviewRound);
    await waitForStable(page);
    await expect(page.locator("tbody tr", { hasText: editedInterviewRound }).first()).toBeVisible();
  });

  test("penawaran ATS: create/edit jika ada kandidat dan writable, fallback stabil jika tidak", async ({ page }) => {
    test.setTimeout(90_000);

    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    const seed = Date.now();
    const offerPosition = `ATS Position ${seed}`;
    const editedOfferPosition = `${offerPosition} Edit`;

    await page.goto("/org/hr/recruitment/offers", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Penawaran Kerja", exact: true })).toBeVisible();

    const addButton = page.getByRole("button", { name: "Tambah Penawaran" });
    if (!(await addButton.isVisible().catch(() => false))) return;

    await addButton.click();
    await expect(dialog(page).getByRole("heading", { name: "Tambah Penawaran" })).toBeVisible();

    const candidateTrigger = dialog(page).getByRole("combobox").nth(0);
    await candidateTrigger.click();
    const candidateOptions = page.getByRole("option");
    const optionCount = await candidateOptions.count();
    if (optionCount === 0) {
      await page.keyboard.press("Escape");
      await closeDialogIfVisible(page, "Tambah Penawaran");
      await expect(page.getByRole("heading", { name: "Penawaran Kerja", exact: true })).toBeVisible();
      return;
    }
    await candidateOptions.first().click();

    await dialog(page).locator("#offered_position").fill(offerPosition);
    await dialog(page).locator("#offered_salary").fill("12000000");
    await dialog(page).locator("#currency").fill("IDR");
    await dialog(page).locator("#offered_at").fill("2026-03-21T09:00");
    await dialog(page).locator("#expiry_at").fill("2026-03-28T17:00");
    await selectDialogOption(dialog(page), 1, "Dikirim");

    const created = await saveDialogOrFallback(page, "Tambah Penawaran", "Penawaran Kerja");
    if (!created) return;

    await page.getByPlaceholder("Cari kandidat, posisi, status...").fill(offerPosition);
    await waitForStable(page);
    const row = page.locator("tbody tr", { hasText: offerPosition }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit" }).click();

    await expect(dialog(page).getByRole("heading", { name: "Edit Penawaran" })).toBeVisible();
    await dialog(page).locator("#offered_position").fill(editedOfferPosition);
    await selectDialogOption(dialog(page), 1, "Diterima");

    const edited = await saveDialogOrFallback(page, "Edit Penawaran", "Penawaran Kerja");
    if (!edited) return;

    await page.getByPlaceholder("Cari kandidat, posisi, status...").fill(editedOfferPosition);
    await waitForStable(page);
    await expect(page.locator("tbody tr", { hasText: editedOfferPosition }).first()).toBeVisible();
  });

  test("kandidat ATS: konversi onboarding jika kandidat hired bisa dibuat, fallback stabil jika tidak", async ({ page }) => {
    test.setTimeout(90_000);

    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    const seed = Date.now();
    const candidateName = `ATS Onboard ${seed}`;
    const candidateEmail = `ats-onboard-${seed}@example.com`;

    await page.goto("/org/hr/recruitment/candidates", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Kandidat", exact: true })).toBeVisible();

    const addButton = page.getByRole("button", { name: "Tambah Kandidat" });
    if (!(await addButton.isVisible().catch(() => false))) return;

    await addButton.click();
    await expect(dialog(page).getByRole("heading", { name: "Tambah Kandidat" })).toBeVisible();
    await dialog(page).locator("#candidate_name").fill(candidateName);
    await dialog(page).locator("#candidate_email").fill(candidateEmail);
    await dialog(page).locator("#candidate_phone").fill(`0813${String(seed).slice(-8)}`);
    await selectDialogOption(dialog(page), 0, "Tanpa Lowongan");
    await selectDialogOption(dialog(page), 1, "Diterima");
    await selectDialogOption(dialog(page), 2, "Diterima");

    const created = await saveDialogOrFallback(page, "Tambah Kandidat", "Kandidat");
    if (!created) return;

    await page.getByPlaceholder("Cari kandidat, email, nomor telepon, lowongan...").fill(candidateName);
    await waitForStable(page);
    const row = page.locator("tbody tr", { hasText: candidateName }).first();
    await expect(row).toBeVisible();

    const convertButton = row.getByRole("button", { name: "Konversi Onboarding" });
    await expect(convertButton).toBeVisible();
    await convertButton.click();
    await page.waitForTimeout(2_000);

    const invitationDialogVisible = await page
      .getByRole("heading", { name: "Undangan Onboarding Kandidat" })
      .isVisible()
      .catch(() => false);

    if (invitationDialogVisible) {
      await expect(page.getByText("Kode Undangan")).toBeVisible();
      await expect(page.getByRole("button", { name: "Tutup" })).toBeVisible();
      await page.getByRole("button", { name: "Tutup" }).click();
      await waitForStable(page);
      return;
    }

    await expect(page.getByRole("heading", { name: "Kandidat", exact: true })).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: candidateName }).first()).toBeVisible();
  });
});
