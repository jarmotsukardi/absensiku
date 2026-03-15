import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

export const HR_PERFORMANCE_KPI_SETTING_KEY = "hr_performance_kpis_v1";
export const HR_PERFORMANCE_PERIOD_SETTING_KEY = "hr_performance_periods_v1";
export const HR_PERFORMANCE_FORM_SETTING_KEY = "hr_performance_forms_v1";
export const HR_PERFORMANCE_REVIEW360_SETTING_KEY = "hr_performance_review360_v1";

export type HrKpiItem = {
  id: string;
  name: string;
  dimension: string;
  weight: number;
  targetValue: string;
  ownerRole: string;
  isActive: boolean;
  notes: string;
};

export type HrPerformancePeriod = {
  id: string;
  name: string;
  cycle: "monthly" | "quarterly" | "semesterly" | "yearly";
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "closed";
};

export type HrPerformanceForm = {
  id: string;
  name: string;
  targetLevel: string;
  questionCount: number;
  scoringScale: "1-4" | "1-5" | "1-10";
  requireComment: boolean;
  isActive: boolean;
};

export type HrReview360Settings = {
  enabled: boolean;
  anonymousFeedback: boolean;
  selfReviewRequired: boolean;
  minPeerReviewers: number;
  managerWeight: number;
  peerWeight: number;
  subordinateWeight: number;
  selfWeight: number;
};

export const DEFAULT_HR_REVIEW360_SETTINGS: HrReview360Settings = {
  enabled: false,
  anonymousFeedback: true,
  selfReviewRequired: true,
  minPeerReviewers: 2,
  managerWeight: 50,
  peerWeight: 25,
  subordinateWeight: 15,
  selfWeight: 10,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const normalizeNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

export const parseHrKpiItems = (value: unknown): HrKpiItem[] => {
  const source = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.items)
      ? value.items
      : [];

  return source
    .filter((item): item is Record<string, unknown> => isObject(item))
    .map((item, index) => ({
      id: normalizeString(item.id, `kpi-${index}`),
      name: normalizeString(item.name, "KPI"),
      dimension: normalizeString(item.dimension, "Operasional"),
      weight: normalizeNumber(item.weight, 0),
      targetValue: normalizeString(item.targetValue, "-"),
      ownerRole: normalizeString(item.ownerRole, "Admin Instansi"),
      isActive: normalizeBoolean(item.isActive, true),
      notes: normalizeString(item.notes),
    }));
};

export const parseHrPerformancePeriods = (value: unknown): HrPerformancePeriod[] => {
  const source = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.items)
      ? value.items
      : [];

  return source
    .filter((item): item is Record<string, unknown> => isObject(item))
    .map((item, index) => ({
      id: normalizeString(item.id, `period-${index}`),
      name: normalizeString(item.name, "Periode Penilaian"),
      cycle: (["monthly", "quarterly", "semesterly", "yearly"].includes(String(item.cycle))
        ? item.cycle
        : "quarterly") as HrPerformancePeriod["cycle"],
      startDate: normalizeString(item.startDate),
      endDate: normalizeString(item.endDate),
      status: (["draft", "active", "closed"].includes(String(item.status))
        ? item.status
        : "draft") as HrPerformancePeriod["status"],
    }));
};

export const parseHrPerformanceForms = (value: unknown): HrPerformanceForm[] => {
  const source = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.items)
      ? value.items
      : [];

  return source
    .filter((item): item is Record<string, unknown> => isObject(item))
    .map((item, index) => ({
      id: normalizeString(item.id, `form-${index}`),
      name: normalizeString(item.name, "Form Penilaian"),
      targetLevel: normalizeString(item.targetLevel, "Semua Level"),
      questionCount: normalizeNumber(item.questionCount, 5),
      scoringScale: (["1-4", "1-5", "1-10"].includes(String(item.scoringScale))
        ? item.scoringScale
        : "1-5") as HrPerformanceForm["scoringScale"],
      requireComment: normalizeBoolean(item.requireComment, false),
      isActive: normalizeBoolean(item.isActive, true),
    }));
};

export const parseHrReview360Settings = (value: unknown): HrReview360Settings => {
  const source =
    isObject(value) && isObject(value.settings)
      ? value.settings
      : isObject(value)
        ? value
        : {};

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_HR_REVIEW360_SETTINGS.enabled),
    anonymousFeedback: normalizeBoolean(source.anonymousFeedback, DEFAULT_HR_REVIEW360_SETTINGS.anonymousFeedback),
    selfReviewRequired: normalizeBoolean(source.selfReviewRequired, DEFAULT_HR_REVIEW360_SETTINGS.selfReviewRequired),
    minPeerReviewers: normalizeNumber(source.minPeerReviewers, DEFAULT_HR_REVIEW360_SETTINGS.minPeerReviewers),
    managerWeight: normalizeNumber(source.managerWeight, DEFAULT_HR_REVIEW360_SETTINGS.managerWeight),
    peerWeight: normalizeNumber(source.peerWeight, DEFAULT_HR_REVIEW360_SETTINGS.peerWeight),
    subordinateWeight: normalizeNumber(source.subordinateWeight, DEFAULT_HR_REVIEW360_SETTINGS.subordinateWeight),
    selfWeight: normalizeNumber(source.selfWeight, DEFAULT_HR_REVIEW360_SETTINGS.selfWeight),
  };
};

async function fetchSetting(tenantId: string, settingKey: string) {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", settingKey)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan pengaturan kinerja tenant timeout.",
  );

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

async function saveSetting(
  tenantId: string,
  settingKey: string,
  settingValue: unknown,
  description: string,
) {
  const existing = await fetchSetting(tenantId, settingKey);

  if (existing?.id) {
    const { error } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: settingValue,
            description,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan pengaturan kinerja tenant timeout.",
    );
    if (error) throw error;
    return;
  }

  const { error } = await withTimeout(
    () =>
      supabase.from("organization_settings").insert({
        tenant_id: tenantId,
        setting_key: settingKey,
        setting_value: settingValue,
        description,
      }),
    WRITE_TIMEOUT_MS,
    "Tambah pengaturan kinerja tenant timeout.",
  );
  if (error) throw error;
}

export async function fetchTenantHrPerformanceKpis(tenantId: string): Promise<HrKpiItem[]> {
  const data = await fetchSetting(tenantId, HR_PERFORMANCE_KPI_SETTING_KEY);
  return parseHrKpiItems(data?.setting_value);
}

export async function saveTenantHrPerformanceKpis(tenantId: string, items: HrKpiItem[]) {
  await saveSetting(
    tenantId,
    HR_PERFORMANCE_KPI_SETTING_KEY,
    { version: 1, items },
    "Baseline KPI tenant untuk workflow evaluasi kinerja HR.",
  );
}

export async function fetchTenantHrPerformancePeriods(tenantId: string): Promise<HrPerformancePeriod[]> {
  const data = await fetchSetting(tenantId, HR_PERFORMANCE_PERIOD_SETTING_KEY);
  return parseHrPerformancePeriods(data?.setting_value);
}

export async function saveTenantHrPerformancePeriods(tenantId: string, items: HrPerformancePeriod[]) {
  await saveSetting(
    tenantId,
    HR_PERFORMANCE_PERIOD_SETTING_KEY,
    { version: 1, items },
    "Baseline periode penilaian tenant untuk workflow kinerja HR.",
  );
}

export async function fetchTenantHrPerformanceForms(tenantId: string): Promise<HrPerformanceForm[]> {
  const data = await fetchSetting(tenantId, HR_PERFORMANCE_FORM_SETTING_KEY);
  return parseHrPerformanceForms(data?.setting_value);
}

export async function saveTenantHrPerformanceForms(tenantId: string, items: HrPerformanceForm[]) {
  await saveSetting(
    tenantId,
    HR_PERFORMANCE_FORM_SETTING_KEY,
    { version: 1, items },
    "Baseline form penilaian tenant untuk workflow kinerja HR.",
  );
}

export async function fetchTenantHrReview360Settings(tenantId: string): Promise<HrReview360Settings> {
  const data = await fetchSetting(tenantId, HR_PERFORMANCE_REVIEW360_SETTING_KEY);
  return parseHrReview360Settings(data?.setting_value);
}

export async function saveTenantHrReview360Settings(tenantId: string, settings: HrReview360Settings) {
  await saveSetting(
    tenantId,
    HR_PERFORMANCE_REVIEW360_SETTING_KEY,
    { version: 1, settings },
    "Baseline ulasan 360 tenant untuk workflow evaluasi kinerja HR.",
  );
}
