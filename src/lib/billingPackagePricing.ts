import {
  type BillingPackageModuleScope,
  normalizeBillingPackageModuleScope,
} from "@/lib/billingPackageScope";

export const DEFAULT_HR_ADDON_RATIO = 0.5;
export const DEFAULT_PAYROLL_ADDON_RATIO = 0.8;

const toFiniteNonNegativeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }
  return Math.max(0, Math.round(fallback));
};

export const getDefaultHrAddonPrice = (attendanceBasePrice: unknown): number =>
  Math.max(
    0,
    Math.round(toFiniteNonNegativeNumber(attendanceBasePrice, 0) * DEFAULT_HR_ADDON_RATIO),
  );

export const getDefaultPayrollAddonPrice = (attendanceBasePrice: unknown): number =>
  Math.max(
    0,
    Math.round(
      toFiniteNonNegativeNumber(attendanceBasePrice, 0) * DEFAULT_PAYROLL_ADDON_RATIO,
    ),
  );

export interface BillingPackagePricingInput {
  module_scope?: unknown;
  attendance_base_price?: unknown;
  hr_addon_price?: unknown;
  payroll_addon_price?: unknown;
  base_price_per_month?: unknown;
  promo_active?: unknown;
  promo_price_per_month?: unknown;
  promo_label?: unknown;
  discount_percentage?: unknown;
}

export interface BillingPackagePricingSnapshot {
  module_scope: BillingPackageModuleScope;
  attendance_base_price: number;
  hr_addon_price: number;
  payroll_addon_price: number;
  base_price_per_month: number;
  promo_active: boolean;
  promo_price_per_month: number | null;
  promo_label: string | null;
}

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const clampDiscount = (value: unknown): number => {
  const parsed = toFiniteNonNegativeNumber(value, 0);
  return Math.min(100, Math.max(0, parsed));
};

export const sanitizeBillingPackagePricing = (
  input: BillingPackagePricingInput,
  fallbackAttendanceBasePrice = 0,
): BillingPackagePricingSnapshot => {
  const moduleScope = normalizeBillingPackageModuleScope(input.module_scope);
  const fallbackBase = toFiniteNonNegativeNumber(
    input.base_price_per_month,
    fallbackAttendanceBasePrice,
  );
  const attendanceBasePrice = toFiniteNonNegativeNumber(
    input.attendance_base_price,
    fallbackBase,
  );

  const hrAddonPrice =
    moduleScope === "attendance"
      ? 0
      : toFiniteNonNegativeNumber(input.hr_addon_price, getDefaultHrAddonPrice(attendanceBasePrice));

  const payrollAddonPrice =
    moduleScope === "attendance_hr_payroll"
      ? toFiniteNonNegativeNumber(
          input.payroll_addon_price,
          getDefaultPayrollAddonPrice(attendanceBasePrice),
        )
      : 0;

  const basePricePerMonth = attendanceBasePrice + hrAddonPrice + payrollAddonPrice;
  const promoRequested = toBoolean(input.promo_active, false);
  const promoCandidate = promoRequested
    ? toFiniteNonNegativeNumber(input.promo_price_per_month, basePricePerMonth)
    : null;
  const promoPricePerMonth =
    moduleScope !== "attendance" && promoCandidate !== null && promoCandidate < basePricePerMonth
      ? promoCandidate
      : null;

  return {
    module_scope: moduleScope,
    attendance_base_price: attendanceBasePrice,
    hr_addon_price: hrAddonPrice,
    payroll_addon_price: payrollAddonPrice,
    base_price_per_month: basePricePerMonth,
    promo_active: promoPricePerMonth !== null,
    promo_price_per_month: promoPricePerMonth,
    promo_label: moduleScope === "attendance" ? null : toOptionalString(input.promo_label),
  };
};

export const applyBillingPackageScopePricingDefaults = (
  input: BillingPackagePricingInput,
  nextScope: BillingPackageModuleScope,
  fallbackAttendanceBasePrice = 0,
): BillingPackagePricingSnapshot => {
  const current = sanitizeBillingPackagePricing(input, fallbackAttendanceBasePrice);

  if (nextScope === "attendance") {
    return {
      ...current,
      module_scope: nextScope,
      hr_addon_price: 0,
      payroll_addon_price: 0,
      base_price_per_month: current.attendance_base_price,
    };
  }

  const nextHrAddon =
    current.hr_addon_price > 0
      ? current.hr_addon_price
      : getDefaultHrAddonPrice(current.attendance_base_price);

  if (nextScope === "attendance_hr") {
    return {
      ...current,
      module_scope: nextScope,
      hr_addon_price: nextHrAddon,
      payroll_addon_price: 0,
      base_price_per_month: current.attendance_base_price + nextHrAddon,
    };
  }

  const nextPayrollAddon =
    current.payroll_addon_price > 0
      ? current.payroll_addon_price
      : getDefaultPayrollAddonPrice(current.attendance_base_price);

  return {
    ...current,
    module_scope: nextScope,
    hr_addon_price: nextHrAddon,
    payroll_addon_price: nextPayrollAddon,
    base_price_per_month:
      current.attendance_base_price + nextHrAddon + nextPayrollAddon,
  };
};

export const isBillingPackagePromoActive = (
  input: BillingPackagePricingInput,
  fallbackAttendanceBasePrice = 0,
): boolean => sanitizeBillingPackagePricing(input, fallbackAttendanceBasePrice).promo_active;

export const getBillingPackagePromoLabel = (
  input: BillingPackagePricingInput,
  fallbackAttendanceBasePrice = 0,
): string | null => {
  const pricing = sanitizeBillingPackagePricing(input, fallbackAttendanceBasePrice);
  if (!pricing.promo_active) return null;
  return pricing.promo_label || "Promo aktif";
};

export const getBillingPackageEffectivePricePerMonth = (
  input: BillingPackagePricingInput,
  fallbackAttendanceBasePrice = 0,
): number => {
  const pricing = sanitizeBillingPackagePricing(input, fallbackAttendanceBasePrice);
  return pricing.promo_active && pricing.promo_price_per_month !== null
    ? pricing.promo_price_per_month
    : pricing.base_price_per_month;
};

export const getBillingPackageEffectiveDiscountPercentage = (
  input: BillingPackagePricingInput,
): number => {
  if (isBillingPackagePromoActive(input)) return 0;
  return clampDiscount(input.discount_percentage);
};

export const getBillingPackagePromoSavingsPercentage = (
  input: BillingPackagePricingInput,
  fallbackAttendanceBasePrice = 0,
): number | null => {
  const pricing = sanitizeBillingPackagePricing(input, fallbackAttendanceBasePrice);
  if (!pricing.promo_active || pricing.promo_price_per_month === null || pricing.base_price_per_month <= 0) {
    return null;
  }
  const savingsRatio =
    (pricing.base_price_per_month - pricing.promo_price_per_month) / pricing.base_price_per_month;
  return Math.max(0, Math.round(savingsRatio * 100));
};

export const getAttendancePromoAvailabilityMessage = (minDurationMonths: number): string | null => {
  if (!Number.isFinite(minDurationMonths) || minDurationMonths <= 3) {
    return null;
  }

  return `Promo Absensi Rp5.000 hanya berlaku untuk paket 1 dan 3 bulan. Tenant ini minimum ${Math.floor(
    minDurationMonths,
  )} bulan, jadi promo tidak tersedia pada pilihan paket saat ini.`;
};
