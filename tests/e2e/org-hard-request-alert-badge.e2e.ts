import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import {
  createSupabaseServiceTestClient,
  getMissingSupabaseTestEnvKeys,
} from "./helpers/supabaseTestEnv";
import { dismissDialogByButtonIfPresent } from "./helpers/uiHelpers";

const ORG_ACCESS_CACHE_KEY = "org_access_cache_v1";
const ORG_ACTIVE_TENANT_STORAGE_KEY = "org_active_tenant_id";

const parseLastInt = (raw: string): number => {
  const numbers = raw.match(/\d+/g);
  if (!numbers || numbers.length === 0) return 0;
  return Number(numbers[numbers.length - 1] || "0");
};

const readAlertButtonCount = async (page: Page): Promise<number> => {
  const button = page.getByRole("button", { name: /Alert Pengajuan/i }).first();
  await expect(button).toBeVisible();
  const text = (await button.textContent()) || "";
  return parseLastInt(text);
};

const readDialogTotalPending = async (page: Page): Promise<number> => {
  const dialog = page.getByRole("dialog");
  const totalText = (await dialog.getByText(/Total pending:/i).first().textContent()) || "";
  return parseLastInt(totalText);
};

const readDialogLeaveCount = async (page: Page): Promise<number> => {
  const dialog = page.getByRole("dialog");
  const leaveCard = dialog.locator("button").filter({ hasText: "Izin/Cuti" }).first();
  await expect(leaveCard).toBeVisible();
  const cardText = (await leaveCard.textContent()) || "";
  return parseLastInt(cardText);
};

const openAlertDialogAndRefresh = async (page: Page) => {
  const triggerButton = page.getByRole("button", { name: /Alert Pengajuan/i }).first();
  await triggerButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Notifikasi Keras Pengajuan/Permohonan" })).toBeVisible();
  const refreshButton = dialog.getByRole("button", { name: "Refresh" });
  await refreshButton.click();
  await expect(refreshButton).toBeEnabled({ timeout: 20_000 });
};

const closeAlertDialog = async (page: Page) => {
  const closeButton = page.getByRole("dialog").getByRole("button", { name: "Saya Mengerti" });
  await closeButton.click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });
};

const resolveTenantIdFromSession = async (page: Page): Promise<string | null> =>
  page.evaluate(
    ({ accessKey, tenantKey }) => {
      try {
        const cachedRaw = sessionStorage.getItem(accessKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw) as { tenantId?: string };
          if (typeof parsed.tenantId === "string" && parsed.tenantId.length > 0) {
            return parsed.tenantId;
          }
        }
      } catch {
        // Ignore parse issues.
      }
      const fallback = sessionStorage.getItem(tenantKey);
      return typeof fallback === "string" && fallback.length > 0 ? fallback : null;
    },
    { accessKey: ORG_ACCESS_CACHE_KEY, tenantKey: ORG_ACTIVE_TENANT_STORAGE_KEY },
  );

const resolveAnyActiveEmployeeId = async (
  serviceClient: SupabaseClient,
  tenantId: string,
): Promise<string | null> => {
  const { data, error } = await serviceClient
    .from("employees")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.id || null;
};

const getYmdPlusDays = (daysFromToday: number): string => {
  const value = new Date();
  value.setDate(value.getDate() + daysFromToday);
  return value.toISOString().slice(0, 10);
};

test.describe.serial("Org Hard Request Alert Badge", () => {
  test.skip(
    !process.env.E2E_ORG_HARD_REQUEST_ALERT,
    "Set E2E_ORG_HARD_REQUEST_ALERT=1 untuk menjalankan test alert badge pengajuan org.",
  );

  test("badge Alert Pengajuan bertambah setelah request baru + refresh", async ({ page }) => {
    test.setTimeout(240_000);

    const missingEnvKeys = await getMissingSupabaseTestEnvKeys({
      SUPABASE_URL: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
      SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    test.skip(
      missingEnvKeys.length > 0,
      `Supabase test client env belum lengkap: ${missingEnvKeys.join(", ")}`,
    );
    const serviceClient = await createSupabaseServiceTestClient();
    test.skip(!serviceClient, "Supabase service test client tidak bisa dibuat dari env yang tersedia.");

    const createdRequestIds: string[] = [];
    try {
      await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
      await page.goto("/org/leave/requests", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await dismissDialogByButtonIfPresent(page, "Saya Mengerti");

      const tenantId = await resolveTenantIdFromSession(page);
      test.skip(!tenantId, "Tenant aktif org admin tidak ditemukan dari session.");

      const employeeId = await resolveAnyActiveEmployeeId(serviceClient!, tenantId!);
      test.skip(!employeeId, "Pegawai aktif untuk tenant org admin tidak ditemukan.");

      await openAlertDialogAndRefresh(page);
      const baselineTotal = await readDialogTotalPending(page);
      const baselineLeave = await readDialogLeaveCount(page);
      await closeAlertDialog(page);

      const token = `E2E-HARD-ALERT-${Date.now()}`;
      const rowsToInsert = [0, 1].map((offset) => {
        const date = getYmdPlusDays(1 + offset);
        return {
          employee_id: employeeId!,
          start_date: date,
          end_date: date,
          leave_type: "izin" as const,
          reason: `${token}-${offset + 1}`,
          status: "menunggu" as const,
        };
      });

      const { data: insertedRows, error: insertError } = await serviceClient!
        .from("leave_requests")
        .insert(rowsToInsert)
        .select("id");
      if (insertError) throw insertError;
      createdRequestIds.push(...(insertedRows || []).map((row) => row.id));
      expect(createdRequestIds.length).toBe(rowsToInsert.length);

      await openAlertDialogAndRefresh(page);

      await expect
        .poll(() => readDialogTotalPending(page), {
          timeout: 20_000,
          intervals: [800, 1200, 1500],
        })
        .toBeGreaterThanOrEqual(baselineTotal + rowsToInsert.length);

      await expect
        .poll(() => readDialogLeaveCount(page), {
          timeout: 20_000,
          intervals: [800, 1200, 1500],
        })
        .toBeGreaterThanOrEqual(baselineLeave + rowsToInsert.length);

      await closeAlertDialog(page);

      await expect
        .poll(() => readAlertButtonCount(page), {
          timeout: 20_000,
          intervals: [800, 1200, 1500],
        })
        .toBeGreaterThanOrEqual(baselineTotal + rowsToInsert.length);
    } finally {
      if (createdRequestIds.length > 0) {
        await serviceClient!.from("leave_requests").delete().in("id", createdRequestIds);
      }
    }
  });
});
