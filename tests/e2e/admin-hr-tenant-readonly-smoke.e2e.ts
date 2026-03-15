import { expect, test, type Browser, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import {
  createOrgAdminHrPage,
  openAdminHrPoliciesForTenant,
  readAdminHrPolicyCardCount,
  readAdminHrPrimaryName,
  readOrgHrTenantName,
} from "./helpers/adminHrPolicyBridge";
import { waitForStable } from "./helpers/orgAuth";
import { readSwitchState } from "./helpers/uiHelpers";

const assertHeadingUrlAndEmptyOrRows = async (
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
  } else {
    await expect(page.locator(rowSelector).first()).toBeVisible();
    await expect(page.locator(rowSelector)).toHaveCount(expectedCount);
  }
};

test.describe.serial("Admin HR Tenant Readonly Smoke", () => {
  const prepareTenantAdminState = async (page: Page, browser: Browser) => {
    const tenantName = await readOrgHrTenantName(browser);

    await loginAsSuperadmin(page);
    await openAdminHrPoliciesForTenant(page, tenantName);
    await expect(page.getByTestId("admin-hr-policy-save-review360")).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("admin-hr-policy-save-ess")).toBeEnabled({ timeout: 15_000 });

    return { tenantName };
  };

  test("training bundle tenant sinkron antara admin dan org", async ({ page, browser }) => {
    const { tenantName } = await prepareTenantAdminState(page, browser);

    const trainingCount = await page.locator('[data-testid^="admin-hr-policy-training-row-"]').count();
    const certificationCount = await page.locator('[data-testid^="admin-hr-policy-certification-row-"]').count();
    const skillCount = await page.locator('[data-testid^="admin-hr-policy-skill-row-"]').count();

    const latestTrainingName =
      trainingCount > 0
        ? await readAdminHrPrimaryName(page.locator('[data-testid^="admin-hr-policy-training-row-"]').first())
        : "";
    const latestCertificationName =
      certificationCount > 0
        ? await readAdminHrPrimaryName(page.locator('[data-testid^="admin-hr-policy-certification-row-"]').first())
        : "";
    const latestSkillName =
      skillCount > 0
        ? await readAdminHrPrimaryName(page.locator('[data-testid^="admin-hr-policy-skill-row-"]').first())
        : "";

    const essSnapshot = {
      requests: await readSwitchState(page.getByTestId("admin-hr-policy-ess-requests")),
      attendance: await readSwitchState(page.getByTestId("admin-hr-policy-ess-attendance")),
      documents: await readSwitchState(page.getByTestId("admin-hr-policy-ess-documents")),
      profile: await readSwitchState(page.getByTestId("admin-hr-policy-ess-profile")),
      editableContact: await readSwitchState(page.getByTestId("admin-hr-policy-ess-profile-editable-contact")),
      lookbackDays: await page.getByTestId("admin-hr-policy-ess-lookback-days").inputValue(),
      documentSource: ((await page.getByTestId("admin-hr-policy-ess-document-source").textContent()) || "").trim(),
    };

    const performanceSnapshot = {
      kpiCount: await readAdminHrPolicyCardCount(page, "KPI"),
      periodCount: await readAdminHrPolicyCardCount(page, "Periode"),
      formCount: await readAdminHrPolicyCardCount(page, "Form"),
      review360Enabled: await readSwitchState(page.getByTestId("admin-hr-policy-review360-enabled")),
      review360Anonymous: await readSwitchState(page.getByTestId("admin-hr-policy-review360-anonymous")),
      review360PeerCount: await page.getByTestId("admin-hr-policy-review360-peer-count").inputValue(),
      review360ManagerWeight: await page.getByTestId("admin-hr-policy-review360-manager-weight").inputValue(),
    };

    const orgRuntime = await createOrgAdminHrPage(browser);
    try {
      await orgRuntime.page.goto("/org/hr", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator("span.font-bold.text-sidebar-foreground.truncate").first()).toContainText(tenantName);

      await assertHeadingUrlAndEmptyOrRows(
        orgRuntime.page,
        "/org/hr/training-data",
        "Data Pelatihan",
        '[data-testid^="org-hr-training-row-"]',
        "Belum ada program pelatihan yang disimpan.",
        trainingCount,
      );
      if (latestTrainingName) {
        await expect(
          orgRuntime.page.locator('[data-testid^="org-hr-training-row-"]').filter({ hasText: latestTrainingName }).first(),
        ).toBeVisible();
      }

      await assertHeadingUrlAndEmptyOrRows(
        orgRuntime.page,
        "/org/hr/certifications",
        "Sertifikasi",
        '[data-testid^="org-hr-certification-row-"]',
        "Belum ada aturan sertifikasi yang disimpan.",
        certificationCount,
      );
      if (latestCertificationName) {
        await expect(
          orgRuntime.page.locator('[data-testid^="org-hr-certification-row-"]').filter({ hasText: latestCertificationName }).first(),
        ).toBeVisible();
      }

      await assertHeadingUrlAndEmptyOrRows(
        orgRuntime.page,
        "/org/hr/skill-matrix",
        "Matriks Kompetensi",
        '[data-testid^="org-hr-skill-row-"]',
        "Belum ada matriks keahlian yang disimpan.",
        skillCount,
      );
      if (latestSkillName) {
        await expect(
          orgRuntime.page.locator('[data-testid^="org-hr-skill-row-"]').filter({ hasText: latestSkillName }).first(),
        ).toBeVisible();
      }
    } finally {
      await orgRuntime.context.close().catch(() => undefined);
    }
  });

  test("ESS tenant sinkron antara admin dan org", async ({ page, browser }) => {
    const { tenantName } = await prepareTenantAdminState(page, browser);

    const essSnapshot = {
      requests: await readSwitchState(page.getByTestId("admin-hr-policy-ess-requests")),
      attendance: await readSwitchState(page.getByTestId("admin-hr-policy-ess-attendance")),
      documents: await readSwitchState(page.getByTestId("admin-hr-policy-ess-documents")),
      profile: await readSwitchState(page.getByTestId("admin-hr-policy-ess-profile")),
      editableContact: await readSwitchState(page.getByTestId("admin-hr-policy-ess-profile-editable-contact")),
      lookbackDays: await page.getByTestId("admin-hr-policy-ess-lookback-days").inputValue(),
      documentSource: ((await page.getByTestId("admin-hr-policy-ess-document-source").textContent()) || "").trim(),
    };

    const orgRuntime = await createOrgAdminHrPage(browser);
    try {
      await orgRuntime.page.goto("/org/hr", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator("span.font-bold.text-sidebar-foreground.truncate").first()).toContainText(tenantName);

      await orgRuntime.page.goto("/org/hr/ess/requests", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Pengajuan ESS", exact: true })).toBeVisible();
      if (essSnapshot.requests) {
        await expect(
          orgRuntime.page.getByText(
            "Ringkasan pengajuan ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.",
            { exact: true },
          ),
        ).toHaveCount(0);
      } else {
        await expect(
          orgRuntime.page.getByText(
            "Ringkasan pengajuan ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.",
            { exact: true },
          ),
        ).toBeVisible();
      }

      await orgRuntime.page.goto("/org/hr/ess/attendance", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Kehadiran Saya", exact: true })).toBeVisible();
      if (essSnapshot.attendance) {
        await expect(orgRuntime.page.getByText(`Record ${essSnapshot.lookbackDays} Hari`, { exact: true })).toBeVisible();
      } else {
        await expect(
          orgRuntime.page.getByText(
            "Tampilan kehadiran ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.",
            { exact: true },
          ),
        ).toBeVisible();
      }

      await orgRuntime.page.goto("/org/hr/ess/documents", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Dokumen Saya", exact: true })).toBeVisible();
      if (essSnapshot.documents) {
        await expect(
          orgRuntime.page.getByText(`Saat ini ESS dokumen memakai baseline tenant dengan sumber aktif: ${essSnapshot.documentSource}.`, {
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await expect(
          orgRuntime.page.getByText(
            "Tampilan dokumen ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.",
            { exact: true },
          ),
        ).toBeVisible();
      }

      await orgRuntime.page.goto("/org/hr/ess/profile", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Profil Saya", exact: true })).toBeVisible();
      if (essSnapshot.profile) {
        await expect(
          orgRuntime.page.getByRole("link", { name: essSnapshot.editableContact ? "Edit Kontak" : "Kelola Kontak" }),
        ).toBeVisible();
      } else {
        await expect(
          orgRuntime.page.getByText(
            "Tampilan profil ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.",
            { exact: true },
          ),
        ).toBeVisible();
      }
    } finally {
      await orgRuntime.context.close().catch(() => undefined);
    }
  });

  test("kinerja tenant sinkron antara admin dan org", async ({ page, browser }) => {
    const { tenantName } = await prepareTenantAdminState(page, browser);

    const performanceSnapshot = {
      kpiCount: await readAdminHrPolicyCardCount(page, "KPI"),
      periodCount: await readAdminHrPolicyCardCount(page, "Periode"),
      formCount: await readAdminHrPolicyCardCount(page, "Form"),
      review360Enabled: await readSwitchState(page.getByTestId("admin-hr-policy-review360-enabled")),
      review360Anonymous: await readSwitchState(page.getByTestId("admin-hr-policy-review360-anonymous")),
      review360PeerCount: await page.getByTestId("admin-hr-policy-review360-peer-count").inputValue(),
      review360ManagerWeight: await page.getByTestId("admin-hr-policy-review360-manager-weight").inputValue(),
    };

    const orgRuntime = await createOrgAdminHrPage(browser);
    try {
      await orgRuntime.page.goto("/org/hr", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.locator("span.font-bold.text-sidebar-foreground.truncate").first()).toContainText(tenantName);

      await assertHeadingUrlAndEmptyOrRows(
        orgRuntime.page,
        "/org/hr/kpi",
        "KPI",
        '[data-testid^="org-hr-kpi-row-"]',
        "Belum ada baseline KPI yang disimpan.",
        performanceSnapshot.kpiCount,
      );

      await assertHeadingUrlAndEmptyOrRows(
        orgRuntime.page,
        "/org/hr/performance-periods",
        "Periode Penilaian",
        '[data-testid^="org-hr-performance-period-row-"]',
        "Belum ada periode penilaian yang disimpan.",
        performanceSnapshot.periodCount,
      );

      await assertHeadingUrlAndEmptyOrRows(
        orgRuntime.page,
        "/org/hr/performance-forms",
        "Form Penilaian",
        '[data-testid^="org-hr-performance-form-row-"]',
        "Belum ada form penilaian yang disimpan.",
        performanceSnapshot.formCount,
      );

      await orgRuntime.page.goto("/org/hr/review-360", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Ulasan 360", exact: true })).toBeVisible();
      await expect(orgRuntime.page.getByTestId("org-hr-review360-enabled")).toHaveAttribute(
        "aria-checked",
        String(performanceSnapshot.review360Enabled),
      );
      await expect(orgRuntime.page.getByTestId("org-hr-review360-anonymous")).toHaveAttribute(
        "aria-checked",
        String(performanceSnapshot.review360Anonymous),
      );
      await expect(orgRuntime.page.getByTestId("org-hr-review360-peer-count")).toHaveValue(performanceSnapshot.review360PeerCount);
      await expect(orgRuntime.page.getByTestId("org-hr-review360-manager-weight")).toHaveValue(
        performanceSnapshot.review360ManagerWeight,
      );
    } finally {
      await orgRuntime.context.close().catch(() => undefined);
    }
  });
});
