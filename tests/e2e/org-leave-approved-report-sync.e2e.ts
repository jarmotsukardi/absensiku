import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import {
  createSupabaseAnonTestClient,
  createSupabaseServiceTestClient,
  getMissingSupabaseTestEnvKeys,
} from "./helpers/supabaseTestEnv";
import { getRoleCredsWithFallback } from "./helpers/testAccounts";
import { getFilterPanelByPlaceholder, selectPanelComboboxOption } from "./helpers/filterPanels";
import { countTableRowsIgnoringEmptyState, parseCountFromText } from "./helpers/tableMetrics";

type RoleCreds = {
  email: string;
  password: string;
};

type EmployeeContext = {
  id: string;
  tenant_id: string;
};

const LATE_PERMISSION_REASON_PREFIX = "[IZIN_TERLAMBAT_V1]";
const EARLY_LEAVE_PERMISSION_REASON_PREFIX = "[IZIN_PULANG_CEPAT_V1]";
const resolveEmployeeContext = async (
  serviceClient: SupabaseClient,
  anonClient: SupabaseClient,
  creds: RoleCreds,
): Promise<EmployeeContext | null> => {
  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (authError || !authData.user?.id) return null;

  try {
    const byUserId = await serviceClient
      .from("employees")
      .select("id, tenant_id, is_active")
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .limit(2);
    if (!byUserId.error && byUserId.data && byUserId.data.length === 1) {
      return {
        id: byUserId.data[0].id,
        tenant_id: byUserId.data[0].tenant_id,
      };
    }

    const byEmail = await serviceClient
      .from("employees")
      .select("id, tenant_id, is_active")
      .eq("email", creds.email)
      .eq("is_active", true)
      .limit(2);
    if (byEmail.error || !byEmail.data || byEmail.data.length !== 1) return null;

    return {
      id: byEmail.data[0].id,
      tenant_id: byEmail.data[0].tenant_id,
    };
  } finally {
    await anonClient.auth.signOut();
  }
};

const getYmdPlusDays = (daysFromToday: number): string => {
  const value = new Date();
  value.setDate(value.getDate() + daysFromToday);
  return value.toISOString().slice(0, 10);
};

const buildLateReason = (token: string, index: number): string =>
  [
    LATE_PERMISSION_REASON_PREFIX,
    "ETA: 09:40",
    `ALASAN: E2E-APPROVED-REPORT ${token}-LATE-${String(index).padStart(2, "0")}`,
  ].join("\n");

const buildEarlyReason = (token: string, index: number): string =>
  [
    EARLY_LEAVE_PERMISSION_REASON_PREFIX,
    "JAM_PULANG: 15:20",
    `ALASAN: E2E-APPROVED-REPORT ${token}-EARLY-${String(index).padStart(2, "0")}`,
  ].join("\n");

const buildRegularReason = (token: string, index: number): string =>
  `E2E-APPROVED-REPORT ${token}-REG-${String(index).padStart(2, "0")}`;

const getTotalApprovedFromUi = async (page: Page): Promise<number> => {
  const text = (await page.getByText(/^Total \d+ data$/).first().textContent().catch(() => "")) || "";
  return parseCountFromText(text, /Total\s+(\d+)\s+data/i);
};

const getTotalReportFromUi = async (page: Page): Promise<number> => {
  const text =
    (await page
      .getByRole("heading", { name: "Hasil Laporan" })
      .locator("..")
      .getByText(/^Total \d+ pengajuan$/)
      .first()
      .textContent()
      .catch(() => "")) || "";
  return parseCountFromText(text, /Total\s+(\d+)\s+pengajuan/i);
};

const getApprovedDataRowCount = async (page: Page): Promise<number> => {
  return countTableRowsIgnoringEmptyState(page.locator("table tbody tr"), ["tidak ada data"]);
};

const getReportDataRowCount = async (page: Page): Promise<number> => {
  return countTableRowsIgnoringEmptyState(page.locator("table tbody tr"), ["tidak ada data laporan"]);
};

const clickApprovedCategoryTab = async (
  page: Page,
  label: "Semua Permohonan" | "Izin/Cuti Reguler" | "Izin Terlambat" | "Izin Pulang Cepat",
) => {
  await page.getByRole("tab", { name: new RegExp(`^${label}\\s*\\(`, "i") }).click();
};

const getReportFilterPanel = (page: Page): Locator =>
  getFilterPanelByPlaceholder(page, "Cari nama, NIP, alasan, jenis, status...");

const selectReportStatus = async (
  page: Page,
  option: "Semua status" | "Menunggu" | "Disetujui" | "Ditolak",
) => {
  const panel = getReportFilterPanel(page);
  await selectPanelComboboxOption(page, panel, 0, option);
};

const selectReportCategory = async (
  page: Page,
  option: "Semua Permohonan" | "Izin/Cuti Reguler" | "Izin Terlambat" | "Izin Pulang Cepat",
) => {
  const panel = getReportFilterPanel(page);
  await selectPanelComboboxOption(page, panel, 2, option);
};

const fillReportSearch = async (page: Page, text: string) => {
  const panel = getReportFilterPanel(page);
  await panel.getByPlaceholder("Cari nama, NIP, alasan, jenis, status...").fill(text);
};

test.describe.serial("Org Leave Approved + Report Category Sync", () => {
  test.skip(
    !process.env.E2E_ORG_LEAVE_APPROVED_REPORT_SYNC,
    "Set E2E_ORG_LEAVE_APPROVED_REPORT_SYNC=1 untuk menjalankan test ini.",
  );

  test("kategori approved sinkron dengan laporan permohonan", async ({ page }) => {
    test.setTimeout(240_000);

    const missingEnvKeys = await getMissingSupabaseTestEnvKeys({
      SUPABASE_URL: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
      SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
      SUPABASE_ANON_KEY: ["VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
    });
    test.skip(
      missingEnvKeys.length > 0,
      `Supabase test client env belum lengkap: ${missingEnvKeys.join(", ")}`,
    );

    const serviceClient = await createSupabaseServiceTestClient();
    test.skip(!serviceClient, "Supabase service test client tidak bisa dibuat dari env yang tersedia.");

    const anonClient = await createSupabaseAnonTestClient();
    test.skip(!anonClient, "Supabase anon test client tidak bisa dibuat dari env yang tersedia.");

    const orgAdminCreds = await getRoleCredsWithFallback(["org_admin", "org_admin_centralized"]);
    test.skip(!orgAdminCreds, "Kredensial org admin belum tersedia.");

    const context = await resolveEmployeeContext(serviceClient!, anonClient!, orgAdminCreds!);
    test.skip(!context, "Konteks employee org admin tidak ditemukan.");

    const token = `SYNC-${Date.now()}`;
    const createdIds: string[] = [];
    const expected = {
      lateApproved: 3,
      earlyApproved: 2,
      regularApproved: 4,
    } as const;
    const expectedAll = expected.lateApproved + expected.earlyApproved + expected.regularApproved;

    const rowsToInsert: Array<{
      employee_id: string;
      start_date: string;
      end_date: string;
      leave_type: "izin";
      reason: string;
      status: "disetujui";
      approved_by: string;
      approved_at: string;
    }> = [];

    for (let i = 0; i < expected.lateApproved; i += 1) {
      const date = getYmdPlusDays(1 + i);
      rowsToInsert.push({
        employee_id: context!.id,
        start_date: date,
        end_date: date,
        leave_type: "izin",
        reason: buildLateReason(token, i),
        status: "disetujui",
        approved_by: context!.id,
        approved_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < expected.earlyApproved; i += 1) {
      const date = getYmdPlusDays(40 + i);
      rowsToInsert.push({
        employee_id: context!.id,
        start_date: date,
        end_date: date,
        leave_type: "izin",
        reason: buildEarlyReason(token, i),
        status: "disetujui",
        approved_by: context!.id,
        approved_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < expected.regularApproved; i += 1) {
      const date = getYmdPlusDays(70 + i);
      rowsToInsert.push({
        employee_id: context!.id,
        start_date: date,
        end_date: date,
        leave_type: "izin",
        reason: buildRegularReason(token, i),
        status: "disetujui",
        approved_by: context!.id,
        approved_at: new Date().toISOString(),
      });
    }

    try {
      const { data: insertedRows, error: insertError } = await serviceClient!
        .from("leave_requests")
        .insert(rowsToInsert)
        .select("id");
      if (insertError) throw insertError;
      createdIds.push(...(insertedRows || []).map((row) => row.id));

      await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);

      await page.goto("/org/leave/approved", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Izin/Cuti Disetujui", exact: true })).toBeVisible();
      await page.getByPlaceholder("Cari...").fill(token);

      await clickApprovedCategoryTab(page, "Semua Permohonan");
      await expect
        .poll(() => getTotalApprovedFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expectedAll);
      await expect
        .poll(() => getApprovedDataRowCount(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expectedAll);

      await clickApprovedCategoryTab(page, "Izin Terlambat");
      await expect
        .poll(() => getTotalApprovedFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.lateApproved);
      await expect
        .poll(() => getApprovedDataRowCount(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.lateApproved);

      await clickApprovedCategoryTab(page, "Izin Pulang Cepat");
      await expect
        .poll(() => getTotalApprovedFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.earlyApproved);

      await clickApprovedCategoryTab(page, "Izin/Cuti Reguler");
      await expect
        .poll(() => getTotalApprovedFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.regularApproved);

      await page.goto("/org/reports/leave", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Laporan Izin/Cuti", exact: true })).toBeVisible();
      await fillReportSearch(page, token);
      await selectReportStatus(page, "Disetujui");

      await selectReportCategory(page, "Izin Terlambat");
      await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
      await expect
        .poll(() => getTotalReportFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.lateApproved);
      await expect
        .poll(() => getReportDataRowCount(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.lateApproved);

      await selectReportCategory(page, "Izin Pulang Cepat");
      await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
      await expect
        .poll(() => getTotalReportFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.earlyApproved);

      await selectReportCategory(page, "Izin/Cuti Reguler");
      await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
      await expect
        .poll(() => getTotalReportFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.regularApproved);
    } finally {
      if (createdIds.length > 0) {
        await serviceClient!.from("leave_requests").delete().in("id", createdIds);
      }
    }
  });
});
