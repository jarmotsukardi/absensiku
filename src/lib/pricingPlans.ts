import type { Json } from "@/integrations/supabase/types";
import {
  type BillingPackageModuleScope,
  getBillingPackageDisplayName,
  getBillingPackageModuleScopeLabel,
  normalizeBillingPackageModuleScope,
} from "@/lib/billingPackageScope";
import {
  getBillingPackageEffectiveDiscountPercentage,
  getBillingPackageEffectivePricePerMonth,
  getBillingPackagePromoLabel,
  getBillingPackagePromoSavingsPercentage,
  isBillingPackagePromoActive,
} from "@/lib/billingPackagePricing";

export interface HomepagePricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  features: string[];
  is_popular: boolean;
  module_scope?: BillingPackageModuleScope | null;
  original_price?: number | null;
  discount_percentage?: number | null;
  duration_months?: number | null;
  total_price?: number | null;
  total_price_before_discount?: number | null;
  popular_label?: string | null;
  source_package_name?: string | null;
  source_package_display_name?: string | null;
  source_duration_months?: number | null;
  commitment_label?: string | null;
  promo_label?: string | null;
  is_promo_active?: boolean | null;
  campaign_note?: string | null;
}

export interface BillingPackageLike {
  id: string;
  name: string;
  description?: string | null;
  base_price_per_month: number;
  duration_months?: number | null;
  discount_percentage?: number | null;
  features?: Json | null;
  sort_order?: number | null;
  module_scope?: string | null;
  promo_active?: boolean | null;
  promo_price_per_month?: number | null;
  promo_label?: string | null;
}

interface PricingBreakdown {
  durationMonths: number;
  discountPercentage: number;
  baseMonthlyPrice: number;
  finalMonthlyPrice: number;
  baseTotalPrice: number;
  finalTotalPrice: number;
  effectiveMonthlyPrice: number;
  isPromoActive: boolean;
  promoLabel: string | null;
  promoSavingsPercentage: number | null;
}

const asStringArray = (value: Json | null | undefined): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if (typeof record.title === "string") return record.title.trim();
        if (typeof record.name === "string") return record.name.trim();
        if (typeof record.label === "string") return record.label.trim();
      }
      return "";
    })
    .filter(Boolean);
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toPricingBreakdown = (pkg: BillingPackageLike, allowPromoPricing = true): PricingBreakdown => {
  const durationMonths = Math.max(1, Math.floor(toFiniteNumber(pkg.duration_months, 1)));
  const baseMonthlyPrice = Math.max(0, Math.round(toFiniteNumber(pkg.base_price_per_month, 0)));
  const effectiveMonthlyPrice = Math.max(
    0,
    Math.round(
      allowPromoPricing
        ? getBillingPackageEffectivePricePerMonth(pkg, baseMonthlyPrice)
        : baseMonthlyPrice,
    ),
  );
  const isPromoActive = allowPromoPricing && isBillingPackagePromoActive(pkg, baseMonthlyPrice);
  const discountPercentage = allowPromoPricing
    ? getBillingPackageEffectiveDiscountPercentage(pkg)
    : Math.max(0, Math.min(100, Math.round(toFiniteNumber(pkg.discount_percentage, 0))));
  const finalMonthlyPrice = Math.max(
    0,
    Math.round(effectiveMonthlyPrice * (1 - discountPercentage / 100)),
  );
  const baseTotalPrice = baseMonthlyPrice * durationMonths;
  const finalTotalPrice = finalMonthlyPrice * durationMonths;

  return {
    durationMonths,
    discountPercentage,
    baseMonthlyPrice,
    finalMonthlyPrice,
    baseTotalPrice,
    finalTotalPrice,
    effectiveMonthlyPrice,
    isPromoActive,
    promoLabel: allowPromoPricing ? getBillingPackagePromoLabel(pkg, baseMonthlyPrice) : null,
    promoSavingsPercentage: allowPromoPricing
      ? getBillingPackagePromoSavingsPercentage(pkg, baseMonthlyPrice)
      : null,
  };
};

const toDescription = (pkg: BillingPackageLike, allowPromoPricing = true): string => {
  if (pkg.description && pkg.description.trim().length > 0) return pkg.description.trim();
  const pricing = toPricingBreakdown(pkg, allowPromoPricing);
  const { durationMonths, discountPercentage } = pricing;
  const scope = normalizeBillingPackageModuleScope(pkg.module_scope);
  if (pricing.isPromoActive) {
    return `${pricing.promoLabel || "Promo aktif"} untuk paket ${durationMonths} bulan. Harga normal tetap tersedia di luar promo.`;
  }
  if (scope === "attendance_hr_payroll") {
    if (discountPercentage > 0) {
      return `Bundel Absensi + HR + Payroll untuk ${durationMonths} bulan dengan diskon ${discountPercentage}%`;
    }
    return `Bundel Absensi + HR + Payroll untuk ${durationMonths} bulan`;
  }
  if (scope === "attendance_hr") {
    if (discountPercentage > 0) {
      return `Bundel Absensi + HR untuk ${durationMonths} bulan dengan diskon ${discountPercentage}%`;
    }
    return `Bundel Absensi + HR untuk ${durationMonths} bulan`;
  }
  if (discountPercentage > 0) {
    return `Paket ${durationMonths} bulan dengan diskon ${discountPercentage}%`;
  }
  return `Paket langganan ${durationMonths} bulan`;
};

const toFeatures = (pkg: BillingPackageLike, fallback: string[] = [], allowPromoPricing = true): string[] => {
  const scope = normalizeBillingPackageModuleScope(pkg.module_scope);
  const pricing = toPricingBreakdown(pkg, allowPromoPricing);
  const moduleFeatures = [
    `Cakupan ${getBillingPackageModuleScopeLabel(scope)}`,
    "Termasuk fondasi Absensi",
  ];
  if (pricing.isPromoActive) {
    moduleFeatures.unshift(
      `${pricing.promoLabel || "Promo aktif"}: ${pricing.effectiveMonthlyPrice.toLocaleString("id-ID")} per pegawai/bulan`,
    );
  }
  if (scope === "attendance_hr" || scope === "attendance_hr_payroll") {
    moduleFeatures.push("Termasuk modul HR");
  }
  if (scope === "attendance_hr_payroll") {
    moduleFeatures.push("Termasuk modul Payroll");
  }

  const parsed = asStringArray(pkg.features);
  if (parsed.length > 0) return Array.from(new Set([...moduleFeatures, ...parsed]));
  if (fallback.length > 0) return Array.from(new Set([...moduleFeatures, ...fallback]));

  const base = [
    `Durasi ${pricing.durationMonths} bulan`,
    "Tagihan berbasis jumlah pegawai aktif",
    "Termasuk dukungan dashboard dan laporan",
  ];
  if (pricing.discountPercentage > 0) {
    base.unshift(`Diskon paket ${pricing.discountPercentage}%`);
  }
  return Array.from(new Set([...moduleFeatures, ...base]));
};

const buildCommitmentLabel = (
  packageName: string,
  durationMonths: number,
  discountPercentage: number,
  isPromoActive: boolean,
  promoLabel: string | null,
  allowPromoPricing = true,
): string => {
  if (allowPromoPricing && isPromoActive) {
    if (durationMonths > 1) {
      return `${promoLabel || "Promo aktif"} untuk paket ${packageName} (${durationMonths} bulan).`;
    }
    return `${promoLabel || "Promo aktif"} untuk paket ${packageName}.`;
  }
  if (durationMonths > 1) {
    if (discountPercentage > 0) {
      return `Harga mulai ini mengikuti paket ${packageName} (${durationMonths} bulan, hemat ${discountPercentage}%).`;
    }
    return `Harga mulai ini mengikuti paket ${packageName} (${durationMonths} bulan).`;
  }
  return `Harga berlaku untuk paket ${packageName}.`;
};

const applyPopularMarker = (plans: HomepagePricingPlan[]): HomepagePricingPlan[] => {
  if (plans.length === 0) return plans;

  const paidPlanIndexes = plans
    .map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => plan.price > 0);
  const cheapestPaid =
    paidPlanIndexes.length > 0
      ? paidPlanIndexes.reduce((best, current) =>
          current.plan.price < best.plan.price ? current : best,
        )
      : null;
  const cheapestIndex = cheapestPaid?.index ?? 0;

  return plans.map((plan, index) => ({
    ...plan,
    is_popular: index === cheapestIndex,
    popular_label: index === cheapestIndex ? "Termurah • Paling Populer" : null,
  }));
};

const mapPackageToPricingPlan = (
  pkg: BillingPackageLike,
  legacyPlans: HomepagePricingPlan[] = [],
  allowPromoPricing = true,
  campaignNote: string | null = null,
): HomepagePricingPlan => {
  const legacy =
    legacyPlans.find((plan) => plan.id === pkg.id) ||
    legacyPlans.find((plan) => plan.name.trim().toLowerCase() === pkg.name.trim().toLowerCase());
  const pricing = toPricingBreakdown(pkg, allowPromoPricing);
  const moduleScope = normalizeBillingPackageModuleScope(pkg.module_scope);
  const savingsPercentage = pricing.isPromoActive
    ? pricing.promoSavingsPercentage
    : pricing.discountPercentage > 0
      ? pricing.discountPercentage
      : null;

  return {
    id: pkg.id,
    name: getBillingPackageDisplayName(pkg.name, pkg.module_scope),
    description: toDescription(pkg, allowPromoPricing),
    price: pricing.finalMonthlyPrice,
    period: "/pegawai/bulan",
    features: toFeatures(pkg, legacy?.features || [], allowPromoPricing),
    is_popular: false,
    module_scope: moduleScope,
    original_price:
      pricing.baseMonthlyPrice > pricing.finalMonthlyPrice ? pricing.baseMonthlyPrice : null,
    discount_percentage: savingsPercentage && savingsPercentage > 0 ? savingsPercentage : null,
    duration_months: pricing.durationMonths,
    total_price: pricing.finalTotalPrice,
    total_price_before_discount:
      pricing.baseTotalPrice > pricing.finalTotalPrice ? pricing.baseTotalPrice : null,
    popular_label: null,
    source_package_name: pkg.name,
    source_package_display_name: getBillingPackageDisplayName(pkg.name, pkg.module_scope),
    source_duration_months: pricing.durationMonths,
    commitment_label: buildCommitmentLabel(
      pkg.name,
      pricing.durationMonths,
      pricing.discountPercentage,
      pricing.isPromoActive,
      pricing.promoLabel,
      allowPromoPricing,
    ),
    promo_label: allowPromoPricing ? pricing.promoLabel : null,
    is_promo_active: allowPromoPricing ? pricing.isPromoActive : false,
    campaign_note: campaignNote || null,
  };
};

export const mapSubscriptionPackagesToPricingPlans = (
  packages: BillingPackageLike[],
  legacyPlans: HomepagePricingPlan[] = [],
): HomepagePricingPlan[] => {
  const sortedPackages = [...packages].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return applyPopularMarker(sortedPackages.map((pkg) => mapPackageToPricingPlan(pkg, legacyPlans)));
};

export const mapSubscriptionPackagesToPublicPricingPlans = (
  packages: BillingPackageLike[],
  legacyPlans: HomepagePricingPlan[] = [],
  campaignNote: string | null = null,
): HomepagePricingPlan[] => {
  const attendancePackages = packages.filter(
    (pkg) => normalizeBillingPackageModuleScope(pkg.module_scope) === "attendance",
  );
  return applyPopularMarker(
    attendancePackages.map((pkg) => mapPackageToPricingPlan(pkg, legacyPlans, false, campaignNote)),
  );
};
