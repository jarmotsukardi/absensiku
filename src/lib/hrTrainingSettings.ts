import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

export const HR_TRAINING_DATA_SETTING_KEY = "hr_training_data_v1";
export const HR_CERTIFICATIONS_SETTING_KEY = "hr_certifications_v1";
export const HR_SKILL_MATRIX_SETTING_KEY = "hr_skill_matrix_v1";

export type HrTrainingProgram = {
  id: string;
  name: string;
  category: string;
  provider: string;
  durationHours: number;
  participantTarget: number;
  status: "draft" | "planned" | "running" | "completed";
  notes: string;
};

export type HrCertificationRule = {
  id: string;
  name: string;
  targetRole: string;
  validityMonths: number;
  reminderDays: number;
  mandatory: boolean;
  issuer: string;
};

export type HrSkillMatrixItem = {
  id: string;
  skillName: string;
  targetFunction: string;
  requiredLevel: "Dasar" | "Menengah" | "Mahir";
  currentCoverage: number;
  gapCount: number;
  linkedTraining: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const normalizeNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const parseList = <T>(value: unknown, mapper: (item: Record<string, unknown>, index: number) => T): T[] => {
  const source = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.items)
      ? value.items
      : [];

  return source.filter((item): item is Record<string, unknown> => isObject(item)).map(mapper);
};

export const parseHrTrainingPrograms = (value: unknown): HrTrainingProgram[] =>
  parseList(value, (item, index) => ({
    id: normalizeString(item.id, `training-${index}`),
    name: normalizeString(item.name, "Program Pelatihan"),
    category: normalizeString(item.category, "Umum"),
    provider: normalizeString(item.provider, "Internal"),
    durationHours: normalizeNumber(item.durationHours, 8),
    participantTarget: normalizeNumber(item.participantTarget, 10),
    status: (["draft", "planned", "running", "completed"].includes(String(item.status))
      ? item.status
      : "draft") as HrTrainingProgram["status"],
    notes: normalizeString(item.notes),
  }));

export const parseHrCertificationRules = (value: unknown): HrCertificationRule[] =>
  parseList(value, (item, index) => ({
    id: normalizeString(item.id, `certification-${index}`),
    name: normalizeString(item.name, "Sertifikasi"),
    targetRole: normalizeString(item.targetRole, "Semua Role"),
    validityMonths: normalizeNumber(item.validityMonths, 12),
    reminderDays: normalizeNumber(item.reminderDays, 30),
    mandatory: normalizeBoolean(item.mandatory, false),
    issuer: normalizeString(item.issuer, "Lembaga Internal"),
  }));

export const parseHrSkillMatrixItems = (value: unknown): HrSkillMatrixItem[] =>
  parseList(value, (item, index) => ({
    id: normalizeString(item.id, `skill-${index}`),
    skillName: normalizeString(item.skillName, "Skill"),
    targetFunction: normalizeString(item.targetFunction, "Umum"),
    requiredLevel: (["Dasar", "Menengah", "Mahir"].includes(String(item.requiredLevel))
      ? item.requiredLevel
      : "Dasar") as HrSkillMatrixItem["requiredLevel"],
    currentCoverage: normalizeNumber(item.currentCoverage, 0),
    gapCount: normalizeNumber(item.gapCount, 0),
    linkedTraining: normalizeString(item.linkedTraining, "-"),
  }));

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
    "Permintaan pengaturan pelatihan tenant timeout.",
  );

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

async function saveSetting(tenantId: string, settingKey: string, settingValue: unknown, description: string) {
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
      "Simpan pengaturan pelatihan tenant timeout.",
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
    "Tambah pengaturan pelatihan tenant timeout.",
  );
  if (error) throw error;
}

export async function fetchTenantHrTrainingPrograms(tenantId: string): Promise<HrTrainingProgram[]> {
  const data = await fetchSetting(tenantId, HR_TRAINING_DATA_SETTING_KEY);
  return parseHrTrainingPrograms(data?.setting_value);
}

export async function saveTenantHrTrainingPrograms(tenantId: string, items: HrTrainingProgram[]) {
  await saveSetting(
    tenantId,
    HR_TRAINING_DATA_SETTING_KEY,
    { version: 1, items },
    "Baseline program pelatihan tenant untuk domain pengembangan SDM.",
  );
}

export async function fetchTenantHrCertificationRules(tenantId: string): Promise<HrCertificationRule[]> {
  const data = await fetchSetting(tenantId, HR_CERTIFICATIONS_SETTING_KEY);
  return parseHrCertificationRules(data?.setting_value);
}

export async function saveTenantHrCertificationRules(tenantId: string, items: HrCertificationRule[]) {
  await saveSetting(
    tenantId,
    HR_CERTIFICATIONS_SETTING_KEY,
    { version: 1, items },
    "Baseline sertifikasi tenant untuk domain pengembangan SDM.",
  );
}

export async function fetchTenantHrSkillMatrixItems(tenantId: string): Promise<HrSkillMatrixItem[]> {
  const data = await fetchSetting(tenantId, HR_SKILL_MATRIX_SETTING_KEY);
  return parseHrSkillMatrixItems(data?.setting_value);
}

export async function saveTenantHrSkillMatrixItems(tenantId: string, items: HrSkillMatrixItem[]) {
  await saveSetting(
    tenantId,
    HR_SKILL_MATRIX_SETTING_KEY,
    { version: 1, items },
    "Baseline matriks keahlian tenant untuk domain pengembangan SDM.",
  );
}
