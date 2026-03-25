interface AttendanceIntroPromoRawConfig {
  active?: unknown;
  promo_price_per_month?: unknown;
  promo_duration_months?: unknown;
  label?: unknown;
  new_tenants_only?: unknown;
}

interface AttendanceIntroPromoRawState {
  intro_promo_active?: unknown;
  intro_promo_price_per_employee?: unknown;
  intro_promo_duration_months?: unknown;
  intro_promo_months_consumed?: unknown;
  intro_promo_label?: unknown;
}

export interface AttendanceIntroPromoConfig {
  active: boolean;
  promo_price_per_month: number;
  promo_duration_months: 1 | 2 | 3;
  label: string | null;
  new_tenants_only: boolean;
}

export interface AttendanceIntroPromoState {
  intro_promo_active: boolean;
  intro_promo_price_per_employee: number | null;
  intro_promo_duration_months: number;
  intro_promo_months_consumed: number;
  intro_promo_label: string | null;
}

export interface AttendanceIntroPromoBreakdown {
  introPromoActive: boolean;
  promoMonthsApplied: number;
  promoMonthsRemainingBeforeInvoice: number;
  promoMonthsRemainingAfterInvoice: number;
  promoPricePerEmployee: number | null;
  promoLabel: string | null;
  normalPricePerEmployee: number;
  discountedNormalPricePerEmployee: number;
  packageDiscountPercentage: number;
  subtotal: number;
  packageDiscountAmount: number;
  introPromoAdditionalDiscount: number;
  discountAmount: number;
  taxableBase: number;
  effectiveAveragePricePerEmployee: number;
  monthsConsumedAfterInvoice: number;
}

export interface AttendanceIntroPromoSubscriptionSnapshot {
  price_per_employee: number | null;
  price_per_month: number | null;
  intro_promo_active: boolean;
  intro_promo_price_per_employee: number | null;
  intro_promo_duration_months: number | null;
  intro_promo_months_consumed: number;
  intro_promo_label: string | null;
  intro_promo_started_at: string | null;
}

const clampDuration = (value: number): 1 | 2 | 3 => {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
};

const toFiniteNonNegativeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return Math.max(0, fallback);
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

const clampDiscount = (value: unknown): number => {
  const normalized = toFiniteNonNegativeNumber(value, 0);
  if (normalized > 100) return 100;
  return normalized;
};

const roundCurrency = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export const normalizeAttendanceIntroPromoConfig = (
  raw: AttendanceIntroPromoRawConfig | unknown,
): AttendanceIntroPromoConfig => {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as AttendanceIntroPromoRawConfig)
    : {};
  const promoPricePerMonth = toFiniteNonNegativeNumber(value.promo_price_per_month, 5000);
  const promoDurationMonths = clampDuration(Math.floor(toFiniteNonNegativeNumber(value.promo_duration_months, 2)));
  const label = toOptionalString(value.label);
  return {
    active: toBoolean(value.active, false) && promoPricePerMonth > 0,
    promo_price_per_month: promoPricePerMonth,
    promo_duration_months: promoDurationMonths,
    label,
    new_tenants_only: toBoolean(value.new_tenants_only, true),
  };
};

export const normalizeAttendanceIntroPromoState = (
  raw: AttendanceIntroPromoRawState | unknown,
): AttendanceIntroPromoState => {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as AttendanceIntroPromoRawState)
    : {};
  const durationMonths = Math.max(0, Math.floor(toFiniteNonNegativeNumber(value.intro_promo_duration_months, 0)));
  const monthsConsumed = Math.min(
    durationMonths,
    Math.max(0, Math.floor(toFiniteNonNegativeNumber(value.intro_promo_months_consumed, 0))),
  );
  const price = toFiniteNonNegativeNumber(value.intro_promo_price_per_employee, 0);
  return {
    intro_promo_active: toBoolean(value.intro_promo_active, false) && durationMonths > monthsConsumed && price > 0,
    intro_promo_price_per_employee: price > 0 ? price : null,
    intro_promo_duration_months: durationMonths,
    intro_promo_months_consumed: monthsConsumed,
    intro_promo_label: toOptionalString(value.intro_promo_label),
  };
};

export const getAttendanceIntroPromoLabel = (configOrState: {
  label?: string | null;
  intro_promo_label?: string | null;
  promo_duration_months?: number;
  intro_promo_duration_months?: number;
}): string => {
  const label =
    toOptionalString(configOrState.label) ||
    toOptionalString(configOrState.intro_promo_label);
  if (label) return label;
  const duration =
    Math.max(
      1,
      Math.floor(
        Number(configOrState.promo_duration_months ?? configOrState.intro_promo_duration_months ?? 2),
      ),
    );
  return `Promo onboarding ${duration} bulan pertama`;
};

export const getAttendanceIntroPromoCampaignText = (
  config: AttendanceIntroPromoConfig,
  trailingText = "Setelah promo, harga kembali mengikuti paket normal yang dipilih.",
): string | null => {
  if (!config.active) return null;
  const label = getAttendanceIntroPromoLabel(config);
  return `${label}: Rp${config.promo_price_per_month.toLocaleString("id-ID")}/pegawai/bulan. ${trailingText}`;
};

export const calculateAttendanceIntroPromoBreakdown = ({
  normalPricePerEmployee,
  packageDiscountPercentage,
  durationMonths,
  employeeCount,
  promoConfig,
  promoState,
  canInitializePromo,
}: {
  normalPricePerEmployee: number;
  packageDiscountPercentage: number;
  durationMonths: number;
  employeeCount: number;
  promoConfig?: AttendanceIntroPromoRawConfig | unknown;
  promoState?: AttendanceIntroPromoRawState | unknown;
  canInitializePromo: boolean;
}): AttendanceIntroPromoBreakdown => {
  const normalizedConfig = normalizeAttendanceIntroPromoConfig(promoConfig);
  const normalizedState = normalizeAttendanceIntroPromoState(promoState);
  const safeDurationMonths = Math.max(1, Math.floor(toFiniteNonNegativeNumber(durationMonths, 1)));
  const safeEmployeeCount = Math.max(1, Math.floor(toFiniteNonNegativeNumber(employeeCount, 1)));
  const safeNormalPricePerEmployee = roundCurrency(toFiniteNonNegativeNumber(normalPricePerEmployee, 0));
  const safePackageDiscountPercentage = clampDiscount(packageDiscountPercentage);
  const discountedNormalPricePerEmployee = roundCurrency(
    safeNormalPricePerEmployee * (1 - safePackageDiscountPercentage / 100),
  );
  const packageDiscountAmount = roundCurrency(
    safeNormalPricePerEmployee *
      safeEmployeeCount *
      safeDurationMonths *
      (safePackageDiscountPercentage / 100),
  );

  const continuingPromo =
    normalizedState.intro_promo_active &&
    normalizedState.intro_promo_price_per_employee !== null &&
    normalizedState.intro_promo_duration_months > normalizedState.intro_promo_months_consumed;

  const initialPromo =
    !continuingPromo &&
    normalizedConfig.active &&
    canInitializePromo &&
    normalizedConfig.promo_price_per_month > 0;

  const promoDurationMonths = continuingPromo
    ? normalizedState.intro_promo_duration_months
    : initialPromo
      ? normalizedConfig.promo_duration_months
      : 0;
  const promoMonthsConsumed = continuingPromo
    ? normalizedState.intro_promo_months_consumed
    : 0;
  const promoPricePerEmployee = continuingPromo
    ? normalizedState.intro_promo_price_per_employee
    : initialPromo
      ? normalizedConfig.promo_price_per_month
      : null;
  const promoLabel = continuingPromo
    ? getAttendanceIntroPromoLabel(normalizedState)
    : initialPromo
      ? getAttendanceIntroPromoLabel(normalizedConfig)
      : null;
  const promoMonthsRemainingBeforeInvoice =
    promoDurationMonths > promoMonthsConsumed ? promoDurationMonths - promoMonthsConsumed : 0;
  const promoMonthsApplied = Math.min(safeDurationMonths, promoMonthsRemainingBeforeInvoice);
  const introPromoAdditionalDiscountPerEmployeePerMonth =
    promoPricePerEmployee !== null
      ? Math.max(0, discountedNormalPricePerEmployee - promoPricePerEmployee)
      : 0;
  const introPromoAdditionalDiscount = roundCurrency(
    introPromoAdditionalDiscountPerEmployeePerMonth * safeEmployeeCount * promoMonthsApplied,
  );
  const subtotal = roundCurrency(safeNormalPricePerEmployee * safeEmployeeCount * safeDurationMonths);
  const discountAmount = roundCurrency(packageDiscountAmount + introPromoAdditionalDiscount);
  const taxableBase = roundCurrency(Math.max(0, subtotal - discountAmount));
  const effectiveAveragePricePerEmployee = roundCurrency(taxableBase / (safeEmployeeCount * safeDurationMonths));
  const monthsConsumedAfterInvoice = promoMonthsConsumed + promoMonthsApplied;
  const promoMonthsRemainingAfterInvoice = Math.max(0, promoDurationMonths - monthsConsumedAfterInvoice);

  return {
    introPromoActive: promoMonthsApplied > 0,
    promoMonthsApplied,
    promoMonthsRemainingBeforeInvoice,
    promoMonthsRemainingAfterInvoice,
    promoPricePerEmployee,
    promoLabel,
    normalPricePerEmployee: safeNormalPricePerEmployee,
    discountedNormalPricePerEmployee,
    packageDiscountPercentage: safePackageDiscountPercentage,
    subtotal,
    packageDiscountAmount,
    introPromoAdditionalDiscount,
    discountAmount,
    taxableBase,
    effectiveAveragePricePerEmployee,
    monthsConsumedAfterInvoice,
  };
};

export const buildAttendanceSubscriptionSnapshotFromInvoice = ({
  employeeCount,
  fallbackRecurringPricePerEmployee,
  metadata,
  currentState,
  now = new Date(),
}: {
  employeeCount: number;
  fallbackRecurringPricePerEmployee: number | null | undefined;
  metadata: unknown;
  currentState?: AttendanceIntroPromoRawState | unknown;
  now?: Date;
}): AttendanceIntroPromoSubscriptionSnapshot => {
  const safeEmployeeCount = Math.max(1, Math.floor(toFiniteNonNegativeNumber(employeeCount, 1)));
  const metadataRecord = toRecord(metadata);
  const nestedPromoRecord = toRecord(metadataRecord?.attendance_intro_promo);
  const recurringPrice = roundCurrency(
    toFiniteNonNegativeNumber(
      metadataRecord?.subscription_recurring_price_per_employee,
      fallbackRecurringPricePerEmployee ?? 0,
    ),
  );
  const currentPromoState = normalizeAttendanceIntroPromoState(currentState);
  const scope = typeof metadataRecord?.package_scope === "string" ? metadataRecord.package_scope.trim() : null;
  const promoPricePerEmployee = roundCurrency(
    toFiniteNonNegativeNumber(
      metadataRecord?.attendance_intro_promo_price_per_employee,
      nestedPromoRecord?.promo_price_per_employee,
    ),
  );
  const promoDurationMonths = Math.max(
    0,
    Math.floor(
      toFiniteNonNegativeNumber(
        metadataRecord?.attendance_intro_promo_duration_months,
        nestedPromoRecord?.promo_duration_months ?? 0,
      ),
    ),
  );
  const promoMonthsApplied = Math.max(
    0,
    Math.floor(
      toFiniteNonNegativeNumber(
        metadataRecord?.attendance_intro_promo_months_applied,
        nestedPromoRecord?.promo_months_applied ?? 0,
      ),
    ),
  );
  const promoMonthsConsumedBeforeInvoice = Math.max(
    0,
    Math.floor(
      toFiniteNonNegativeNumber(
        metadataRecord?.attendance_intro_promo_months_consumed_before_invoice,
        currentPromoState.intro_promo_months_consumed,
      ),
    ),
  );
  const promoMonthsConsumedAfterInvoice = Math.min(
    promoDurationMonths,
    Math.max(
      promoMonthsConsumedBeforeInvoice + promoMonthsApplied,
      Math.floor(
        toFiniteNonNegativeNumber(
        metadataRecord?.attendance_intro_promo_months_consumed_after_invoice,
          nestedPromoRecord?.months_consumed_after_invoice ?? promoMonthsConsumedBeforeInvoice + promoMonthsApplied,
        ),
      ),
    ),
  );
  const promoMonthsRemainingAfterInvoice = Math.max(
    0,
    promoDurationMonths - promoMonthsConsumedAfterInvoice,
  );
  const promoLabel =
    toOptionalString(metadataRecord?.attendance_intro_promo_label) ||
    toOptionalString(nestedPromoRecord?.label);
  const isAttendanceScope = scope === "attendance" || (scope === null && nestedPromoRecord !== null);
  const hasPromoState =
    isAttendanceScope &&
    promoDurationMonths > 0 &&
    promoPricePerEmployee > 0 &&
    (promoMonthsApplied > 0 || promoMonthsConsumedAfterInvoice > 0 || promoMonthsRemainingAfterInvoice > 0);
  const existingStartedAt =
    typeof (currentState as Record<string, unknown> | null)?.intro_promo_started_at === "string"
      ? ((currentState as Record<string, unknown>).intro_promo_started_at as string)
      : null;
  const startedAt = hasPromoState
    ? existingStartedAt || now.toISOString().slice(0, 10)
    : null;

  return {
    price_per_employee: recurringPrice > 0 ? recurringPrice : null,
    price_per_month: recurringPrice > 0 ? roundCurrency(recurringPrice * safeEmployeeCount) : null,
    intro_promo_active: hasPromoState && promoMonthsRemainingAfterInvoice > 0,
    intro_promo_price_per_employee: hasPromoState ? promoPricePerEmployee : null,
    intro_promo_duration_months: hasPromoState ? promoDurationMonths : null,
    intro_promo_months_consumed: hasPromoState ? promoMonthsConsumedAfterInvoice : 0,
    intro_promo_label: hasPromoState ? promoLabel : null,
    intro_promo_started_at: startedAt,
  };
};
