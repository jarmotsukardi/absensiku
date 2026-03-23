import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { withTimeout } from "@/lib/attendanceResilience";

export const EMPLOYEE_CATEGORIES_SETTING_KEY = "employee_categories_master";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;
const DEFAULT_CATEGORY_NAMES = ["ASN", "P3K"] as const;
export const DEFAULT_EMPLOYEE_CATEGORY_OPTIONS: EmployeeCategoryOption[] = DEFAULT_CATEGORY_NAMES.map((name) => ({
  value: name,
  label: name,
}));

export interface EmployeeCategoryMasterItem {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface EmployeeCategoryOption {
  value: string;
  label: string;
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeCategoryName = (value: unknown): string =>
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

const buildCategoryId = (name: string, index: number): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "category"}-${index + 1}`;
};

const buildDefaultCategories = (): EmployeeCategoryMasterItem[] =>
  DEFAULT_CATEGORY_NAMES.map((name, index) => ({
    id: `default-${index + 1}-${name.toLowerCase()}`,
    name,
    is_active: true,
    sort_order: index + 1,
  }));

const normalizeFromRawList = (rawList: unknown[]): EmployeeCategoryMasterItem[] => {
  const parsed = rawList
    .map((entry, index): EmployeeCategoryMasterItem | null => {
      if (typeof entry === "string") {
        const name = normalizeCategoryName(entry);
        if (!name) return null;
        return {
          id: buildCategoryId(name, index),
          name,
          is_active: true,
          sort_order: index + 1,
        };
      }

      if (!isJsonObject(entry)) return null;
      const name = normalizeCategoryName(entry.name ?? entry.label ?? entry.value);
      if (!name) return null;
      const idValue = normalizeCategoryName(entry.id);
      return {
        id: idValue || buildCategoryId(name, index),
        name,
        is_active: normalizeBoolean(entry.is_active ?? entry.active, true),
        sort_order: normalizeSortOrder(entry.sort_order ?? entry.order, index + 1),
      };
    })
    .filter((item): item is EmployeeCategoryMasterItem => Boolean(item));

  return normalizeEmployeeCategories(parsed);
};

export const normalizeEmployeeCategories = (
  input: EmployeeCategoryMasterItem[]
): EmployeeCategoryMasterItem[] => {
  const deduped = new Map<string, EmployeeCategoryMasterItem>();

  input
    .map((item, index) => {
      const name = normalizeCategoryName(item.name);
      if (!name) return null;
      return {
        id: normalizeCategoryName(item.id) || buildCategoryId(name, index),
        name,
        is_active: Boolean(item.is_active),
        sort_order: normalizeSortOrder(item.sort_order, index + 1),
      };
    })
    .filter((item): item is EmployeeCategoryMasterItem => Boolean(item))
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

  return normalized.length > 0 ? normalized : buildDefaultCategories();
};

export const parseEmployeeCategoriesSetting = (value: Json | null | undefined): EmployeeCategoryMasterItem[] => {
  if (Array.isArray(value)) {
    return normalizeFromRawList(value);
  }

  if (isJsonObject(value) && Array.isArray(value.categories)) {
    return normalizeFromRawList(value.categories);
  }

  return buildDefaultCategories();
};

export const getActiveEmployeeCategoryOptions = (
  categories: EmployeeCategoryMasterItem[]
): EmployeeCategoryOption[] =>
  categories
    .filter((item) => item.is_active)
    .map((item) => ({ value: item.name, label: item.name }));

const buildSettingValue = (categories: EmployeeCategoryMasterItem[]) => ({
  version: 1,
  categories: categories.map((item) => ({
    id: item.id,
    name: item.name,
    is_active: item.is_active,
    sort_order: item.sort_order,
  })),
});

export async function fetchTenantEmployeeCategories(
  tenantId: string
): Promise<{ settingId: string | null; categories: EmployeeCategoryMasterItem[] }> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", EMPLOYEE_CATEGORIES_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan master kategori pegawai timeout."
  );

  if (error && error.code !== "PGRST116") throw error;

  return {
    settingId: data?.id ?? null,
    categories: parseEmployeeCategoriesSetting(data?.setting_value),
  };
}

export async function saveTenantEmployeeCategories(
  tenantId: string,
  categories: EmployeeCategoryMasterItem[]
): Promise<EmployeeCategoryMasterItem[]> {
  const normalized = normalizeEmployeeCategories(categories);
  const settingValue = buildSettingValue(normalized);

  const { data: existing, error: existingError } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", EMPLOYEE_CATEGORIES_SETTING_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengecekan master kategori pegawai timeout."
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
            description: "Master data kategori pegawai per organisasi.",
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan master kategori pegawai timeout."
    );
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await withTimeout(
      () =>
        supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: EMPLOYEE_CATEGORIES_SETTING_KEY,
          setting_value: settingValue,
          description: "Master data kategori pegawai per organisasi.",
        }),
      WRITE_TIMEOUT_MS,
      "Tambah master kategori pegawai timeout."
    );
    if (insertError) throw insertError;
  }

  return normalized;
}
