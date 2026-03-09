import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";
import {
  parsePayrollIntegrationSettings,
  type PayrollIntegrationSettings,
} from "@/lib/payrollIntegrationSettingsCore";

export {
  DEFAULT_PAYROLL_INTEGRATION_SETTINGS,
  parsePayrollIntegrationSettings,
  type PayrollIntegrationSettings,
  type PayrollAttendanceSource,
  type PayrollAccountingProvider,
  type PayrollBankFormat,
} from "@/lib/payrollIntegrationSettingsCore";

export const ORG_PAYROLL_INTEGRATIONS_SETTING_KEY = "org_payroll_integrations_v1";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

const buildSettingValue = (settings: PayrollIntegrationSettings) => ({
  version: 1,
  settings,
});

export async function fetchTenantPayrollIntegrations(
  tenantId: string,
): Promise<{ settingId: string | null; settings: PayrollIntegrationSettings }> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_PAYROLL_INTEGRATIONS_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan konfigurasi integrasi payroll timeout.",
  );

  if (error && error.code !== "PGRST116") throw error;

  return {
    settingId: data?.id ?? null,
    settings: parsePayrollIntegrationSettings(data?.setting_value),
  };
}

export async function saveTenantPayrollIntegrations(
  tenantId: string,
  settings: PayrollIntegrationSettings,
): Promise<PayrollIntegrationSettings> {
  const normalized = parsePayrollIntegrationSettings(settings);
  const settingValue = buildSettingValue(normalized);

  const { data: existing, error: existingError } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_PAYROLL_INTEGRATIONS_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan cek konfigurasi integrasi payroll timeout.",
  );
  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { error: updateError } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: settingValue,
            description: "Konfigurasi integrasi payroll (absensi, akuntansi, payout, webhook).",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan konfigurasi integrasi payroll timeout.",
    );
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await withTimeout(
      () =>
        supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: ORG_PAYROLL_INTEGRATIONS_SETTING_KEY,
          setting_value: settingValue,
          description: "Konfigurasi integrasi payroll (absensi, akuntansi, payout, webhook).",
        }),
      WRITE_TIMEOUT_MS,
      "Tambah konfigurasi integrasi payroll timeout.",
    );
    if (insertError) throw insertError;
  }

  return normalized;
}
