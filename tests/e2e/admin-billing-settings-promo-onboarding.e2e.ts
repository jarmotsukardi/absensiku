import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryLoginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";
import { createSupabaseServiceTestClient } from "./helpers/supabaseTestEnv";

type AttendanceIntroPromoSetting = {
  active?: boolean;
  promo_price_per_month?: number;
  promo_duration_months?: number;
  label?: string | null;
  new_tenants_only?: boolean;
};

const SETTING_KEY = "attendance_intro_promo";

const toSettingRecord = (value: unknown): AttendanceIntroPromoSetting => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as AttendanceIntroPromoSetting;
};

const readAttendanceIntroPromoSetting = async (client: SupabaseClient) => {
  const { data, error } = await client
    .from("billing_settings")
    .select("id, setting_key, setting_value")
    .eq("setting_key", SETTING_KEY)
    .single();

  if (error) throw error;
  return data;
};

const updateAttendanceIntroPromoSetting = async (
  client: SupabaseClient,
  value: AttendanceIntroPromoSetting,
) => {
  const { error } = await client
    .from("billing_settings")
    .update({
      setting_value: value,
      updated_at: new Date().toISOString(),
    })
    .eq("setting_key", SETTING_KEY);

  if (error) throw error;
};

const serializeAttendanceIntroPromoSetting = (value: AttendanceIntroPromoSetting) =>
  JSON.stringify({
    active: value.active === true,
    promo_price_per_month: Number(value.promo_price_per_month || 0),
    promo_duration_months: Number(value.promo_duration_months || 0),
    label: value.label || null,
    new_tenants_only: value.new_tenants_only === true,
  });

const restoreAttendanceIntroPromoSetting = async (
  client: SupabaseClient,
  originalSetting: AttendanceIntroPromoSetting,
) => {
  await updateAttendanceIntroPromoSetting(client, {
    active: originalSetting.active ?? false,
    promo_price_per_month: Number(originalSetting.promo_price_per_month || 5000),
    promo_duration_months: Number(originalSetting.promo_duration_months || 2),
    label: originalSetting.label ?? null,
    new_tenants_only: originalSetting.new_tenants_only ?? true,
  });
};

const openBillingSettingsPage = async (page: Page) => {
  await page.goto("/admin/billing?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page.getByTestId("billing-attendance-intro-promo-card")).toBeVisible();
  await expect(page.getByText("Promo Onboarding Absensi", { exact: true })).toBeVisible();
};

test.describe.serial("Admin Billing Settings Promo Onboarding", () => {
  test("superadmin dapat mengubah promo onboarding absensi 1/2/3 bulan dan nilai tersimpan", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const serviceClient = await createSupabaseServiceTestClient();
    test.skip(!serviceClient, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk snapshot/restore billing settings.");

    const originalSettingRow = await readAttendanceIntroPromoSetting(serviceClient!);
    const originalSetting = toSettingRecord(originalSettingRow.setting_value);

    const loginAttempt = await tryLoginAsSuperadmin(page);
    test.skip(loginAttempt.skipped, "Kredensial superadmin belum diisi di ops/test-accounts.local.json");
    test.skip(loginAttempt.twoFactorRequired, "Login superadmin berhenti di verifikasi 2FA");

    const targetSetting: AttendanceIntroPromoSetting = {
      active: true,
      promo_price_per_month: 5200,
      promo_duration_months: 3,
      label: "Promo onboarding 3 bulan pertama",
      new_tenants_only: originalSetting.new_tenants_only ?? true,
    };

    try {
      await openBillingSettingsPage(page);

      const promoSwitch = page.getByTestId("billing-attendance-intro-promo-active");
      const promoEnabled = (await promoSwitch.getAttribute("aria-checked")) === "true";
      if (!promoEnabled) {
        await promoSwitch.click();
      }

      const promoPriceInput = page.getByTestId("billing-attendance-intro-promo-price");
      await promoPriceInput.fill(String(targetSetting.promo_price_per_month));

      await page.getByTestId("billing-attendance-intro-promo-duration").click();
      await page.getByRole("option", { name: "3 bulan pertama", exact: true }).click();

      const promoLabelInput = page.getByTestId("billing-attendance-intro-promo-label");
      await expect(promoLabelInput).toHaveValue(targetSetting.label!);

      const preview = page.getByTestId("billing-attendance-intro-promo-preview");
      await expect(preview).toContainText(/Promo onboarding 3 bulan pertama/);
      await expect(preview).toContainText(/Rp\s*5\.200\/pegawai\/bulan/);

      const summaryThreeMonths = page.getByTestId("billing-attendance-intro-promo-summary-3");
      await expect(summaryThreeMonths).toContainText("Paket 3 bulan");
      await expect(summaryThreeMonths).toContainText("Promo terpakai: 3 bulan");
      await expect(summaryThreeMonths).toContainText(/Rata-rata:\s*Rp\s*5\.200\/bulan/);

      await page.getByTestId("billing-settings-save").click();
      await expect(page.getByText("Pengaturan billing berhasil disimpan", { exact: true })).toBeVisible({
        timeout: 20_000,
      });

      await expect
        .poll(
          async () => {
            const row = await readAttendanceIntroPromoSetting(serviceClient!);
            return serializeAttendanceIntroPromoSetting(toSettingRecord(row.setting_value));
          },
          { timeout: 20_000, intervals: [500, 1_000, 2_000] },
        )
        .toBe(serializeAttendanceIntroPromoSetting(targetSetting));

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByTestId("billing-attendance-intro-promo-price")).toHaveValue("5200");
      await expect(page.getByTestId("billing-attendance-intro-promo-label")).toHaveValue(
        "Promo onboarding 3 bulan pertama",
      );
      await expect(page.getByTestId("billing-attendance-intro-promo-preview")).toContainText(
        /Promo onboarding 3 bulan pertama/,
      );
    } finally {
      await restoreAttendanceIntroPromoSetting(serviceClient!, originalSetting);
    }
  });

  test("promo onboarding invalid tertahan dan setting remote tidak berubah", async ({ page }) => {
    test.setTimeout(120_000);

    const serviceClient = await createSupabaseServiceTestClient();
    test.skip(!serviceClient, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk snapshot/restore billing settings.");

    const originalSettingRow = await readAttendanceIntroPromoSetting(serviceClient!);
    const originalSetting = toSettingRecord(originalSettingRow.setting_value);
    const originalSerializedSetting = serializeAttendanceIntroPromoSetting(originalSetting);

    const loginAttempt = await tryLoginAsSuperadmin(page);
    test.skip(loginAttempt.skipped, "Kredensial superadmin belum diisi di ops/test-accounts.local.json");
    test.skip(loginAttempt.twoFactorRequired, "Login superadmin berhenti di verifikasi 2FA");

    try {
      await openBillingSettingsPage(page);

      const promoSwitch = page.getByTestId("billing-attendance-intro-promo-active");
      if ((await promoSwitch.getAttribute("aria-checked")) !== "true") {
        await promoSwitch.click();
      }

      const promoPriceInput = page.getByTestId("billing-attendance-intro-promo-price");
      await promoPriceInput.fill("7500");

      const validation = page.getByTestId("billing-attendance-intro-promo-validation");
      await expect(validation).toContainText("Harga promo onboarding harus lebih rendah dari harga dasar Absensi.");

      await page.getByTestId("billing-settings-save").click();
      await expect(validation).toBeVisible();
      await expect(page.getByText("Pengaturan billing berhasil disimpan", { exact: true })).toHaveCount(0);

      await expect
        .poll(
          async () => {
            const row = await readAttendanceIntroPromoSetting(serviceClient!);
            return serializeAttendanceIntroPromoSetting(toSettingRecord(row.setting_value));
          },
          { timeout: 5_000, intervals: [500, 1_000] },
        )
        .toBe(originalSerializedSetting);
    } finally {
      await restoreAttendanceIntroPromoSetting(serviceClient!, originalSetting);
    }
  });

  test("superadmin dapat mematikan promo onboarding dan nilai tersimpan", async ({ page }) => {
    test.setTimeout(120_000);

    const serviceClient = await createSupabaseServiceTestClient();
    test.skip(!serviceClient, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk snapshot/restore billing settings.");

    const originalSettingRow = await readAttendanceIntroPromoSetting(serviceClient!);
    const originalSetting = toSettingRecord(originalSettingRow.setting_value);

    const loginAttempt = await tryLoginAsSuperadmin(page);
    test.skip(loginAttempt.skipped, "Kredensial superadmin belum diisi di ops/test-accounts.local.json");
    test.skip(loginAttempt.twoFactorRequired, "Login superadmin berhenti di verifikasi 2FA");

    const targetSetting: AttendanceIntroPromoSetting = {
      ...originalSetting,
      active: false,
    };

    try {
      await openBillingSettingsPage(page);

      const promoSwitch = page.getByTestId("billing-attendance-intro-promo-active");
      if ((await promoSwitch.getAttribute("aria-checked")) === "true") {
        await promoSwitch.click();
      }

      const promoPriceInput = page.getByTestId("billing-attendance-intro-promo-price");
      const promoLabelInput = page.getByTestId("billing-attendance-intro-promo-label");
      await expect(promoPriceInput).toBeDisabled();
      await expect(promoLabelInput).toBeDisabled();
      await expect(page.getByTestId("billing-attendance-intro-promo-preview")).toContainText(
        "Promo onboarding tidak aktif.",
      );

      await page.getByTestId("billing-settings-save").click();
      await expect(page.getByText("Pengaturan billing berhasil disimpan", { exact: true })).toBeVisible({
        timeout: 20_000,
      });

      await expect
        .poll(
          async () => {
            const row = await readAttendanceIntroPromoSetting(serviceClient!);
            return serializeAttendanceIntroPromoSetting(toSettingRecord(row.setting_value));
          },
          { timeout: 20_000, intervals: [500, 1_000, 2_000] },
        )
        .toBe(serializeAttendanceIntroPromoSetting(targetSetting));

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByTestId("billing-attendance-intro-promo-active")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(page.getByTestId("billing-attendance-intro-promo-price")).toBeDisabled();
      await expect(page.getByTestId("billing-attendance-intro-promo-preview")).toContainText(
        "Promo onboarding tidak aktif.",
      );
    } finally {
      await restoreAttendanceIntroPromoSetting(serviceClient!, originalSetting);
    }
  });
});
