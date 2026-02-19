import type { Json } from "@/integrations/supabase/types";

export interface HomepagePricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  features: string[];
  is_popular: boolean;
  original_price?: number | null;
  discount_percentage?: number | null;
  duration_months?: number | null;
  total_price?: number | null;
  total_price_before_discount?: number | null;
  popular_label?: string | null;
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
}

interface PricingBreakdown {
  durationMonths: number;
  discountPercentage: number;
  baseMonthlyPrice: number;
  finalMonthlyPrice: number;
  baseTotalPrice: number;
  finalTotalPrice: number;
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

const clampDiscount = (value: unknown): number => {
  const parsed = toFiniteNumber(value, 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
};

const toPricingBreakdown = (pkg: BillingPackageLike): PricingBreakdown => {
  const durationMonths = Math.max(1, Math.floor(toFiniteNumber(pkg.duration_months, 1)));
  const discountPercentage = clampDiscount(pkg.discount_percentage);
  const baseMonthlyPrice = Math.max(0, Math.round(toFiniteNumber(pkg.base_price_per_month, 0)));
  const finalMonthlyPrice = Math.max(
    0,
    Math.round(baseMonthlyPrice * (1 - discountPercentage / 100))
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
  };
};

const toDescription = (pkg: BillingPackageLike): string => {
  if (pkg.description && pkg.description.trim().length > 0) return pkg.description.trim();
  const { durationMonths, discountPercentage } = toPricingBreakdown(pkg);
  if (discountPercentage > 0) {
    return `Paket ${durationMonths} bulan dengan diskon ${discountPercentage}%`;
  }
  return `Paket langganan ${durationMonths} bulan`;
};

const toFeatures = (pkg: BillingPackageLike, fallback: string[] = []): string[] => {
  const parsed = asStringArray(pkg.features);
  if (parsed.length > 0) return parsed;
  if (fallback.length > 0) return fallback;

  const { durationMonths, discountPercentage } = toPricingBreakdown(pkg);
  const base = [
    `Durasi ${durationMonths} bulan`,
    "Tagihan berbasis jumlah pegawai aktif",
    "Termasuk dukungan dashboard dan laporan",
  ];
  if (discountPercentage > 0) {
    base.unshift(`Diskon paket ${discountPercentage}%`);
  }
  return base;
};

export const mapSubscriptionPackagesToPricingPlans = (
  packages: BillingPackageLike[],
  legacyPlans: HomepagePricingPlan[] = [],
): HomepagePricingPlan[] => {
  const sortedPackages = [...packages].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const mapped = sortedPackages.map((pkg) => {
    const legacy =
      legacyPlans.find((plan) => plan.id === pkg.id) ||
      legacyPlans.find((plan) => plan.name.trim().toLowerCase() === pkg.name.trim().toLowerCase());
    const pricing = toPricingBreakdown(pkg);

    return {
      id: pkg.id,
      name: pkg.name,
      description: toDescription(pkg),
      price: pricing.finalMonthlyPrice,
      period: "/pegawai/bulan",
      features: toFeatures(pkg, legacy?.features || []),
      is_popular: false,
      original_price:
        pricing.discountPercentage > 0 && pricing.baseMonthlyPrice > pricing.finalMonthlyPrice
          ? pricing.baseMonthlyPrice
          : null,
      discount_percentage: pricing.discountPercentage > 0 ? pricing.discountPercentage : null,
      duration_months: pricing.durationMonths,
      total_price: pricing.finalTotalPrice,
      total_price_before_discount:
        pricing.discountPercentage > 0 && pricing.baseTotalPrice > pricing.finalTotalPrice
          ? pricing.baseTotalPrice
          : null,
      popular_label: null,
    };
  });

  if (mapped.length === 0) return mapped;

  const paidPlanIndexes = mapped
    .map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => plan.price > 0);
  const cheapestPaid =
    paidPlanIndexes.length > 0
      ? paidPlanIndexes.reduce((best, current) =>
          current.plan.price < best.plan.price ? current : best
        )
      : null;
  const cheapestIndex = cheapestPaid?.index ?? 0;

  for (let i = 0; i < mapped.length; i += 1) {
    mapped[i] = {
      ...mapped[i],
      is_popular: i === cheapestIndex,
      popular_label: i === cheapestIndex ? "Termurah • Paling Populer" : null,
    };
  }

  return mapped;
};
