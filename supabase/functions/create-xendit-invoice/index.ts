import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateInvoiceRequest {
  tenant_id: string;
  package_id?: string;
  employee_count: number;
  duration_months: number;
  marketing_staff_id?: string;
  description?: string;
  employee_id?: string;
  billing_scope?: "centralized" | "individual";
}

interface BillingSettingRow {
  setting_key: string;
  setting_value: unknown;
}

interface SubscriptionPriceRow {
  price_per_employee: number | null;
  intro_promo_active?: boolean | null;
  intro_promo_price_per_employee?: number | null;
  intro_promo_duration_months?: number | null;
  intro_promo_months_consumed?: number | null;
  intro_promo_label?: string | null;
}

interface ActiveInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_url: string | null;
  status: string;
  gross_amount: number;
  due_date: string;
  payment_method_type: string | null;
  package_id?: string | null;
  package_duration_months?: number | null;
  package_discount_percentage?: number | null;
  discount_amount?: number | null;
  employee_count?: number | null;
  price_per_employee?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface EmployeeRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
}

interface SubscriptionPackageRow {
  id: string;
  name: string;
  duration_months: number;
  discount_percentage: number | null;
  base_price_per_month: number;
  module_scope?: string | null;
  promo_active?: boolean | null;
  promo_price_per_month?: number | null;
  promo_label?: string | null;
}

interface AttendanceIntroPromoConfig {
  active: boolean;
  promoPricePerMonth: number;
  promoDurationMonths: 1 | 2 | 3;
  label: string | null;
  newTenantsOnly: boolean;
}

interface AttendanceIntroPromoState {
  active: boolean;
  promoPricePerEmployee: number | null;
  promoDurationMonths: number;
  promoMonthsConsumed: number;
  label: string | null;
}

interface AttendanceIntroPromoBreakdown {
  active: boolean;
  promoMonthsApplied: number;
  promoMonthsRemainingBeforeInvoice: number;
  promoMonthsRemainingAfterInvoice: number;
  promoPricePerEmployee: number | null;
  promoLabel: string | null;
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  effectiveAveragePricePerEmployee: number;
  monthsConsumedAfterInvoice: number;
  baseMonthlyPrice: number;
  packageDiscountPercentage: number;
  packageDiscountAmount: number;
  discountedNormalMonthlyPrice: number;
  introPromoAdditionalDiscount: number;
}

const normalizePackageScope = (
  raw: unknown,
): "attendance" | "attendance_hr" | "attendance_hr_payroll" => {
  if (raw === "attendance_hr") return "attendance_hr";
  if (raw === "attendance_hr_payroll") return "attendance_hr_payroll";
  return "attendance";
};

const getPackageScopeLabel = (raw: unknown): string => {
  const scope = normalizePackageScope(raw);
  if (scope === "attendance_hr") return "Absensi + HR";
  if (scope === "attendance_hr_payroll") return "Absensi + HR + Payroll";
  return "Absensi";
};

const buildPackageDisplayName = (packageName: string, moduleScope: unknown): string => {
  const safeName = packageName.trim() || "Paket Langganan";
  const scope = normalizePackageScope(moduleScope);
  if (scope === "attendance") return safeName;
  return `${safeName} • ${getPackageScopeLabel(scope)}`;
};

const resolvePromoPackagePricing = (
  pkg: Pick<SubscriptionPackageRow, "base_price_per_month" | "promo_active" | "promo_price_per_month" | "promo_label">,
) => {
  const normalPrice = Math.max(0, parseNumericSetting(pkg.base_price_per_month, 0));
  const promoRequested = pkg.promo_active === true;
  const promoCandidate = promoRequested
    ? Math.max(0, parseNumericSetting(pkg.promo_price_per_month, normalPrice))
    : null;
  const promoActive =
    promoCandidate !== null &&
    Number.isFinite(promoCandidate) &&
    promoCandidate >= 0 &&
    promoCandidate < normalPrice;
  return {
    normalPrice,
    effectivePrice: promoActive ? promoCandidate : normalPrice,
    promoActive,
    promoPrice: promoActive ? promoCandidate : null,
    promoLabel:
      promoActive && typeof pkg.promo_label === "string" && pkg.promo_label.trim().length > 0
        ? pkg.promo_label.trim()
        : null,
  };
};

const parseNumericSetting = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    if ("value" in value) return parseNumericSetting(value.value, fallback);
    if ("amount" in value) return parseNumericSetting(value.amount, fallback);
  }
  return fallback;
};

const parseBooleanSetting = (raw: unknown, fallback: boolean): boolean => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    if ("value" in value) return parseBooleanSetting(value.value, fallback);
    if ("enabled" in value) return parseBooleanSetting(value.enabled, fallback);
  }
  return fallback;
};

const parseTextSetting = (raw: unknown): string | null => {
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    const candidate = value.secret_key;
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
  }
  return null;
};

const BILLING_DURATION_OPTIONS = [1, 3, 6, 12] as const;
const INDIVIDUAL_MIN_DURATION_SETTING_KEY = "individual_min_duration_months";
const INDIVIDUAL_MIN_DURATION_DEFAULT = 6;
const CENTRALIZED_MIN_DURATION_SETTING_KEYS = {
  pemerintah_daerah: "centralized_min_duration_pemerintah_daerah_months",
  instansi_pemerintah: "centralized_min_duration_instansi_pemerintah_months",
  perusahaan: "centralized_min_duration_perusahaan_months",
  sekolah: "centralized_min_duration_sekolah_months",
} as const;
const CENTRALIZED_MIN_DURATION_DEFAULTS = {
  pemerintah_daerah: 12,
  instansi_pemerintah: 1,
  perusahaan: 1,
  sekolah: 6,
} as const;

const normalizeOrganizationType = (
  raw: unknown,
): keyof typeof CENTRALIZED_MIN_DURATION_SETTING_KEYS => {
  if (raw === "pemerintah_daerah") return "pemerintah_daerah";
  if (raw === "instansi_pemerintah") return "instansi_pemerintah";
  if (raw === "sekolah") return "sekolah";
  return "perusahaan";
};

const normalizeDurationOption = (raw: unknown, fallback: number): number => {
  const parsed = Math.floor(parseNumericSetting(raw, fallback));
  if (BILLING_DURATION_OPTIONS.includes(parsed as (typeof BILLING_DURATION_OPTIONS)[number])) {
    return parsed;
  }
  return fallback;
};

const parseBillingScopeFromMetadata = (raw: unknown): "individual" | "centralized" => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "centralized";
  const metadata = raw as Record<string, unknown>;
  return metadata.billing_scope === "individual" ? "individual" : "centralized";
};

const parseEmployeeIdFromMetadata = (raw: unknown): string | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const metadata = raw as Record<string, unknown>;
  return typeof metadata.employee_id === "string" && metadata.employee_id.trim().length > 0
    ? metadata.employee_id.trim()
    : null;
};

const toFiniteNumber = (raw: unknown, fallback = 0): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const roundedAmount = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const amountsAlmostEqual = (left: number, right: number, tolerance = 0.01): boolean =>
  Math.abs(roundedAmount(left) - roundedAmount(right)) <= tolerance;

const ACTIVE_INVOICE_STATUSES = [
  "PENDING",
  "AWAITING_VERIFICATION",
  "AWAITING_VERIFICATION_FULL",
  "PENDING_VERIFICATION_PARTIAL",
  "PARTIALLY_PAID",
  "REJECTED_NEEDS_REVISION",
] as const;

const clampDiscount = (value: unknown): number => {
  const parsed = Math.max(0, parseNumericSetting(value, 0));
  return parsed > 100 ? 100 : parsed;
};

const toOptionalString = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizePromoDuration = (raw: unknown, fallback = 2): 1 | 2 | 3 => {
  const parsed = Math.max(1, Math.floor(parseNumericSetting(raw, fallback)));
  if (parsed >= 3) return 3;
  if (parsed >= 2) return 2;
  return 1;
};

const normalizeAttendanceIntroPromoConfig = (raw: unknown): AttendanceIntroPromoConfig => {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const promoPricePerMonth = Math.max(0, parseNumericSetting(value.promo_price_per_month, 5000));
  return {
    active: parseBooleanSetting(value.active, false) && promoPricePerMonth > 0,
    promoPricePerMonth,
    promoDurationMonths: normalizePromoDuration(value.promo_duration_months, 2),
    label: toOptionalString(value.label),
    newTenantsOnly: parseBooleanSetting(value.new_tenants_only, true),
  };
};

const normalizeAttendanceIntroPromoState = (raw: SubscriptionPriceRow | null | undefined): AttendanceIntroPromoState => {
  const promoDurationMonths = Math.max(0, Math.floor(parseNumericSetting(raw?.intro_promo_duration_months, 0)));
  const promoMonthsConsumed = Math.min(
    promoDurationMonths,
    Math.max(0, Math.floor(parseNumericSetting(raw?.intro_promo_months_consumed, 0))),
  );
  const promoPricePerEmployee = Math.max(0, parseNumericSetting(raw?.intro_promo_price_per_employee, 0));
  return {
    active:
      raw?.intro_promo_active === true &&
      promoDurationMonths > promoMonthsConsumed &&
      promoPricePerEmployee > 0,
    promoPricePerEmployee: promoPricePerEmployee > 0 ? promoPricePerEmployee : null,
    promoDurationMonths,
    promoMonthsConsumed,
    label: toOptionalString(raw?.intro_promo_label),
  };
};

const getAttendanceIntroPromoLabel = (
  input:
    | Pick<AttendanceIntroPromoConfig, "label" | "promoDurationMonths">
    | Pick<AttendanceIntroPromoState, "label" | "promoDurationMonths">,
): string => {
  const label = toOptionalString(input.label);
  if (label) return label;
  return `Promo onboarding ${Math.max(1, Math.floor(input.promoDurationMonths || 2))} bulan pertama`;
};

const calculateAttendanceIntroPromoBreakdown = ({
  baseMonthlyPrice,
  packageDiscountPercentage,
  durationMonths,
  employeeCount,
  promoConfig,
  promoState,
  canInitializePromo,
}: {
  baseMonthlyPrice: number;
  packageDiscountPercentage: number;
  durationMonths: number;
  employeeCount: number;
  promoConfig: AttendanceIntroPromoConfig;
  promoState: AttendanceIntroPromoState;
  canInitializePromo: boolean;
}): AttendanceIntroPromoBreakdown => {
  const safeBaseMonthlyPrice = roundedAmount(Math.max(0, baseMonthlyPrice));
  const safePackageDiscountPercentage = clampDiscount(packageDiscountPercentage);
  const safeDurationMonths = Math.max(1, Math.floor(durationMonths));
  const safeEmployeeCount = Math.max(1, Math.floor(employeeCount));
  const packageDiscountAmount = roundedAmount(
    safeBaseMonthlyPrice * safeEmployeeCount * safeDurationMonths * (safePackageDiscountPercentage / 100),
  );
  const discountedNormalMonthlyPrice = roundedAmount(
    safeBaseMonthlyPrice * (1 - safePackageDiscountPercentage / 100),
  );

  const continuingPromo =
    promoState.active &&
    promoState.promoPricePerEmployee !== null &&
    promoState.promoDurationMonths > promoState.promoMonthsConsumed;
  const initialPromo = !continuingPromo && promoConfig.active && canInitializePromo;

  const promoDurationMonths = continuingPromo ? promoState.promoDurationMonths : initialPromo ? promoConfig.promoDurationMonths : 0;
  const promoPricePerEmployee = continuingPromo
    ? promoState.promoPricePerEmployee
    : initialPromo
      ? promoConfig.promoPricePerMonth
      : null;
  const promoMonthsConsumed = continuingPromo ? promoState.promoMonthsConsumed : 0;
  const promoMonthsRemainingBeforeInvoice = Math.max(0, promoDurationMonths - promoMonthsConsumed);
  const promoMonthsApplied = Math.min(safeDurationMonths, promoMonthsRemainingBeforeInvoice);
  const introPromoAdditionalDiscount = roundedAmount(
    Math.max(0, discountedNormalMonthlyPrice - (promoPricePerEmployee ?? 0)) *
      safeEmployeeCount *
      promoMonthsApplied,
  );
  const subtotal = roundedAmount(safeBaseMonthlyPrice * safeEmployeeCount * safeDurationMonths);
  const discountAmount = roundedAmount(packageDiscountAmount + introPromoAdditionalDiscount);
  const taxableBase = roundedAmount(Math.max(0, subtotal - discountAmount));
  const effectiveAveragePricePerEmployee = roundedAmount(
    taxableBase / (safeEmployeeCount * safeDurationMonths),
  );
  const monthsConsumedAfterInvoice = promoMonthsConsumed + promoMonthsApplied;
  const promoMonthsRemainingAfterInvoice = Math.max(0, promoMonthsRemainingBeforeInvoice - promoMonthsApplied);

  return {
    active: promoMonthsApplied > 0,
    promoMonthsApplied,
    promoMonthsRemainingBeforeInvoice,
    promoMonthsRemainingAfterInvoice,
    promoPricePerEmployee,
    promoLabel: continuingPromo
      ? getAttendanceIntroPromoLabel(promoState)
      : initialPromo
        ? getAttendanceIntroPromoLabel(promoConfig)
        : null,
    subtotal,
    discountAmount,
    taxableBase,
    effectiveAveragePricePerEmployee,
    monthsConsumedAfterInvoice,
    baseMonthlyPrice: safeBaseMonthlyPrice,
    packageDiscountPercentage: safePackageDiscountPercentage,
    packageDiscountAmount,
    discountedNormalMonthlyPrice,
    introPromoAdditionalDiscount,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("create-xendit-invoice");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const xenditSecretKeyFromEnv = Deno.env.get("XENDIT_SECRET_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify(withTrace({ error: "Invalid token" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: CreateInvoiceRequest = await req.json();

    const requestedBillingScope = (body.billing_scope || "").trim().toLowerCase();
    const requestedEmployeeId = (body.employee_id || "").trim();

    // Rate limit: max 10 invoices per hour per tenant / employee scope
    const { tenant_id: reqTenantId } = body;
    if (reqTenantId) {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      let rateLimitQuery = supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", reqTenantId)
        .gte("created_at", oneHourAgo);

      if (requestedEmployeeId) {
        rateLimitQuery = rateLimitQuery.contains("metadata", {
          billing_scope: "individual",
          employee_id: requestedEmployeeId,
        });
      }

      const { count } = await rateLimitQuery;
      if (count !== null && count >= 10) {
        return new Response(
          JSON.stringify(withTrace({ error: "Terlalu banyak invoice dibuat. Coba lagi nanti." }, traceId)),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const { tenant_id, package_id, employee_count, duration_months, marketing_staff_id, description } = body;
    const requestedPackageId = (package_id || "").trim();
    const rawEmployeeCount = Number(employee_count);
    const rawDurationMonths = Number(duration_months);
    const requestedEmployeeCount = Number.isFinite(rawEmployeeCount)
      ? Math.floor(rawEmployeeCount)
      : NaN;
    const requestedDurationMonths = Number.isFinite(rawDurationMonths)
      ? Math.floor(rawDurationMonths)
      : null;

    if (
      !tenant_id ||
      !requestedPackageId ||
      !Number.isFinite(requestedEmployeeCount) ||
      requestedEmployeeCount < 1
    ) {
      return new Response(
        JSON.stringify(withTrace({ error: "Missing required fields" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [{ data: tenant, error: tenantError }, { data: packageDataRaw, error: packageError }] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, code, email, billing_mode, organization_type")
        .eq("id", tenant_id)
        .single(),
      supabase
        .from("subscription_packages")
        .select("id, name, duration_months, discount_percentage, base_price_per_month, module_scope, promo_active, promo_price_per_month, promo_label, is_active")
        .eq("id", requestedPackageId)
        .maybeSingle(),
    ]);

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify(withTrace({ error: "Tenant not found" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (packageError || !packageDataRaw || packageDataRaw.is_active !== true) {
      return new Response(
        JSON.stringify(withTrace({ error: "Paket langganan tidak ditemukan atau nonaktif." }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const packageData = packageDataRaw as SubscriptionPackageRow;
    const packageDisplayName = buildPackageDisplayName(
      packageData.name,
      packageData.module_scope,
    );
    const resolvedDurationMonths = Math.max(1, Math.floor(toFiniteNumber(packageData.duration_months, 1)));

    if (requestedDurationMonths !== null && requestedDurationMonths > 0 && requestedDurationMonths !== resolvedDurationMonths) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: `Durasi harus mengikuti paket ${packageDisplayName} (${resolvedDurationMonths} bulan).`,
              package_duration_months: resolvedDurationMonths,
              requested_duration_months: requestedDurationMonths,
            },
            traceId,
          ),
        ),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tenantIsIndividual = tenant.billing_mode === "individual";
    if (!tenantIsIndividual && requestedBillingScope === "individual") {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: "Tenant ini menggunakan billing terpusat. Scope individual tidak diizinkan.",
              billing_mode: tenant.billing_mode ?? "centralized",
            },
            traceId,
          ),
        ),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resolvedBillingScope: "individual" | "centralized" = tenantIsIndividual ? "individual" : "centralized";
    const isIndividualScope = resolvedBillingScope === "individual";

    let scopedEmployee: EmployeeRow | null = null;
    if (isIndividualScope) {
      if (!requestedEmployeeId) {
        return new Response(
          JSON.stringify(withTrace({ error: "employee_id wajib untuk billing individual" }, traceId)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const [{ data: employee, error: employeeError }, { data: actorRoles, error: roleError }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, tenant_id, user_id, name, email")
          .eq("id", requestedEmployeeId)
          .eq("tenant_id", tenant_id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role, tenant_id")
          .eq("user_id", authData.user.id),
      ]);

      if (employeeError || !employee) {
        return new Response(
          JSON.stringify(withTrace({ error: "Data pegawai untuk billing individual tidak ditemukan" }, traceId)),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (roleError) {
        logTraceError(traceId, "Failed to resolve actor roles for individual billing", roleError);
      }

      const roleRows = (actorRoles || []) as Array<{ role: string; tenant_id: string | null }>;
      const actorIsSuperAdmin = roleRows.some((row) => row.role === "super_admin");
      const actorIsTenantAdmin = roleRows.some(
        (row) => row.role === "admin_instansi" && row.tenant_id === tenant_id,
      );
      const actorOwnsEmployee = employee.user_id === authData.user.id;

      if (!actorIsSuperAdmin && !actorIsTenantAdmin && !actorOwnsEmployee) {
        return new Response(
          JSON.stringify(withTrace({ error: "Forbidden employee scope access" }, traceId)),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      scopedEmployee = employee as EmployeeRow;
    }

    // Get billing settings
    const { data: billingSettings } = await supabase
      .from("billing_settings")
      .select("setting_key, setting_value");

    const settingsRows = (billingSettings ?? []) as BillingSettingRow[];
    const getSettingValue = (key: string): unknown => {
      const setting = settingsRows.find((s) => s.setting_key === key);
      return setting?.setting_value ?? null;
    };

    const xenditEnabled = parseBooleanSetting(getSettingValue("xendit_enabled"), false);
    const xenditSecretKeyFromSettings = parseTextSetting(getSettingValue("xendit_config"));
    const xenditSecretKey = (xenditSecretKeyFromEnv || xenditSecretKeyFromSettings || "").trim();
    const useManualTransferFallback = !xenditEnabled || !xenditSecretKey;
    const manualFallbackCode = !xenditEnabled ? "XENDIT_DISABLED" : "XENDIT_KEY_MISSING";
    const manualFallbackMessage = !xenditEnabled
      ? "Pembayaran online Xendit sedang nonaktif. Invoice dialihkan ke transfer manual."
      : "Konfigurasi Xendit belum lengkap. Invoice dialihkan ke transfer manual.";

    const minimumDurationMonths = (() => {
      if (isIndividualScope) {
        return normalizeDurationOption(
          getSettingValue(INDIVIDUAL_MIN_DURATION_SETTING_KEY),
          INDIVIDUAL_MIN_DURATION_DEFAULT,
        );
      }
      const orgType = normalizeOrganizationType(tenant.organization_type);
      const settingKey = CENTRALIZED_MIN_DURATION_SETTING_KEYS[orgType];
      const fallback = CENTRALIZED_MIN_DURATION_DEFAULTS[orgType];
      return normalizeDurationOption(getSettingValue(settingKey), fallback);
    })();

    if (resolvedDurationMonths < minimumDurationMonths) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: `Durasi minimum pembayaran untuk tenant ini adalah ${minimumDurationMonths} bulan.`,
              minimum_duration_months: minimumDurationMonths,
              requested_duration_months: resolvedDurationMonths,
              billing_mode: tenant.billing_mode ?? "centralized",
              organization_type: tenant.organization_type ?? "perusahaan",
            },
            traceId,
          ),
        ),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const globalFallbackPrice = parseNumericSetting(getSettingValue("price_per_employee"), 15000);
    const ppnPercentage = parseNumericSetting(getSettingValue("vat_percentage"), 11);
    const pphPercentage = parseNumericSetting(getSettingValue("pph_percentage"), 2);
    const internalTaxPercentage = ppnPercentage + pphPercentage;

    const [
      subPriceResult,
      b2bThresholdResult,
      activeEmployeeCountResult,
      paidInvoiceCountResult,
    ] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("price_per_employee, intro_promo_active, intro_promo_price_per_employee, intro_promo_duration_months, intro_promo_months_consumed, intro_promo_label")
        .eq("tenant_id", tenant_id)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("system_settings")
        .select("value")
        .eq("key", "b2b_negotiation_threshold")
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("is_active", true),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("status", "PAID"),
    ]);

    const { data: subPriceRow, error: subPriceError } = subPriceResult;
    if (subPriceError) {
      logTraceError(traceId, "Failed to load subscription negotiated price", subPriceError);
    }
    const subscriptionPricing = (subPriceRow as SubscriptionPriceRow | null) ?? null;
    const negotiatedPrice = subscriptionPricing?.price_per_employee;
    const hasNegotiatedPrice =
      typeof negotiatedPrice === "number" && Number.isFinite(negotiatedPrice) && negotiatedPrice > 0;
    const isCentralizedBilling = tenant.billing_mode !== "individual";
    const attendanceIntroPromoConfig = normalizeAttendanceIntroPromoConfig(
      getSettingValue("attendance_intro_promo"),
    );
    const attendanceIntroPromoState = normalizeAttendanceIntroPromoState(subscriptionPricing);
    const hasPaidTenantInvoice = (paidInvoiceCountResult.count ?? 0) > 0;

    const thresholdRaw = b2bThresholdResult.data?.value;
    const b2bThreshold = Math.max(2001, Math.floor(parseNumericSetting(thresholdRaw, 2000)));
    const activeEmployeeCount = Math.max(0, activeEmployeeCountResult.count ?? 0);
    const effectiveHeadcount = Math.max(activeEmployeeCount, requestedEmployeeCount);
    const isB2BHeadcount = isCentralizedBilling && effectiveHeadcount >= b2bThreshold;
    const canApplyNegotiatedPrice =
      isB2BHeadcount &&
      hasNegotiatedPrice &&
      normalizePackageScope(packageData.module_scope) === "attendance";
    const isB2BManualOnly = isB2BHeadcount;

    if (isB2BManualOnly) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: "Skema B2B wajib pembayaran manual transfer",
              reason: "HEADCOUNT_THRESHOLD",
              billing_mode: tenant.billing_mode ?? "centralized",
              b2b_threshold: b2bThreshold,
              active_employee_count: activeEmployeeCount,
              requested_employee_count: requestedEmployeeCount,
            },
            traceId,
          ),
        ),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const billedEmployeeCount = isIndividualScope ? 1 : requestedEmployeeCount;
    const packageScope = normalizePackageScope(packageData.module_scope);
    const packageBasePricePerEmployee = Math.max(
      0,
      parseNumericSetting(packageData.base_price_per_month, globalFallbackPrice),
    );
    const packageDiscountPercentage = Math.max(
      0,
      parseNumericSetting(packageData.discount_percentage, 0),
    );
    const packagePromoPricing = resolvePromoPackagePricing({
      base_price_per_month: packageBasePricePerEmployee,
      promo_active: packageData.promo_active,
      promo_price_per_month: packageData.promo_price_per_month,
      promo_label: packageData.promo_label,
    });
    const canInitializeAttendanceIntroPromo =
      packageScope === "attendance" &&
      attendanceIntroPromoConfig.active &&
      !canApplyNegotiatedPrice &&
      (!attendanceIntroPromoConfig.newTenantsOnly ||
        (!hasPaidTenantInvoice &&
          attendanceIntroPromoState.promoMonthsConsumed === 0 &&
          !attendanceIntroPromoState.active));

    let subtotal = 0;
    let discountAmount = 0;
    let amountAfterDiscount = 0;
    let pricePerEmployeeForInvoice = 0;
    let subscriptionRecurringPricePerEmployee = 0;
    let storedPackageDiscountPercentage = packageDiscountPercentage;
    let pricingReason: "package_base" | "package_promo" | "negotiated_b2b" | "attendance_intro_promo" =
      "package_base";
    let attendanceIntroPromoMonthsApplied = 0;
    let attendanceIntroPromoMonthsConsumedBeforeInvoice = 0;
    let attendanceIntroPromoMonthsConsumedAfterInvoice = 0;
    let attendanceIntroPromoMonthsRemainingAfterInvoice = 0;
    let attendanceIntroPromoPricePerEmployee: number | null = null;
    let attendanceIntroPromoDurationMonths = 0;
    let attendanceIntroPromoLabel: string | null = null;

    if (canApplyNegotiatedPrice) {
      const negotiatedBasePrice = Number(negotiatedPrice);
      const discountedNegotiatedPrice = roundedAmount(
        negotiatedBasePrice * (1 - packageDiscountPercentage / 100),
      );
      subtotal = roundedAmount(negotiatedBasePrice * billedEmployeeCount * resolvedDurationMonths);
      discountAmount = roundedAmount(subtotal * (packageDiscountPercentage / 100));
      amountAfterDiscount = roundedAmount(Math.max(0, subtotal - discountAmount));
      pricePerEmployeeForInvoice = discountedNegotiatedPrice;
      subscriptionRecurringPricePerEmployee = discountedNegotiatedPrice;
      pricingReason = "negotiated_b2b";
    } else if (packageScope === "attendance") {
      const introPromoBreakdown = calculateAttendanceIntroPromoBreakdown({
        baseMonthlyPrice: packageBasePricePerEmployee,
        packageDiscountPercentage,
        durationMonths: resolvedDurationMonths,
        employeeCount: billedEmployeeCount,
        promoConfig: attendanceIntroPromoConfig,
        promoState: attendanceIntroPromoState,
        canInitializePromo: canInitializeAttendanceIntroPromo,
      });

      subtotal = introPromoBreakdown.subtotal;
      discountAmount = introPromoBreakdown.discountAmount;
      amountAfterDiscount = introPromoBreakdown.taxableBase;
      pricePerEmployeeForInvoice = introPromoBreakdown.effectiveAveragePricePerEmployee;
      subscriptionRecurringPricePerEmployee = introPromoBreakdown.discountedNormalMonthlyPrice;
      pricingReason = introPromoBreakdown.active ? "attendance_intro_promo" : "package_base";
      attendanceIntroPromoMonthsApplied = introPromoBreakdown.promoMonthsApplied;
      attendanceIntroPromoMonthsConsumedBeforeInvoice =
        introPromoBreakdown.promoMonthsRemainingBeforeInvoice > 0
          ? introPromoBreakdown.monthsConsumedAfterInvoice - introPromoBreakdown.promoMonthsApplied
          : attendanceIntroPromoState.promoMonthsConsumed;
      attendanceIntroPromoMonthsConsumedAfterInvoice = introPromoBreakdown.monthsConsumedAfterInvoice;
      attendanceIntroPromoMonthsRemainingAfterInvoice =
        introPromoBreakdown.promoMonthsRemainingAfterInvoice;
      attendanceIntroPromoPricePerEmployee = introPromoBreakdown.promoPricePerEmployee;
      attendanceIntroPromoDurationMonths = attendanceIntroPromoState.active
        ? attendanceIntroPromoState.promoDurationMonths
        : canInitializeAttendanceIntroPromo
          ? attendanceIntroPromoConfig.promoDurationMonths
          : 0;
      attendanceIntroPromoLabel = introPromoBreakdown.promoLabel;
    } else {
      const effectiveDiscountPercentage = packagePromoPricing.promoActive ? 0 : packageDiscountPercentage;
      subtotal = roundedAmount(
        packagePromoPricing.effectivePrice * billedEmployeeCount * resolvedDurationMonths,
      );
      discountAmount = roundedAmount(subtotal * (effectiveDiscountPercentage / 100));
      amountAfterDiscount = roundedAmount(Math.max(0, subtotal - discountAmount));
      pricePerEmployeeForInvoice = roundedAmount(
        packagePromoPricing.effectivePrice * (1 - effectiveDiscountPercentage / 100),
      );
      subscriptionRecurringPricePerEmployee = pricePerEmployeeForInvoice;
      storedPackageDiscountPercentage = effectiveDiscountPercentage;
      pricingReason = packagePromoPricing.promoActive ? "package_promo" : "package_base";
    }

    const ppnAmount = amountAfterDiscount * (ppnPercentage / 100);
    const pphAmount = amountAfterDiscount * (pphPercentage / 100);
    const vatAmount = ppnAmount + pphAmount;
    const grossAmount = amountAfterDiscount + vatAmount;

    const { data: activeInvoiceRows } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, invoice_url, status, gross_amount, due_date, payment_method_type, package_id, package_duration_months, package_discount_percentage, employee_count, price_per_employee, metadata",
      )
      .eq("tenant_id", tenant_id)
      .in("status", [...ACTIVE_INVOICE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(100);

    const existingActive = ((activeInvoiceRows || []) as ActiveInvoiceRow[]).find((row) => {
      const scope = parseBillingScopeFromMetadata(row.metadata);
      if (isIndividualScope) {
        return scope === "individual" && parseEmployeeIdFromMetadata(row.metadata) === requestedEmployeeId;
      }
      return scope !== "individual";
    }) || null;

    const isReusableActiveInvoice = (row: ActiveInvoiceRow | null): boolean => {
      if (!row) return false;
      const rowMetadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      const samePackage = (row.package_id || null) === requestedPackageId;
      const sameDuration = Math.floor(toFiniteNumber(row.package_duration_months, 0)) === resolvedDurationMonths;
      const sameEmployeeCount = Math.floor(toFiniteNumber(row.employee_count, 0)) === billedEmployeeCount;
      const samePrice = amountsAlmostEqual(
        toFiniteNumber(row.price_per_employee, 0),
        pricePerEmployeeForInvoice,
      );
      const sameDiscount = amountsAlmostEqual(
        toFiniteNumber(row.package_discount_percentage, 0),
        storedPackageDiscountPercentage,
      );
      const sameDiscountAmount = amountsAlmostEqual(
        toFiniteNumber(row.discount_amount, 0),
        discountAmount,
      );
      const sameGrossAmount = amountsAlmostEqual(
        toFiniteNumber(row.gross_amount, 0),
        grossAmount,
      );
      const sameRecurringPrice = amountsAlmostEqual(
        toFiniteNumber(rowMetadata?.subscription_recurring_price_per_employee, toFiniteNumber(row.price_per_employee, 0)),
        subscriptionRecurringPricePerEmployee,
      );
      const samePromoMonthsApplied =
        Math.floor(toFiniteNumber(rowMetadata?.attendance_intro_promo_months_applied, 0)) ===
        attendanceIntroPromoMonthsApplied;
      return (
        samePackage &&
        sameDuration &&
        sameEmployeeCount &&
        samePrice &&
        sameDiscount &&
        sameDiscountAmount &&
        sameGrossAmount &&
        sameRecurringPrice &&
        samePromoMonthsApplied
      );
    };

    if (existingActive) {
      if (existingActive.status === "PENDING" || existingActive.status === "AWAITING_VERIFICATION") {
        if (!isReusableActiveInvoice(existingActive)) {
          return new Response(
            JSON.stringify(
              withTrace(
                {
                  success: false,
                  error: "Invoice aktif lama tidak sesuai paket/harga saat ini. Bersihkan invoice aktif lalu buat ulang.",
                  reason: "ACTIVE_INVOICE_PRICING_MISMATCH",
                  active_invoice: {
                    id: existingActive.id,
                    invoice_number: existingActive.invoice_number,
                    status: existingActive.status,
                    payment_method_type: existingActive.payment_method_type,
                    due_date: existingActive.due_date,
                    package_id: existingActive.package_id ?? null,
                    package_duration_months: existingActive.package_duration_months ?? null,
                    employee_count: existingActive.employee_count ?? null,
                    price_per_employee: existingActive.price_per_employee ?? null,
                    package_discount_percentage: existingActive.package_discount_percentage ?? null,
                  },
                  expected_invoice: {
                    package_id: requestedPackageId,
                    package_duration_months: resolvedDurationMonths,
                    employee_count: billedEmployeeCount,
                    price_per_employee: roundedAmount(pricePerEmployeeForInvoice),
                    package_discount_percentage: roundedAmount(storedPackageDiscountPercentage),
                  },
                },
                traceId,
              ),
            ),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            reused: true,
            invoice: {
              id: existingActive.id,
              invoice_number: existingActive.invoice_number,
              invoice_url: existingActive.invoice_url,
              gross_amount: existingActive.gross_amount,
              due_date: existingActive.due_date,
              payment_method_type: existingActive.payment_method_type,
            },
            fallback_payment_method:
              existingActive.payment_method_type === "MANUAL_TRANSFER" ? "MANUAL_TRANSFER" : null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: false,
              error: `Masih ada invoice aktif (${existingActive.invoice_number}) yang harus diselesaikan terlebih dahulu.`,
              active_invoice: {
                id: existingActive.id,
                invoice_number: existingActive.invoice_number,
                status: existingActive.status,
                payment_method_type: existingActive.payment_method_type,
                due_date: existingActive.due_date,
              },
            },
            traceId,
          ),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Estimate Xendit fee (VA: Rp 4,000, QR: 0.7%, Cards: 2.9%)
    const xenditFee = Math.round(grossAmount * 0.01 + 4000); // Simplified estimation
    const netAmount = grossAmount - xenditFee - vatAmount;

    // Generate invoice number
    const { data: invoiceNumber } = await supabase.rpc("generate_invoice_number");
    const resolvedInvoiceNumber = typeof invoiceNumber === "string" ? invoiceNumber.trim() : "";
    if (!resolvedInvoiceNumber) {
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to generate invoice number" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create external_id for Xendit
    const externalId = `${resolvedInvoiceNumber}-${Date.now()}`;

    // Calculate due date (3 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateIso = dueDate.toISOString().slice(0, 10);

    // Reserve invoice row first to prevent duplicate active invoice creation race
    const { data: reservedInvoice, error: reserveError } = await supabase
      .from("invoices")
      .insert({
        tenant_id,
        invoice_number: resolvedInvoiceNumber,
        external_id: useManualTransferFallback ? null : externalId,
        package_id: requestedPackageId,
        package_name: packageDisplayName,
        package_duration_months: resolvedDurationMonths,
        package_discount_percentage: storedPackageDiscountPercentage,
        employee_count: billedEmployeeCount,
        price_per_employee: pricePerEmployeeForInvoice,
        subtotal,
        discount_amount: discountAmount,
        vat_percentage: internalTaxPercentage,
        vat_amount: vatAmount,
        ppn_percentage: ppnPercentage,
        pph_percentage: pphPercentage,
        ppn_amount: ppnAmount,
        pph_amount: pphAmount,
        gross_amount: grossAmount,
        xendit_fee: useManualTransferFallback ? 0 : xenditFee,
        net_amount: useManualTransferFallback ? grossAmount : netAmount,
        status: "PENDING",
        payment_method_type: useManualTransferFallback ? "MANUAL_TRANSFER" : "XENDIT",
        due_date: dueDateIso,
        marketing_staff_id: marketing_staff_id || null,
        notes: description || null,
        metadata: isIndividualScope
          ? {
              billing_scope: "individual",
              employee_id: requestedEmployeeId,
              employee_user_id: scopedEmployee?.user_id || null,
              package_scope: normalizePackageScope(packageData.module_scope),
              package_display_name: packageDisplayName,
              package_base_price_per_employee: packageBasePricePerEmployee,
              package_discounted_normal_price_per_employee: subscriptionRecurringPricePerEmployee,
              package_promo_active: packageScope !== "attendance" ? packagePromoPricing.promoActive : false,
              package_promo_price_per_employee: packageScope !== "attendance" ? packagePromoPricing.promoPrice : null,
              package_promo_label: packageScope !== "attendance" ? packagePromoPricing.promoLabel : null,
              package_effective_price_reason: pricingReason,
              subscription_recurring_price_per_employee: subscriptionRecurringPricePerEmployee,
              attendance_intro_promo_active: attendanceIntroPromoMonthsApplied > 0,
              attendance_intro_promo_price_per_employee: attendanceIntroPromoPricePerEmployee,
              attendance_intro_promo_duration_months: attendanceIntroPromoDurationMonths || null,
              attendance_intro_promo_months_applied: attendanceIntroPromoMonthsApplied,
              attendance_intro_promo_months_consumed_before_invoice:
                attendanceIntroPromoMonthsConsumedBeforeInvoice,
              attendance_intro_promo_months_consumed_after_invoice:
                attendanceIntroPromoMonthsConsumedAfterInvoice,
              attendance_intro_promo_months_remaining_after_invoice:
                attendanceIntroPromoMonthsRemainingAfterInvoice,
              attendance_intro_promo_label: attendanceIntroPromoLabel,
              ...(useManualTransferFallback
                ? {
                    fallback_payment_method: "MANUAL_TRANSFER",
                    fallback_reason: manualFallbackCode,
                  }
                : {}),
            }
          : {
              billing_scope: "centralized",
              billing_origin: !hasPaidTenantInvoice ? "activation_early" : null,
              billing_headcount_mode_after_payment: "manual_contract",
              contracted_employee_count_after_payment: billedEmployeeCount,
              employee_count_source: "manual_contract",
              active_employee_count_at_invoice: activeEmployeeCount,
              package_scope: normalizePackageScope(packageData.module_scope),
              package_display_name: packageDisplayName,
              package_base_price_per_employee: packageBasePricePerEmployee,
              package_discounted_normal_price_per_employee: subscriptionRecurringPricePerEmployee,
              package_promo_active: packageScope !== "attendance" ? packagePromoPricing.promoActive : false,
              package_promo_price_per_employee: packageScope !== "attendance" ? packagePromoPricing.promoPrice : null,
              package_promo_label: packageScope !== "attendance" ? packagePromoPricing.promoLabel : null,
              package_effective_price_reason: pricingReason,
              subscription_recurring_price_per_employee: subscriptionRecurringPricePerEmployee,
              attendance_intro_promo_active: attendanceIntroPromoMonthsApplied > 0,
              attendance_intro_promo_price_per_employee: attendanceIntroPromoPricePerEmployee,
              attendance_intro_promo_duration_months: attendanceIntroPromoDurationMonths || null,
              attendance_intro_promo_months_applied: attendanceIntroPromoMonthsApplied,
              attendance_intro_promo_months_consumed_before_invoice:
                attendanceIntroPromoMonthsConsumedBeforeInvoice,
              attendance_intro_promo_months_consumed_after_invoice:
                attendanceIntroPromoMonthsConsumedAfterInvoice,
              attendance_intro_promo_months_remaining_after_invoice:
                attendanceIntroPromoMonthsRemainingAfterInvoice,
              attendance_intro_promo_label: attendanceIntroPromoLabel,
              ...(useManualTransferFallback
                ? {
                    fallback_payment_method: "MANUAL_TRANSFER",
                    fallback_reason: manualFallbackCode,
                  }
                : {}),
            },
      })
      .select("id, invoice_number, gross_amount, due_date, payment_method_type, invoice_url")
      .single();

    if (reserveError) {
      const isUniqueActiveViolation =
        reserveError.code === "23505" ||
        (reserveError.message ?? "").includes("idx_invoices_one_active_per_tenant_unique");

      if (isUniqueActiveViolation) {
        const { data: latestActiveRows } = await supabase
          .from("invoices")
          .select(
            "id, invoice_number, invoice_url, status, gross_amount, due_date, payment_method_type, package_id, package_duration_months, package_discount_percentage, employee_count, price_per_employee, metadata",
          )
          .eq("tenant_id", tenant_id)
          .in("status", [...ACTIVE_INVOICE_STATUSES])
          .order("created_at", { ascending: false })
          .limit(100);

        const reusedInvoice = ((latestActiveRows || []) as ActiveInvoiceRow[]).find((row) => {
          const scope = parseBillingScopeFromMetadata(row.metadata);
          if (isIndividualScope) {
            return scope === "individual" && parseEmployeeIdFromMetadata(row.metadata) === requestedEmployeeId;
          }
          return scope !== "individual";
        }) || null;
        if (reusedInvoice?.status === "PENDING" || reusedInvoice?.status === "AWAITING_VERIFICATION") {
          if (!isReusableActiveInvoice(reusedInvoice)) {
            return new Response(
              JSON.stringify(
                withTrace(
                  {
                    success: false,
                    error: "Invoice aktif lama tidak sesuai paket/harga saat ini. Bersihkan invoice aktif lalu buat ulang.",
                    reason: "ACTIVE_INVOICE_PRICING_MISMATCH",
                    active_invoice: {
                      id: reusedInvoice.id,
                      invoice_number: reusedInvoice.invoice_number,
                      status: reusedInvoice.status,
                      payment_method_type: reusedInvoice.payment_method_type,
                      due_date: reusedInvoice.due_date,
                      package_id: reusedInvoice.package_id ?? null,
                      package_duration_months: reusedInvoice.package_duration_months ?? null,
                      employee_count: reusedInvoice.employee_count ?? null,
                      price_per_employee: reusedInvoice.price_per_employee ?? null,
                      package_discount_percentage: reusedInvoice.package_discount_percentage ?? null,
                    },
                    expected_invoice: {
                      package_id: requestedPackageId,
                      package_duration_months: resolvedDurationMonths,
                      employee_count: billedEmployeeCount,
                      price_per_employee: roundedAmount(pricePerEmployeeForInvoice),
                      package_discount_percentage: roundedAmount(storedPackageDiscountPercentage),
                    },
                  },
                  traceId,
                ),
              ),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              reused: true,
              invoice: {
                id: reusedInvoice.id,
                invoice_number: reusedInvoice.invoice_number,
                invoice_url: reusedInvoice.invoice_url,
                gross_amount: reusedInvoice.gross_amount,
                due_date: reusedInvoice.due_date,
                payment_method_type: reusedInvoice.payment_method_type,
              },
              fallback_payment_method:
                reusedInvoice.payment_method_type === "MANUAL_TRANSFER" ? "MANUAL_TRANSFER" : null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify(
            withTrace(
              {
                success: false,
                error: "Invoice aktif sudah tersedia. Selesaikan invoice aktif terlebih dahulu.",
                active_invoice: reusedInvoice
                  ? {
                      id: reusedInvoice.id,
                      invoice_number: reusedInvoice.invoice_number,
                      status: reusedInvoice.status,
                      payment_method_type: reusedInvoice.payment_method_type,
                      due_date: reusedInvoice.due_date,
                    }
                  : null,
              },
              traceId,
            ),
          ),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      logTraceError(traceId, "Database reserve error", reserveError);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to reserve invoice", details: reserveError.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (useManualTransferFallback) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: true,
              reused: false,
              fallback_payment_method: "MANUAL_TRANSFER",
              fallback_code: manualFallbackCode,
              message: manualFallbackMessage,
              invoice: {
                id: reservedInvoice.id,
                invoice_number: reservedInvoice.invoice_number,
                invoice_url: reservedInvoice.invoice_url,
                gross_amount: reservedInvoice.gross_amount,
                due_date: reservedInvoice.due_date,
                payment_method_type: reservedInvoice.payment_method_type,
              },
            },
            traceId,
          ),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create Xendit invoice
    const xenditResponse = await fetch("https://api.xendit.co/v2/invoices", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(xenditSecretKey + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: externalId,
        amount: grossAmount,
        payer_email: scopedEmployee?.email || authData.user.email || tenant.email,
        description:
          description ||
          `Langganan ${packageDisplayName} - ${resolvedDurationMonths} bulan untuk ${billedEmployeeCount} pegawai`,
        invoice_duration: 259200, // 3 days in seconds
        customer: {
          given_names: scopedEmployee?.name || tenant.name,
          email: scopedEmployee?.email || authData.user.email || tenant.email,
        },
        success_redirect_url: `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl}/org?payment=success`,
        failure_redirect_url: `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl}/org?payment=failed`,
        currency: "IDR",
        items: [
          {
            name: `Langganan ${packageDisplayName} (${resolvedDurationMonths} bulan)`,
            quantity: 1,
            price: grossAmount,
          },
        ],
      }),
    });

    if (!xenditResponse.ok) {
      const xenditError = await xenditResponse.text();
      logTraceError(traceId, "Xendit error", xenditError);
      await supabase
        .from("invoices")
        .update({
          status: "CANCELLED",
          notes: `${description || ""}\n[AUTO] Xendit invoice creation failed`,
        })
        .eq("id", reservedInvoice.id);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to create Xendit invoice", details: xenditError }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const xenditInvoice = await xenditResponse.json();

    // Attach external checkout URL to reserved invoice
    const { data: invoice, error: invoiceUpdateError } = await supabase
      .from("invoices")
      .update({
        invoice_url: xenditInvoice.invoice_url,
      })
      .eq("id", reservedInvoice.id)
      .select("id, invoice_number, gross_amount, due_date")
      .single();

    if (invoiceUpdateError) {
      logTraceError(traceId, "Database update error", invoiceUpdateError);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to finalize invoice", details: invoiceUpdateError.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the payment attempt
    await supabase.from("payment_logs").insert({
      invoice_id: invoice.id,
      event_type: "INVOICE_CREATED",
      payload: {
        xendit_id: xenditInvoice.id,
        external_id: externalId,
        amount: grossAmount,
        invoice_url: xenditInvoice.invoice_url,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_url: xenditInvoice.invoice_url,
          gross_amount: invoice.gross_amount,
          due_date: invoice.due_date,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Unhandled error", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify(withTrace({ error: "Internal server error", details: errorMessage }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
