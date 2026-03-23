import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { withTimeout } from "@/lib/attendanceResilience";

export const EMPLOYEE_GOLONGAN_SETTING_KEY = "employee_golongan_master";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;
const DEFAULT_GOLONGAN_NAMES = [
  "I/a",
  "I/b",
  "I/c",
  "I/d",
  "II/a",
  "II/b",
  "II/c",
  "II/d",
  "III/a",
  "III/b",
  "III/c",
  "III/d",
  "IV/a",
  "IV/b",
  "IV/c",
  "IV/d",
  "IV/e",
] as const;

export interface EmployeeGolonganOption {
  value: string;
  label: string;
}

export const DEFAULT_EMPLOYEE_GOLONGAN_OPTIONS: EmployeeGolonganOption[] = DEFAULT_GOLONGAN_NAMES.map((name) => ({
  value: name,
  label: name,
}));

export interface EmployeeGolonganMasterItem {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeName = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return fallback;
};

const normalizeSortOrder = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
};

const buildGolonganId = (name: string, index: number): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "golongan"}-${index + 1}`;
};

const buildDefaultGolongan = (): EmployeeGolonganMasterItem[] =>
  DEFAULT_GOLONGAN_NAMES.map((name, index) => ({
    id: `default-${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    is_active: true,
    sort_order: index + 1,
  }));

const normalizeFromRawList = (rawList: unknown[]): EmployeeGolonganMasterItem[] => {
  const parsed = rawList
    .map((entry, index): EmployeeGolonganMasterItem | null => {
      if (typeof entry === "string") {
        const name = normalizeName(entry);
        if (!name) return null;
        return {
          id: buildGolonganId(name, index),
          name,
          is_active: true,
          sort_order: index + 1,
        };
      }

      if (!isJsonObject(entry)) return null;
      const name = normalizeName(entry.name ?? entry.label ?? entry.value);
      if (!name) return null;
      return {
        id: normalizeName(entry.id) || buildGolonganId(name, index),
        name,
        is_active: normalizeBoolean(entry.is_active ?? entry.active, true),
        sort_order: normalizeSortOrder(entry.sort_order ?? entry.order, index + 1),
      };
    })
    .filter((item): item is EmployeeGolonganMasterItem => Boolean(item));

  return normalizeEmployeeGolongan(parsed);
};

export const normalizeEmployeeGolongan = (
  input: EmployeeGolonganMasterItem[]
): EmployeeGolonganMasterItem[] => {
  const deduped = new Map<string, EmployeeGolonganMasterItem>();

  input
    .map((item, index) => {
      const name = normalizeName(item.name);
      if (!name) return null;
      return {
        id: normalizeName(item.id) || buildGolonganId(name, index),
        name,
        is_active: Boolean(item.is_active),
        sort_order: normalizeSortOrder(item.sort_order, index + 1),
      };
    })
    .filter((item): item is EmployeeGolonganMasterItem => Boolean(item))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .forEach((item) => {
      const key = item.name.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    });

  const normalized = Array.from(deduped.values()).map((item, index) => ({
    ...item,
    sort_order: index + 1,
  }));

  return normalized.length > 0 ? normalized : buildDefaultGolongan();
};

export const parseEmployeeGolonganSetting = (value: Json | null | undefined): EmployeeGolonganMasterItem[] => {
  if (Array.isArray(value)) {
    return normalizeFromRawList(value);
  }

  if (isJsonObject(value) && Array.isArray(value.golongan)) {
    return normalizeFromRawList(value.golongan);
  }

  return buildDefaultGolongan();
};

export const getActiveEmployeeGolonganOptions = (
  golongan: EmployeeGolonganMasterItem[]
): EmployeeGolonganOption[] =>
  golongan
    .filter((item) => item.is_active)
    .map((item) => ({ value: item.name, label: item.name }));

const buildSettingValue = (golongan: EmployeeGolonganMasterItem[]) => ({
  version: 1,
  golongan: golongan.map((item) => ({
    id: item.id,
    name: item.name,
    is_active: item.is_active,
    sort_order: item.sort_order,
  })),
});

export async function fetchTenantEmployeeGolongan(
  tenantId: string
): Promise<{ settingId: string | null; golongan: EmployeeGolonganMasterItem[] }> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", EMPLOYEE_GOLONGAN_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan master golongan pegawai timeout."
  );

  if (error && error.code !== "PGRST116") throw error;

  return {
    settingId: data?.id ?? null,
    golongan: parseEmployeeGolonganSetting(data?.setting_value),
  };
}

export async function saveTenantEmployeeGolongan(
  tenantId: string,
  golongan: EmployeeGolonganMasterItem[]
): Promise<EmployeeGolonganMasterItem[]> {
  const normalized = normalizeEmployeeGolongan(golongan);
  const settingValue = buildSettingValue(normalized);

  const { data: existing, error: existingError } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", EMPLOYEE_GOLONGAN_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengecekan master golongan pegawai timeout."
  );
  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { error: updateError } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: settingValue,
            updated_at: new Date().toISOString(),
            description: "Master data golongan pegawai per organisasi.",
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan master golongan pegawai timeout."
    );
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await withTimeout(
      () =>
        supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: EMPLOYEE_GOLONGAN_SETTING_KEY,
          setting_value: settingValue,
          description: "Master data golongan pegawai per organisasi.",
        }),
      WRITE_TIMEOUT_MS,
      "Tambah master golongan pegawai timeout."
    );
    if (insertError) throw insertError;
  }

  return normalized;
}
