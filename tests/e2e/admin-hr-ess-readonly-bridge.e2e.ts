import { expect, test, type Page } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import {
  createOrgAdminHrPage,
  openAdminHrPoliciesForTenant,
  readOrgHrTenantName,
} from "./helpers/adminHrPolicyBridge";
import { waitForStable } from "./helpers/orgAuth";
import { readSwitchState } from "./helpers/uiHelpers";

type EssSnapshot = {
  requests: boolean;
  attendance: boolean;
  documents: boolean;
  profile: boolean;
  editableContact: boolean;
  lookbackDays: string;
  documentSource: "Kontrak Kerja" | "Dokumen HR";
};

const readEssSnapshot = async (page: Page): Promise<EssSnapshot> => ({
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

test.describe.serial("Admin HR ESS Readonly Bridge", () => {
  test("baseline ESS aktif di admin terbaca konsisten di runtime org", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const tenantName = await readOrgHrTenantName(browser);

    await loginAsSuperadmin(page);
    await openAdminHrPoliciesForTenant(page, tenantName);
    await expect(page.getByTestId("admin-hr-policy-save-ess")).toBeEnabled({ timeout: 15_000 });
    const snapshot = await readEssSnapshot(page);

    const orgRuntime = await createOrgAdminHrPage(browser);
    try {
      await orgRuntime.page.goto("/org/hr/ess/requests", { waitUntil: "domcontentloaded" });
      await waitForStable(orgRuntime.page);
      await expect(orgRuntime.page.getByRole("heading", { name: "Pengajuan ESS", exact: true })).toBeVisible();
      if (snapshot.requests) {
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
      if (!snapshot.attendance && !orgRuntime.page.url().includes("/org/hr/ess/attendance")) {
        await expect(orgRuntime.page).toHaveURL(/\/org\/hr(?:\?.*)?$/);
      } else {
        await expect(orgRuntime.page.getByRole("heading", { name: "Kehadiran ESS", exact: true })).toBeVisible();
      }
      if (snapshot.attendance) {
        await expect(orgRuntime.page.getByText(`Record ${snapshot.lookbackDays} Hari`, { exact: true })).toBeVisible();
        await expect(
          orgRuntime.page.getByText(
            `Menampilkan kehadiran pribadi terbaru dalam ${snapshot.lookbackDays} hari terakhir.`,
            { exact: true },
          ),
        ).toBeVisible();
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
      await expect(orgRuntime.page.getByRole("heading", { name: "Dokumen ESS", exact: true })).toBeVisible();
      if (snapshot.documents) {
        await expect(
          orgRuntime.page.getByText(`Saat ini ESS dokumen memakai baseline tenant dengan sumber aktif: ${snapshot.documentSource}.`, {
            exact: true,
          }),
        ).toBeVisible();
        await expect(orgRuntime.page.getByText(snapshot.documentSource, { exact: true }).first()).toBeVisible();
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
      await expect(orgRuntime.page.getByRole("heading", { name: "Profil ESS", exact: true })).toBeVisible();
      if (snapshot.profile) {
        if (snapshot.editableContact) {
          await expect(orgRuntime.page.getByRole("link", { name: "Edit Kontak" })).toBeVisible();
          await expect(
            orgRuntime.page.getByText(
              'Baseline tenant mengizinkan pembaruan kontak dari profil organisasi. Gunakan tombol "Edit Kontak" untuk memperbarui data kontak.',
              { exact: true },
            ),
          ).toBeVisible();
        } else {
          await expect(orgRuntime.page.getByRole("link", { name: "Kelola Kontak" })).toBeVisible();
          await expect(
            orgRuntime.page.getByText(
              "Perubahan kontak dan password tetap dilakukan dari halaman profil organisasi agar audit perubahan akun tetap terpusat.",
              { exact: true },
            ),
          ).toBeVisible();
        }
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
});
