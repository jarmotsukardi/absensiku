import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";

export const ORG_MASTER_DATA_MODULES_SETTING_KEY = "org_master_data_modules_v1";
export const ORG_MASTER_DATA_MODULES_UPDATED_EVENT = "org-master-data-modules-updated";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

export type OrgMasterDataModuleKey =
  | "opd_admins"
  | "positions"
  | "employee_categories"
  | "employee_golongan";

export interface OrgMasterDataModules {
  opd_admins: boolean;
  positions: boolean;
  employee_categories: boolean;
  employee_golongan: boolean;
}

export const DEFAULT_ORG_MASTER_DATA_MODULES: OrgMasterDataModules = {
  opd_admins: false,
  positions: false,
  employee_categories: false,
  employee_golongan: false,
};

const ORG_MASTER_DATA_MODULE_KEYS: OrgMasterDataModuleKey[] = [
  "opd_admins",
  "positions",
  "employee_categories",
  "employee_golongan",
];

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

const normalizeModules = (value: unknown): OrgMasterDataModules => {
  const root = isJsonObject(value) ? value : {};
  const source = isJsonObject(root.modules) ? root.modules : root;
  return {
    opd_admins: normalizeBoolean(source.opd_admins, DEFAULT_ORG_MASTER_DATA_MODULES.opd_admins),
    positions: normalizeBoolean(source.positions, DEFAULT_ORG_MASTER_DATA_MODULES.positions),
    employee_categories: normalizeBoolean(
      source.employee_categories,
      DEFAULT_ORG_MASTER_DATA_MODULES.employee_categories
    ),
    employee_golongan: normalizeBoolean(
      source.employee_golongan,
      DEFAULT_ORG_MASTER_DATA_MODULES.employee_golongan
    ),
  };
};

export const parseOrgMasterDataModulesSetting = (value: unknown): OrgMasterDataModules =>
  normalizeModules(value);

const buildSettingValue = (modules: OrgMasterDataModules) => ({
  version: 1,
  modules: ORG_MASTER_DATA_MODULE_KEYS.reduce<Record<OrgMasterDataModuleKey, boolean>>((acc, key) => {
    acc[key] = modules[key];
    return acc;
  }, {} as Record<OrgMasterDataModuleKey, boolean>),
});

export interface OrgMasterDataModuleOption {
  key: OrgMasterDataModuleKey;
  label: string;
  description: string;
  path: string;
}

export const ORG_MASTER_DATA_MODULE_OPTIONS: OrgMasterDataModuleOption[] = [
  {
    key: "opd_admins",
    label: "Admin OPD",
    description: "Kelola admin per OPD untuk approval dan akses operasional.",
    path: "/org/master/opd-admins",
  },
  {
    key: "positions",
    label: "Jabatan",
    description: "Kelola daftar jabatan yang dipakai pada data pegawai.",
    path: "/org/master/positions",
  },
  {
    key: "employee_categories",
    label: "Kategori Pegawai",
    description: "Kelola pilihan kategori pegawai (contoh: ASN, P3K).",
    path: "/org/master/employee-categories",
  },
  {
    key: "employee_golongan",
    label: "Golongan Pegawai",
    description: "Kelola pilihan golongan yang dipakai pada data pegawai.",
    path: "/org/master/employee-golongan",
  },
];

export const ORG_MASTER_DATA_MODULE_PATH_MAP: Record<string, OrgMasterDataModuleKey> = {
  "/org/master/opd-admins": "opd_admins",
  "/org/master/positions": "positions",
  "/org/master/employee-categories": "employee_categories",
  "/org/master/employee-golongan": "employee_golongan",
};

export function emitOrgMasterDataModulesUpdated(modules: OrgMasterDataModules): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OrgMasterDataModules>(ORG_MASTER_DATA_MODULES_UPDATED_EVENT, {
      detail: normalizeModules(modules),
    })
  );
}

export async function fetchTenantOrgMasterDataModules(
  tenantId: string
): Promise<{ settingId: string | null; modules: OrgMasterDataModules }> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_MASTER_DATA_MODULES_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengaturan modul master data timeout."
  );

  if (error && error.code !== "PGRST116") throw error;

  return {
    settingId: data?.id ?? null,
    modules: parseOrgMasterDataModulesSetting(data?.setting_value),
  };
}

export async function saveTenantOrgMasterDataModules(
  tenantId: string,
  modules: OrgMasterDataModules
): Promise<OrgMasterDataModules> {
  const normalized = normalizeModules(modules);
  const settingValue = buildSettingValue(normalized);

  const { data: existing, error: existingError } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_MASTER_DATA_MODULES_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengecekan pengaturan modul master data timeout."
  );
  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { error: updateError } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: settingValue,
            description: "Status aktif/nonaktif submenu modul master data organisasi.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan pengaturan modul master data timeout."
    );
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await withTimeout(
      () =>
        supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: ORG_MASTER_DATA_MODULES_SETTING_KEY,
          setting_value: settingValue,
          description: "Status aktif/nonaktif submenu modul master data organisasi.",
        }),
      WRITE_TIMEOUT_MS,
      "Tambah pengaturan modul master data timeout."
    );
    if (insertError) throw insertError;
  }

  return normalized;
}
