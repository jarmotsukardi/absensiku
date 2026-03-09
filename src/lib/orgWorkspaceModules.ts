import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";

export const ORG_WORKSPACE_MODULES_SETTING_KEY = "org_workspace_modules_v1";
export const ORG_WORKSPACE_MODULES_UPDATED_EVENT = "org-workspace-modules-updated";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

export type OrgWorkspaceModuleKey = "hr" | "payroll";

export interface OrgWorkspaceModules {
  hr: boolean;
  payroll: boolean;
}

export const DEFAULT_ORG_WORKSPACE_MODULES: OrgWorkspaceModules = {
  hr: false,
  payroll: false,
};

const ORG_WORKSPACE_MODULE_KEYS: OrgWorkspaceModuleKey[] = ["hr", "payroll"];

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return fallback;
};

const normalizeModules = (value: unknown): OrgWorkspaceModules => {
  const root = isJsonObject(value) ? value : {};
  const source = isJsonObject(root.modules) ? root.modules : root;
  return {
    hr: normalizeBoolean(source.hr, DEFAULT_ORG_WORKSPACE_MODULES.hr),
    payroll: normalizeBoolean(source.payroll, DEFAULT_ORG_WORKSPACE_MODULES.payroll),
  };
};

export const parseOrgWorkspaceModulesSetting = (value: unknown): OrgWorkspaceModules =>
  normalizeModules(value);

const buildSettingValue = (modules: OrgWorkspaceModules) => ({
  version: 1,
  modules: ORG_WORKSPACE_MODULE_KEYS.reduce<Record<OrgWorkspaceModuleKey, boolean>>((acc, key) => {
    acc[key] = modules[key];
    return acc;
  }, {} as Record<OrgWorkspaceModuleKey, boolean>),
});

export function emitOrgWorkspaceModulesUpdated(modules: OrgWorkspaceModules): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OrgWorkspaceModules>(ORG_WORKSPACE_MODULES_UPDATED_EVENT, {
      detail: normalizeModules(modules),
    })
  );
}

export async function fetchTenantOrgWorkspaceModules(
  tenantId: string
): Promise<{ settingId: string | null; modules: OrgWorkspaceModules }> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_WORKSPACE_MODULES_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengaturan modul workspace timeout."
  );

  if (error && error.code !== "PGRST116") throw error;

  return {
    settingId: data?.id ?? null,
    modules: parseOrgWorkspaceModulesSetting(data?.setting_value),
  };
}

export async function saveTenantOrgWorkspaceModules(
  tenantId: string,
  modules: OrgWorkspaceModules
): Promise<OrgWorkspaceModules> {
  const normalized = normalizeModules(modules);
  const settingValue = buildSettingValue(normalized);

  const { data: existing, error: existingError } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_WORKSPACE_MODULES_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengecekan pengaturan modul workspace timeout."
  );
  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { error: updateError } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: settingValue,
            description: "Status aktif/nonaktif workspace HR dan Payroll organisasi.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan pengaturan modul workspace timeout."
    );
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await withTimeout(
      () =>
        supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: ORG_WORKSPACE_MODULES_SETTING_KEY,
          setting_value: settingValue,
          description: "Status aktif/nonaktif workspace HR dan Payroll organisasi.",
        }),
      WRITE_TIMEOUT_MS,
      "Tambah pengaturan modul workspace timeout."
    );
    if (insertError) throw insertError;
  }

  return normalized;
}
