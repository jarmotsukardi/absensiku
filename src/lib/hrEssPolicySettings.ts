import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

export const HR_ESS_POLICY_SETTING_KEY = "hr_ess_policy_v1";

export type HrEssPolicySettings = {
  enableRequestsOverview: boolean;
  enableAttendanceView: boolean;
  enableDocumentsView: boolean;
  enableProfileView: boolean;
  profileEditableContact: boolean;
  attendanceLookbackDays: number;
  documentSource: "Kontrak Kerja" | "Dokumen HR";
};

export const DEFAULT_HR_ESS_POLICY_SETTINGS: HrEssPolicySettings = {
  enableRequestsOverview: true,
  enableAttendanceView: true,
  enableDocumentsView: true,
  enableProfileView: true,
  profileEditableContact: false,
  attendanceLookbackDays: 31,
  documentSource: "Kontrak Kerja",
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const normalizeNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const parseHrEssPolicySettings = (value: unknown): HrEssPolicySettings => {
  const source =
    isObject(value) && isObject(value.settings)
      ? value.settings
      : isObject(value)
        ? value
        : {};

  const documentSourceCandidate = source.documentSource;

  return {
    enableRequestsOverview: normalizeBoolean(
      source.enableRequestsOverview,
      DEFAULT_HR_ESS_POLICY_SETTINGS.enableRequestsOverview,
    ),
    enableAttendanceView: normalizeBoolean(
      source.enableAttendanceView,
      DEFAULT_HR_ESS_POLICY_SETTINGS.enableAttendanceView,
    ),
    enableDocumentsView: normalizeBoolean(
      source.enableDocumentsView,
      DEFAULT_HR_ESS_POLICY_SETTINGS.enableDocumentsView,
    ),
    enableProfileView: normalizeBoolean(
      source.enableProfileView,
      DEFAULT_HR_ESS_POLICY_SETTINGS.enableProfileView,
    ),
    profileEditableContact: normalizeBoolean(
      source.profileEditableContact,
      DEFAULT_HR_ESS_POLICY_SETTINGS.profileEditableContact,
    ),
    attendanceLookbackDays: normalizeNumber(
      source.attendanceLookbackDays,
      DEFAULT_HR_ESS_POLICY_SETTINGS.attendanceLookbackDays,
    ),
    documentSource:
      documentSourceCandidate === "Dokumen HR"
        ? "Dokumen HR"
        : DEFAULT_HR_ESS_POLICY_SETTINGS.documentSource,
  };
};

async function fetchSetting(tenantId: string) {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", HR_ESS_POLICY_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengaturan ESS tenant timeout.",
  );

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function fetchTenantHrEssPolicySettings(tenantId: string): Promise<HrEssPolicySettings> {
  const data = await fetchSetting(tenantId);
  return parseHrEssPolicySettings(data?.setting_value);
}

export async function saveTenantHrEssPolicySettings(tenantId: string, settings: HrEssPolicySettings) {
  const existing = await fetchSetting(tenantId);
  const settingValue = { version: 1, settings };

  if (existing?.id) {
    const { error } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: settingValue,
            description: "Baseline layanan mandiri karyawan tenant untuk domain ESS.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan pengaturan ESS tenant timeout.",
    );
    if (error) throw error;
    return;
  }

  const { error } = await withTimeout(
    () =>
      supabase.from("organization_settings").insert({
        tenant_id: tenantId,
        setting_key: HR_ESS_POLICY_SETTING_KEY,
        setting_value: settingValue,
        description: "Baseline layanan mandiri karyawan tenant untuk domain ESS.",
      }),
    WRITE_TIMEOUT_MS,
    "Tambah pengaturan ESS tenant timeout.",
  );
  if (error) throw error;
}
