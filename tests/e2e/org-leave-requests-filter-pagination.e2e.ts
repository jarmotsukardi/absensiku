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
    "ETA: 09:45",
    `ALASAN: E2E-LEAVE-FILTER ${token}-LATE-${String(index).padStart(2, "0")}`,
  ].join("\n");

const buildEarlyReason = (token: string, index: number): string =>
  [
    EARLY_LEAVE_PERMISSION_REASON_PREFIX,
    "JAM_PULANG: 15:30",
    `ALASAN: E2E-LEAVE-FILTER ${token}-EARLY-${String(index).padStart(2, "0")}`,
  ].join("\n");

const buildRegularReason = (token: string, index: number): string =>
  `E2E-LEAVE-FILTER ${token}-REG-${String(index).padStart(2, "0")}`;

const dismissHardRequestDialogIfPresent = async (page: Page) => {
  const closeButton = page.getByRole("button", { name: "Saya Mengerti" }).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await expect(closeButton).not.toBeVisible({ timeout: 10_000 });
  }
};

const getFilterPanel = (page: Page): Locator =>
  getFilterPanelByPlaceholder(page, "Cari permohonan...");

const selectStatus = async (page: Page, option: "Menunggu" | "Disetujui" | "Ditolak" | "Semua Status") => {
  const panel = getFilterPanel(page);
  await selectPanelComboboxOption(page, panel, 0, option);
};

const selectCategory = async (
  page: Page,
  option: "Semua Permohonan" | "Izin/Cuti Reguler" | "Izin Terlambat" | "Izin Pulang Cepat",
) => {
  const panel = getFilterPanel(page);
  await selectPanelComboboxOption(page, panel, 1, option);
};

const getTotalRequestsFromUi = async (page: Page): Promise<number> => {
  const text = (await page.getByText(/^Total \d+ permohonan$/).first().textContent().catch(() => "")) || "";
  return parseCountFromText(text, /Total\s+(\d+)\s+permohonan/i);
};

const getDataRowCountFromUi = async (page: Page): Promise<number> => {
  return countTableRowsIgnoringEmptyState(page.locator("table tbody tr"), ["tidak ada permohonan"]);
};

test.describe.serial("Org Leave Requests - Filter + Search + Pagination", () => {
  test.skip(
    !process.env.E2E_ORG_LEAVE_FILTER_PAGINATION,
    "Set E2E_ORG_LEAVE_FILTER_PAGINATION=1 untuk menjalankan test ini.",
  );

  test("sinkron status+kategori+search+pagination", async ({ page }) => {
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

    const token = `E2E-ORG-LEAVE-${Date.now()}`;
    const createdIds: string[] = [];

    const expected = {
      latePending: 23,
      lateApproved: 2,
      earlyPending: 3,
      regularPending: 4,
    } as const;

    const rowsToInsert: Array<{
      employee_id: string;
      start_date: string;
      end_date: string;
      leave_type: "izin";
      reason: string;
      status: "menunggu" | "disetujui";
      approved_by?: string;
      approved_at?: string;
    }> = [];

    for (let i = 0; i < expected.latePending; i += 1) {
      const date = getYmdPlusDays(1 + i);
      rowsToInsert.push({
        employee_id: context!.id,
        start_date: date,
        end_date: date,
        leave_type: "izin",
        reason: buildLateReason(token, i),
        status: "menunggu",
      });
    }
    for (let i = 0; i < expected.lateApproved; i += 1) {
      const date = getYmdPlusDays(50 + i);
      rowsToInsert.push({
        employee_id: context!.id,
        start_date: date,
        end_date: date,
        leave_type: "izin",
        reason: buildLateReason(`${token}-APPROVED`, i),
        status: "disetujui",
        approved_by: context!.id,
        approved_at: new Date().toISOString(),
      });
    }
    for (let i = 0; i < expected.earlyPending; i += 1) {
      const date = getYmdPlusDays(80 + i);
      rowsToInsert.push({
        employee_id: context!.id,
        start_date: date,
        end_date: date,
        leave_type: "izin",
        reason: buildEarlyReason(token, i),
        status: "menunggu",
      });
    }
    for (let i = 0; i < expected.regularPending; i += 1) {
      const date = getYmdPlusDays(110 + i);
      rowsToInsert.push({
        employee_id: context!.id,
        start_date: date,
        end_date: date,
        leave_type: "izin",
        reason: buildRegularReason(token, i),
        status: "menunggu",
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
      await page.goto("/org/leave/requests", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await dismissHardRequestDialogIfPresent(page);
      await expect(page.getByRole("heading", { name: "Permohonan Cuti", exact: true })).toBeVisible();

      const searchInput = page.getByPlaceholder("Cari permohonan...");
      await searchInput.fill(token);

      await selectStatus(page, "Menunggu");
      await selectCategory(page, "Izin Terlambat");

      await expect
        .poll(() => getTotalRequestsFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.latePending);
      await expect
        .poll(() => getDataRowCountFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(20);

      const nextPageButton = page.getByLabel("Go to next page");
      await expect(nextPageButton).toBeVisible();
      await nextPageButton.click();
      await expect
        .poll(() => getDataRowCountFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.latePending - 20);

      await selectStatus(page, "Disetujui");
      await expect
        .poll(() => getTotalRequestsFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.lateApproved);
      await expect
        .poll(() => getDataRowCountFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.lateApproved);

      await selectStatus(page, "Menunggu");
      await selectCategory(page, "Izin Pulang Cepat");
      await expect
        .poll(() => getTotalRequestsFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.earlyPending);

      await selectCategory(page, "Izin/Cuti Reguler");
      await expect
        .poll(() => getTotalRequestsFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(expected.regularPending);

      await searchInput.fill(`${token}-REG-00`);
      await expect
        .poll(() => getTotalRequestsFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(1);
      await expect
        .poll(() => getDataRowCountFromUi(page), { timeout: 20_000, intervals: [500, 1000, 1500] })
        .toBe(1);
      await expect(page.locator("table tbody tr").first()).toContainText(`${token}-REG-00`);
    } finally {
      if (createdIds.length > 0) {
        await serviceClient!.from("leave_requests").delete().in("id", createdIds);
      }
    }
  });
});
