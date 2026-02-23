export const BILLING_DURATION_OPTIONS = [1, 3, 6, 12] as const;
export type BillingDurationOption = (typeof BILLING_DURATION_OPTIONS)[number];

export type BillingOrganizationType =
  | "pemerintah_daerah"
  | "instansi_pemerintah"
  | "perusahaan"
  | "sekolah";

export const INDIVIDUAL_MIN_DURATION_SETTING_KEY = "individual_min_duration_months";
export const INDIVIDUAL_MIN_DURATION_DEFAULT: BillingDurationOption = 6;

export const CENTRALIZED_MIN_DURATION_SETTING_KEYS: Record<BillingOrganizationType, string> = {
  pemerintah_daerah: "centralized_min_duration_pemerintah_daerah_months",
  instansi_pemerintah: "centralized_min_duration_instansi_pemerintah_months",
  perusahaan: "centralized_min_duration_perusahaan_months",
  sekolah: "centralized_min_duration_sekolah_months",
};

export const CENTRALIZED_MIN_DURATION_DEFAULTS: Record<BillingOrganizationType, BillingDurationOption> = {
  pemerintah_daerah: 12,
  instansi_pemerintah: 1,
  perusahaan: 1,
  sekolah: 6,
};

const normalizeOrganizationType = (raw: string | null | undefined): BillingOrganizationType => {
  if (raw === "pemerintah_daerah") return "pemerintah_daerah";
  if (raw === "instansi_pemerintah") return "instansi_pemerintah";
  if (raw === "sekolah") return "sekolah";
  return "perusahaan";
};

export const parseNumericSettingValue = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const objectValue = raw as Record<string, unknown>;
    if ("value" in objectValue) return parseNumericSettingValue(objectValue.value, fallback);
    if ("amount" in objectValue) return parseNumericSettingValue(objectValue.amount, fallback);
  }
  return fallback;
};

export const normalizeDurationOption = (
  raw: unknown,
  fallback: BillingDurationOption,
): BillingDurationOption => {
  const normalized = Math.floor(parseNumericSettingValue(raw, fallback));
  if (BILLING_DURATION_OPTIONS.includes(normalized as BillingDurationOption)) {
    return normalized as BillingDurationOption;
  }
  return fallback;
};

export const resolveMinimumBillingDuration = (params: {
  billingMode: string | null | undefined;
  organizationType: string | null | undefined;
  getSettingValue: (key: string) => unknown;
}): BillingDurationOption => {
  const isIndividual = params.billingMode === "individual";
  if (isIndividual) {
    return normalizeDurationOption(
      params.getSettingValue(INDIVIDUAL_MIN_DURATION_SETTING_KEY),
      INDIVIDUAL_MIN_DURATION_DEFAULT,
    );
  }

  const orgType = normalizeOrganizationType(params.organizationType);
  const key = CENTRALIZED_MIN_DURATION_SETTING_KEYS[orgType];
  const fallback = CENTRALIZED_MIN_DURATION_DEFAULTS[orgType];
  return normalizeDurationOption(params.getSettingValue(key), fallback);
};

