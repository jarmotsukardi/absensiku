import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CreditCard,
  CheckCircle2,
  Copy,
  Loader2,
  Receipt,
  AlertTriangle,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  getBillingPackageDisplayName,
  isAttendanceOnlyBillingPackage,
  normalizeBillingPackageModuleScope,
} from "@/lib/billingPackageScope";
import {
  getBillingPackageEffectiveDiscountPercentage,
  getBillingPackageEffectivePricePerMonth,
  getBillingPackagePromoLabel,
  isBillingPackagePromoActive,
} from "@/lib/billingPackagePricing";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { ACTIVE_INVOICE_STATUSES, isActiveInvoiceStatus } from "@/lib/billingGuards";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  calculateAttendanceIntroPromoBreakdown,
  getAttendanceIntroPromoCampaignText,
  normalizeAttendanceIntroPromoConfig,
  normalizeAttendanceIntroPromoState,
  type AttendanceIntroPromoConfig,
} from "@/lib/attendanceOnboardingPromo";

type SubscriptionPackage = Tables<"subscription_packages">;
type Subscription = Tables<"subscriptions">;

interface BillingSettingsValue {
  bank_name?: string;
  bank_account?: string;
  bank_account_name?: string;
}

interface CreateOrGetManualInvoiceResult {
  id: string;
  invoice_number: string;
  gross_amount: number;
  status: string;
  due_date: string;
  payment_method_type: string;
  unique_code: number;
  reused: boolean;
  wallet_applied?: boolean;
  wallet_apply?: {
    applied?: boolean;
    wallet_balance_after?: number;
    [key: string]: unknown;
  };
}

const PPN_PERCENTAGE = 11;
const PPH_PERCENTAGE = 2;
const INTERNAL_TAX_PERCENTAGE = PPN_PERCENTAGE + PPH_PERCENTAGE;
const MANUAL_PAYMENT_OP_TIMEOUT_MS = 15000;
const MANUAL_PAYMENT_OP_RETRY_MAX = 1;

interface ActiveManualInvoiceSnapshot {
  id: string;
  invoice_number: string;
  status: string;
  due_date: string;
  gross_amount: number;
}

interface ActiveManualInvoiceQueryRow extends ActiveManualInvoiceSnapshot {
  metadata?: unknown;
}

interface BillingSettingRow {
  setting_key: string;
  setting_value: unknown;
}

const parseNumericSettingValue = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    if ("value" in value) return parseNumericSettingValue(value.value, fallback);
    if ("amount" in value) return parseNumericSettingValue(value.amount, fallback);
  }
  return fallback;
};

const toJsonObject = (value: Json | null | undefined): Record<string, Json> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, Json>;
};

const parseInvoiceBillingScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const raw = metadata as Record<string, unknown>;
  return raw.billing_scope === "individual" ? "individual" : "centralized";
};

interface ManualPaymentFlowProps {
  tenantId: string;
  tenantName: string;
  currentEmployeeCount: number;
  subscriptionId?: string;
  initialPackageId?: string;
  initialEmployeeCount?: number;
}

export function ManualPaymentFlow({
  tenantId,
  tenantName,
  currentEmployeeCount,
  subscriptionId,
  initialPackageId,
  initialEmployeeCount,
}: ManualPaymentFlowProps) {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [employeeCount, setEmployeeCount] = useState(currentEmployeeCount || 5);
  const [prefilledPackage, setPrefilledPackage] = useState(false);
  const [prefilledEmployeeCount, setPrefilledEmployeeCount] = useState(false);
  const [flashPrefilledPackage, setFlashPrefilledPackage] = useState(false);
  const [flashPrefilledEmployeeCount, setFlashPrefilledEmployeeCount] = useState(false);
  const [negotiatedPricePerEmployee, setNegotiatedPricePerEmployee] = useState<number | null>(null);
  const [isCentralizedBilling, setIsCentralizedBilling] = useState(true);
  const [b2bThreshold, setB2bThreshold] = useState(2001);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [attendanceIntroPromoConfig, setAttendanceIntroPromoConfig] = useState<AttendanceIntroPromoConfig | null>(null);
  const [attendanceIntroPromoCampaignText, setAttendanceIntroPromoCampaignText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingActiveInvoice, setIsCheckingActiveInvoice] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<ActiveManualInvoiceSnapshot | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    invoiceNumber: string;
    totalAmount: number;
    uniqueCode: number;
    finalAmount: number;
    bankInfo: { bank: string; account: string; name: string };
  } | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const subscriptionPricePromise = subscriptionId
        ? supabase
            .from("subscriptions")
            .select(
              "id, price_per_employee, status, billing_headcount_mode, contracted_employee_count, intro_promo_active, intro_promo_duration_months, intro_promo_label, intro_promo_months_consumed, intro_promo_price_per_employee, intro_promo_started_at",
            )
            .eq("id", subscriptionId)
            .maybeSingle()
        : supabase
            .from("subscriptions")
            .select(
              "id, price_per_employee, status, billing_headcount_mode, contracted_employee_count, intro_promo_active, intro_promo_duration_months, intro_promo_label, intro_promo_months_consumed, intro_promo_price_per_employee, intro_promo_started_at",
            )
            .eq("tenant_id", tenantId)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

      const [{ data, error }, subscriptionRes, tenantRes, promoRes, b2bThresholdRes] = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              Promise.all([
                supabase.from("subscription_packages").select("*").eq("is_active", true).order("sort_order"),
                subscriptionPricePromise,
                supabase.from("tenants").select("billing_mode, organization_type").eq("id", tenantId).maybeSingle(),
                supabase
                  .from("billing_settings")
                  .select("setting_key, setting_value")
                  .eq("setting_key", "attendance_intro_promo")
                  .maybeSingle(),
                supabase
                  .from("system_settings")
                  .select("value")
                  .eq("key", "b2b_negotiation_threshold")
                  .maybeSingle(),
              ]),
            MANUAL_PAYMENT_OP_TIMEOUT_MS,
            "org.activation.manual_payment.fetch_packages timeout",
          ),
        {
          maxRetries: MANUAL_PAYMENT_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );

      if (error) throw error;
      if (tenantRes.error) throw tenantRes.error;
      if (subscriptionRes.error) {
        console.warn("Failed to load subscription negotiated price:", subscriptionRes.error);
      }
      const isCentralized = tenantRes.data?.billing_mode !== "individual";
      const resolvedB2bThreshold = Math.max(
        2001,
        Math.floor(parseNumericSettingValue(b2bThresholdRes.data?.value, 2000)),
      );
      const isB2BEligible = isCentralized && currentEmployeeCount >= resolvedB2bThreshold;
      setIsCentralizedBilling(isCentralized);
      setB2bThreshold(resolvedB2bThreshold);
      const promoConfig = normalizeAttendanceIntroPromoConfig((promoRes.data as BillingSettingRow | null)?.setting_value);
      setAttendanceIntroPromoConfig(promoConfig.active ? promoConfig : null);
      setAttendanceIntroPromoCampaignText(getAttendanceIntroPromoCampaignText(promoConfig));
      const availablePackages = (data || []) as SubscriptionPackage[];
      setPackages(availablePackages);
      const resolvedSubscription = (subscriptionRes.data as Subscription | null) || null;
      setSubscription(resolvedSubscription);
      if (!prefilledEmployeeCount) {
        const contractedEmployeeCount =
          resolvedSubscription?.billing_headcount_mode === "manual_contract" &&
          typeof resolvedSubscription?.contracted_employee_count === "number" &&
          Number.isFinite(resolvedSubscription.contracted_employee_count) &&
          resolvedSubscription.contracted_employee_count > 0
            ? Math.floor(resolvedSubscription.contracted_employee_count)
            : null;
        if (contractedEmployeeCount) {
          setEmployeeCount(contractedEmployeeCount);
        }
      }
      if (availablePackages.length > 0) {
        const initialPkgIsValid =
          Boolean(initialPackageId) && availablePackages.some((pkg) => pkg.id === initialPackageId);
        setSelectedPackage((prev) => {
          if (initialPkgIsValid) return initialPackageId as string;
          if (availablePackages.some((pkg) => pkg.id === prev)) return prev;
          return availablePackages[0].id;
        });
        setPrefilledPackage(initialPkgIsValid);
      } else {
        setSelectedPackage("");
        setPrefilledPackage(false);
      }
      if (!subscriptionRes.error) {
        const rawPrice = subscriptionRes.data?.price_per_employee;
        const parsedPrice =
          typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0
            ? rawPrice
            : null;
        setNegotiatedPricePerEmployee(isB2BEligible ? parsedPrice : null);
      }
    } catch (error) {
      const errorRef = reportError(error, "org.activation.manual_payment.fetch_packages", {
        tenant_id: tenantId,
        subscription_id: subscriptionId || null,
      });
      toast.error(appendErrorReference("Gagal memuat paket langganan", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [currentEmployeeCount, initialPackageId, prefilledEmployeeCount, subscriptionId, tenantId]);

  useEffect(() => {
    void fetchPackages();
  }, [fetchPackages]);

  const fetchActiveInvoice = useCallback(async () => {
    setIsCheckingActiveInvoice(true);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              supabase
                .from("invoices")
                .select("id, invoice_number, status, due_date, gross_amount, metadata")
                .eq("tenant_id", tenantId)
                .in("status", [...ACTIVE_INVOICE_STATUSES])
                .order("created_at", { ascending: false })
                .limit(100),
            MANUAL_PAYMENT_OP_TIMEOUT_MS,
          ),
        {
          maxRetries: MANUAL_PAYMENT_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );

      if (error) throw error;
      const latestCentralized =
        ((data || []) as ActiveManualInvoiceQueryRow[]).find(
          (invoice) => parseInvoiceBillingScope(invoice.metadata) !== "individual",
        ) || null;
      setActiveInvoice(
        latestCentralized
          ? {
              id: latestCentralized.id,
              invoice_number: latestCentralized.invoice_number,
              status: latestCentralized.status,
              due_date: latestCentralized.due_date,
              gross_amount: latestCentralized.gross_amount,
            }
          : null,
      );
    } catch (error) {
      const errorRef = reportError(error, "org.activation.manual_payment.fetch_active_invoice", {
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal memeriksa invoice aktif", errorRef));
      setActiveInvoice(null);
    } finally {
      setIsCheckingActiveInvoice(false);
    }
  }, [tenantId]);

  const checkLatestActiveInvoice = useCallback(async (): Promise<ActiveManualInvoiceSnapshot | null> => {
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              supabase
                .from("invoices")
                .select("id, invoice_number, status, due_date, gross_amount, metadata")
                .eq("tenant_id", tenantId)
                .in("status", [...ACTIVE_INVOICE_STATUSES])
                .order("created_at", { ascending: false })
                .limit(100),
            MANUAL_PAYMENT_OP_TIMEOUT_MS,
          ),
        {
          maxRetries: MANUAL_PAYMENT_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );
      if (error) throw error;
      const latestCentralized =
        ((data || []) as ActiveManualInvoiceQueryRow[]).find(
          (invoice) => parseInvoiceBillingScope(invoice.metadata) !== "individual",
        ) || null;
      const latest =
        latestCentralized
          ? {
              id: latestCentralized.id,
              invoice_number: latestCentralized.invoice_number,
              status: latestCentralized.status,
              due_date: latestCentralized.due_date,
              gross_amount: latestCentralized.gross_amount,
            }
          : null;
      setActiveInvoice(latest);
      return latest;
    } catch (error) {
      reportError(error, "org.activation.manual_payment.check_latest_active_invoice", { tenant_id: tenantId });
      return null;
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchActiveInvoice();
  }, [fetchActiveInvoice]);

  useEffect(() => {
    if (!initialPackageId || packages.length === 0) return;
    if (packages.some((pkg) => pkg.id === initialPackageId)) {
      setSelectedPackage(initialPackageId);
      setPrefilledPackage(true);
    }
  }, [initialPackageId, packages]);

  useEffect(() => {
    if (typeof initialEmployeeCount !== "number" || !Number.isFinite(initialEmployeeCount)) return;
    setEmployeeCount(Math.max(1, Math.floor(initialEmployeeCount)));
    setPrefilledEmployeeCount(true);
  }, [initialEmployeeCount]);

  useEffect(() => {
    if (!prefilledPackage) return;
    setFlashPrefilledPackage(true);
    const timer = window.setTimeout(() => setFlashPrefilledPackage(false), 1200);
    return () => window.clearTimeout(timer);
  }, [prefilledPackage, selectedPackage]);

  useEffect(() => {
    if (!prefilledEmployeeCount) return;
    setFlashPrefilledEmployeeCount(true);
    const timer = window.setTimeout(() => setFlashPrefilledEmployeeCount(false), 1200);
    return () => window.clearTimeout(timer);
  }, [prefilledEmployeeCount, employeeCount]);

  const getSelectedPackageData = () => packages.find((p) => p.id === selectedPackage);
  const getSelectedPackageLabel = (pkg: SubscriptionPackage | null | undefined) =>
    pkg ? getBillingPackageDisplayName(pkg.name, pkg.module_scope) : "Paket Langganan";

  const calculateTotal = () => {
    const pkg = getSelectedPackageData();
    if (!pkg) {
      return {
        unitPrice: 0,
        subtotal: 0,
        discount: 0,
        baseAmount: 0,
        internalTaxAmount: 0,
        total: 0,
        recurringPricePerEmployee: 0,
        pricingReason: "package_base" as const,
        promoBreakdown: null as ReturnType<typeof calculateAttendanceIntroPromoBreakdown> | null,
      };
    }

    const canUseNegotiatedPrice =
      negotiatedPricePerEmployee !== null && isAttendanceOnlyBillingPackage(pkg);
    const currentPromoState = normalizeAttendanceIntroPromoState(subscription || undefined);
    const promoBreakdown =
      isAttendanceOnlyBillingPackage(pkg) && attendanceIntroPromoConfig && !canUseNegotiatedPrice
        ? calculateAttendanceIntroPromoBreakdown({
            normalPricePerEmployee: pkg.base_price_per_month,
            packageDiscountPercentage: pkg.discount_percentage,
            durationMonths: pkg.duration_months,
            employeeCount,
            promoConfig: attendanceIntroPromoConfig,
            promoState: subscription || undefined,
            canInitializePromo:
              !subscription ||
              (!currentPromoState.intro_promo_active && currentPromoState.intro_promo_months_consumed === 0),
          })
        : null;

    if (promoBreakdown) {
      const internalTaxAmount = Math.round(promoBreakdown.taxableBase * (INTERNAL_TAX_PERCENTAGE / 100));
      const total = promoBreakdown.taxableBase + internalTaxAmount;
      return {
        unitPrice: promoBreakdown.effectiveAveragePricePerEmployee,
        subtotal: promoBreakdown.subtotal,
        discount: promoBreakdown.discountAmount,
        baseAmount: promoBreakdown.taxableBase,
        internalTaxAmount,
        total,
        recurringPricePerEmployee: promoBreakdown.discountedNormalPricePerEmployee,
        pricingReason: "attendance_intro_promo" as const,
        promoBreakdown,
      };
    }

    const baseUnitPrice = canUseNegotiatedPrice
      ? negotiatedPricePerEmployee
      : getBillingPackageEffectivePricePerMonth(pkg, pkg.base_price_per_month);
    const effectiveDiscountPercentage = getBillingPackageEffectiveDiscountPercentage(pkg);
    const subtotal = baseUnitPrice * employeeCount * pkg.duration_months;
    const discount = subtotal * (effectiveDiscountPercentage / 100);
    const baseAmount = subtotal - discount;
    const internalTaxAmount = Math.round(baseAmount * (INTERNAL_TAX_PERCENTAGE / 100));
    const total = baseAmount + internalTaxAmount;
    const unitPrice = baseAmount / Math.max(1, employeeCount * pkg.duration_months);
    const recurringPricePerEmployee =
      baseUnitPrice * (1 - effectiveDiscountPercentage / 100);
    return {
      unitPrice,
      subtotal,
      discount,
      baseAmount,
      internalTaxAmount,
      total,
      recurringPricePerEmployee,
      pricingReason: canUseNegotiatedPrice ? "negotiated_b2b" as const : "package_base" as const,
      promoBreakdown: null,
    };
  };

  const generateUniqueCode = () => {
    return Math.floor(Math.random() * 900) + 100;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);

  const isTrialSubscription = subscription?.status === "trial";
  const invoiceActionTitle = isTrialSubscription
    ? "Aktivasi Awal (Buat Invoice)"
    : "Buat Invoice";
  const invoiceActionDescription = isTrialSubscription
    ? "Gunakan langkah ini jika organisasi sudah siap berlangganan sebelum invoice otomatis dari trial dan streak diterbitkan."
    : "Pilih paket untuk membuat invoice, lalu konfirmasi pembayaran setelah transfer.";

  const handleInitiatePayment = async () => {
    const latestActive = await checkLatestActiveInvoice();
    if (latestActive && isActiveInvoiceStatus(latestActive.status)) {
      toast.info(`Invoice aktif ${latestActive.invoice_number} masih berjalan. Selesaikan invoice tersebut terlebih dahulu.`);
      navigate(`/org/billing?menu=invoices&invoice=${encodeURIComponent(latestActive.invoice_number)}&focus=payment-proof`);
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleSubmitPayment = async () => {
    const pkg = getSelectedPackageData();
    if (!pkg) return;

    setIsSubmitting(true);
    try {
      const latestActive = await checkLatestActiveInvoice();
      if (latestActive && isActiveInvoiceStatus(latestActive.status)) {
        toast.info(`Invoice aktif ${latestActive.invoice_number} masih berjalan. Selesaikan invoice tersebut terlebih dahulu.`);
        navigate(`/org/billing?menu=invoices&invoice=${encodeURIComponent(latestActive.invoice_number)}&focus=payment-proof`);
        return;
      }

      const totalBreakdown = calculateTotal();
      const {
        unitPrice,
        subtotal,
        discount,
        total,
        internalTaxAmount,
        promoBreakdown,
        recurringPricePerEmployee,
        pricingReason,
      } = totalBreakdown;
      const proposedUniqueCode = generateUniqueCode();
      const proposedFinalAmount = total + proposedUniqueCode;
      const invoiceMetadata: Json = {
        billing_scope: "centralized",
        source: "org.manual_payment_flow",
        billing_origin: isTrialSubscription ? "activation_early" : null,
        billing_headcount_mode_after_payment: "manual_contract",
        contracted_employee_count_after_payment: employeeCount,
        employee_count_source: "manual_contract",
        active_employee_count_at_invoice: currentEmployeeCount,
        tenant_id: tenantId,
        subscription_id: subscription?.id || subscriptionId || null,
        package_scope: normalizeBillingPackageModuleScope(pkg.module_scope),
        package_display_name: getSelectedPackageLabel(pkg),
        package_base_price_per_employee: pkg.base_price_per_month,
        package_discounted_normal_price_per_employee: recurringPricePerEmployee,
        package_effective_price_reason: pricingReason,
        subscription_recurring_price_per_employee: recurringPricePerEmployee,
        attendance_intro_promo: promoBreakdown
          ? {
              active: promoBreakdown.introPromoActive,
              label: promoBreakdown.promoLabel,
              promo_price_per_employee: promoBreakdown.promoPricePerEmployee,
              promo_months_applied: promoBreakdown.promoMonthsApplied,
              promo_months_remaining_before_invoice: promoBreakdown.promoMonthsRemainingBeforeInvoice,
              promo_months_remaining_after_invoice: promoBreakdown.promoMonthsRemainingAfterInvoice,
              months_consumed_after_invoice: promoBreakdown.monthsConsumedAfterInvoice,
            }
          : null,
        attendance_intro_promo_active:
          isAttendanceOnlyBillingPackage(pkg) && (promoBreakdown?.introPromoActive || false),
        attendance_intro_promo_price_per_employee: promoBreakdown?.promoPricePerEmployee || null,
        attendance_intro_promo_duration_months: promoBreakdown?.promoLabel
          ? attendanceIntroPromoConfig?.promo_duration_months || null
          : null,
        attendance_intro_promo_months_applied: promoBreakdown?.promoMonthsApplied || 0,
        attendance_intro_promo_months_consumed_before_invoice: promoBreakdown
          ? promoBreakdown.monthsConsumedAfterInvoice - promoBreakdown.promoMonthsApplied
          : subscription?.intro_promo_months_consumed || 0,
        attendance_intro_promo_months_consumed_after_invoice:
          promoBreakdown?.monthsConsumedAfterInvoice || subscription?.intro_promo_months_consumed || 0,
        attendance_intro_promo_months_remaining_after_invoice:
          promoBreakdown?.promoMonthsRemainingAfterInvoice || 0,
        attendance_intro_promo_label: promoBreakdown?.promoLabel || null,
      };

      const { data: invoiceResult, error: invoiceError } = (await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              supabase.rpc("create_or_get_manual_invoice" as never, {
                p_tenant_id: tenantId,
                p_subscription_id: subscriptionId || null,
                p_package_id: pkg.id,
                p_package_name: getSelectedPackageLabel(pkg),
                p_package_duration_months: pkg.duration_months,
                p_package_discount_percentage: getBillingPackageEffectiveDiscountPercentage(pkg),
                p_employee_count: employeeCount,
                p_price_per_employee: unitPrice,
                p_subtotal: subtotal,
                p_discount_amount: discount,
                p_vat_percentage: INTERNAL_TAX_PERCENTAGE,
                p_vat_amount: internalTaxAmount,
                p_gross_amount: proposedFinalAmount,
                p_xendit_fee: 0,
                p_net_amount: proposedFinalAmount,
                p_due_date: format(addMonths(new Date(), 0), "yyyy-MM-dd"),
                p_unique_code: proposedUniqueCode,
                p_notes: `Angka unik: ${proposedUniqueCode}`,
                p_metadata: invoiceMetadata,
              } as never),
            MANUAL_PAYMENT_OP_TIMEOUT_MS,
          ),
        {
          maxRetries: MANUAL_PAYMENT_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      )) as { data: CreateOrGetManualInvoiceResult | null; error: Error | null };

      if (invoiceError) throw invoiceError;
      if (!invoiceResult?.invoice_number) {
        throw new Error("Gagal membuat atau mengambil invoice aktif");
      }

      const resolvedUniqueCode =
        typeof invoiceResult.unique_code === "number" && Number.isFinite(invoiceResult.unique_code)
          ? invoiceResult.unique_code
          : proposedUniqueCode;
      const resolvedFinalAmount =
        typeof invoiceResult.gross_amount === "number" && Number.isFinite(invoiceResult.gross_amount)
          ? invoiceResult.gross_amount
          : proposedFinalAmount;
      const resolvedBaseAmount = Math.max(0, resolvedFinalAmount - resolvedUniqueCode);

      const { data: billingSettings, error: billingSettingsError } = await withExponentialBackoff(
        () =>
          withTimeout(
            () => supabase.from("system_settings").select("value").eq("key", "billing_settings").maybeSingle(),
            MANUAL_PAYMENT_OP_TIMEOUT_MS,
            "org.activation.manual_payment.fetch_billing_settings timeout",
          ),
        {
          maxRetries: MANUAL_PAYMENT_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );
      if (billingSettingsError) throw billingSettingsError;

      const billingValue = toJsonObject(billingSettings?.value);
      const settings = billingValue as BillingSettingsValue | null;

      const bankInfo = settings
        ? {
            bank: settings.bank_name || "BCA",
            account: settings.bank_account || "1234567890",
            name: settings.bank_account_name || "PT AbsensiKu Indonesia",
          }
        : {
            bank: "BCA",
            account: "1234567890",
            name: "PT AbsensiKu Indonesia",
          };

      setPaymentResult({
        invoiceNumber: invoiceResult.invoice_number,
        totalAmount: resolvedBaseAmount,
        uniqueCode: resolvedUniqueCode,
        finalAmount: resolvedFinalAmount,
        bankInfo,
      });

      if (invoiceResult.wallet_applied || invoiceResult.status === "PAID") {
        toast.success("Invoice otomatis lunas menggunakan saldo wallet.");
      } else if (invoiceResult.reused) {
        toast.info("Invoice aktif sebelumnya ditemukan. Silakan lanjutkan pembayaran pada invoice yang sama.");
      } else {
        toast.success("Invoice berhasil dibuat. Lanjutkan transfer lalu konfirmasi pembayaran pada detail invoice.");
      }
      const targetUrl =
        invoiceResult.wallet_applied || invoiceResult.status === "PAID"
          ? `/org/billing?menu=invoices&invoice=${encodeURIComponent(invoiceResult.invoice_number)}`
          : `/org/billing?menu=invoices&invoice=${encodeURIComponent(invoiceResult.invoice_number)}&focus=payment-proof`;
      navigate(targetUrl);
      void fetchActiveInvoice();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorRef = reportError(error, "org.activation.manual_payment.create", {
        tenant_id: tenantId,
        subscription_id: subscriptionId ?? null,
        selected_package_id: selectedPackage || null,
        employee_count: employeeCount,
      });
      toast.error(appendErrorReference("Gagal membuat pembayaran: " + errorMessage, errorRef));
    } finally {
      setIsSubmitting(false);
      setShowConfirmDialog(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await withTimeout(() => navigator.clipboard.writeText(text), 5000);
      toast.success("Disalin ke clipboard");
    } catch (error) {
      const errorRef = reportError(error, "org.activation.manual_payment.copy_clipboard");
      toast.error(appendErrorReference("Gagal menyalin ke clipboard", errorRef));
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
        </div>
        <p className="text-base font-medium text-slate-900">Memuat formulir pembayaran manual</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Paket langganan, invoice aktif, dan konfigurasi rekening sedang disiapkan.
        </p>
      </div>
    );
  }

  // Show payment result
  if (paymentResult) {
    return (
      <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/10">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-green-700 dark:text-green-400">
                Invoice Pembayaran Berhasil Dibuat!
              </CardTitle>
              <CardDescription>
                Silakan transfer sesuai nominal berikut, lalu lanjut ke konfirmasi pembayaran.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white dark:bg-background rounded-lg p-4 border space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">No. Invoice</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{paymentResult.invoiceNumber}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(paymentResult.invoiceNumber)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(paymentResult.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-primary">
              <span className="text-sm">Angka Unik</span>
              <span className="font-semibold">+ {paymentResult.uniqueCode}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total Transfer</span>
              <div className="flex items-center gap-2">
                <span className="text-primary">{formatCurrency(paymentResult.finalAmount)}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(paymentResult.finalAmount.toString())}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-background rounded-lg p-4 border">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Transfer ke Rekening
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-semibold">{paymentResult.bankInfo.bank}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">No. Rekening</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{paymentResult.bankInfo.account}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(paymentResult.bankInfo.account)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Atas Nama</span>
                <span className="font-semibold">{paymentResult.bankInfo.name}</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Penting:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Transfer harus sesuai nominal <strong>persis</strong> (termasuk angka unik)</li>
                  <li>Setelah transfer, lakukan <strong>Konfirmasi Pembayaran</strong> pada detail invoice</li>
                  <li>Langganan aktif hanya setelah verifikasi admin (status invoice menjadi Lunas)</li>
                  <li>Jika pembayaran tidak valid, Anda akan menerima notifikasi lanjutan</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { unitPrice, subtotal, discount, total, promoBreakdown } = calculateTotal();
  const pkg = getSelectedPackageData();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            {invoiceActionTitle}
          </CardTitle>
          <CardDescription>
            {invoiceActionDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isTrialSubscription ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/25 dark:text-blue-100">
              Jalur normal tenant baru dipantau oleh <strong>Streak Monitoring</strong>. Jika
              organisasi Anda sudah siap berlangganan sekarang, invoice ini akan dicatat sebagai
              <strong> aktivasi awal</strong>.
            </div>
          ) : null}
          {attendanceIntroPromoCampaignText ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100">
              {attendanceIntroPromoCampaignText}
            </div>
          ) : null}

          {isCentralizedBilling && negotiatedPricePerEmployee !== null && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
              {pkg && !isAttendanceOnlyBillingPackage(pkg) ? (
                <>
                  Harga negosiasi B2B yang tersimpan saat ini hanya berlaku untuk paket{" "}
                  <strong>Absensi</strong>. Bundle HR/Payroll memakai harga paket final.
                </>
              ) : (
                <>
                  Harga negosiasi B2B aktif: <strong>{formatCurrency(negotiatedPricePerEmployee)}</strong> per pegawai
                  per bulan (otomatis berlaku mulai tenant mencapai{" "}
                  <strong>{b2bThreshold.toLocaleString()}</strong> pegawai).
                </>
              )}
            </div>
          )}

          {activeInvoice && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 space-y-2">
              <p>
                Invoice aktif terdeteksi: <strong>{activeInvoice.invoice_number}</strong>. Pembuatan invoice baru dinonaktifkan
                sampai invoice ini selesai.
              </p>
              <p className="text-xs">
                Status: <strong>{activeInvoice.status}</strong> • Jatuh tempo:{" "}
                <strong>{format(new Date(activeInvoice.due_date), "d MMM yyyy", { locale: idLocale })}</strong> • Nilai:{" "}
                <strong>{formatCurrency(activeInvoice.gross_amount)}</strong>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchActiveInvoice()}
                disabled={isCheckingActiveInvoice}
              >
                {isCheckingActiveInvoice ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Mengecek...
                  </>
                ) : (
                  "Cek Ulang Status Invoice"
                )}
              </Button>
            </div>
          )}

          {/* Package Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Paket Langganan</Label>
              {prefilledPackage && <Badge variant="secondary">Terisi dari kalkulator</Badge>}
            </div>
            <Select
              value={selectedPackage}
              onValueChange={(value) => {
                setSelectedPackage(value);
                setPrefilledPackage(false);
              }}
            >
              <SelectTrigger
                className={
                  prefilledPackage
                    ? `border-blue-400 ring-1 ring-blue-300 ${flashPrefilledPackage ? "animate-pulse" : ""}`
                    : undefined
                }
              >
                <SelectValue placeholder="Pilih paket" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {getSelectedPackageLabel(p)} - {p.duration_months} bulan
                    {isBillingPackagePromoActive(p, p.base_price_per_month)
                      ? ` (${getBillingPackagePromoLabel(p, p.base_price_per_month) || "Promo"})`
                      : p.discount_percentage > 0
                        ? ` (Hemat ${p.discount_percentage}%)`
                        : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {packages.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Tidak ada paket aktif.</p>}
          </div>

          {/* Employee Count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Jumlah Pegawai yang Dibayar</Label>
              {prefilledEmployeeCount && <Badge variant="secondary">Terisi dari kalkulator</Badge>}
            </div>
            <Input
              type="number"
              min={1}
              value={employeeCount}
              className={
                prefilledEmployeeCount
                  ? `border-blue-400 ring-1 ring-blue-300 ${flashPrefilledEmployeeCount ? "animate-pulse" : ""}`
                  : undefined
              }
              onChange={(e) => {
                setEmployeeCount(parseInt(e.target.value) || 1);
                setPrefilledEmployeeCount(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Ini menjadi dasar tagihan invoice dan seat kontrak renewal. Harga per pegawai:{" "}
              {pkg ? formatCurrency(unitPrice) : "-"}/bulan
              {currentEmployeeCount > 0 && ` • Pegawai aktif saat ini: ${currentEmployeeCount}`}
            </p>
            {pkg && isBillingPackagePromoActive(pkg, pkg.base_price_per_month) ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {getBillingPackagePromoLabel(pkg, pkg.base_price_per_month) || "Promo aktif"} • harga normal {formatCurrency(pkg.base_price_per_month)}/bulan
              </p>
            ) : null}
          </div>

          {/* Summary */}
          {pkg && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {employeeCount} pegawai dibayar × {formatCurrency(pkg.base_price_per_month)} × {pkg.duration_months} bulan
                </span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {promoBreakdown?.promoMonthsApplied ? (
                <div className="flex justify-between text-sm text-emerald-700">
                  <span>
                    Promo onboarding {promoBreakdown.promoMonthsApplied} bulan ×{" "}
                    {formatCurrency(promoBreakdown.promoPricePerEmployee || 0)}
                  </span>
                  <span>- {formatCurrency(promoBreakdown.introPromoAdditionalDiscount)}</span>
                </div>
              ) : null}
              {promoBreakdown?.packageDiscountAmount ? (
                <div className="flex justify-between text-sm text-blue-700">
                  <span>Diskon paket ({promoBreakdown.packageDiscountPercentage}%)</span>
                  <span>- {formatCurrency(promoBreakdown.packageDiscountAmount)}</span>
                </div>
              ) : discount > 0 ? (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Diskon ({getBillingPackageEffectiveDiscountPercentage(pkg)}%)</span>
                  <span>- {formatCurrency(discount)}</span>
                </div>
              ) : null}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {promoBreakdown
                  ? "Promo onboarding dihitung per subscription. + angka unik 3 digit ditambahkan saat konfirmasi."
                  : "Total tagihan sudah final sesuai kebijakan biaya internal. + angka unik 3 digit ditambahkan saat konfirmasi."}
              </p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!selectedPackage || employeeCount < 1 || isCheckingActiveInvoice || Boolean(activeInvoice)}
            onClick={handleInitiatePayment}
          >
            <Receipt className="h-4 w-4 mr-2" />
            Mau Bayar
          </Button>
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isTrialSubscription ? "Konfirmasi Aktivasi Awal" : "Konfirmasi Pembuatan Invoice"}
            </DialogTitle>
            <DialogDescription>
              Langkah ini hanya membuat invoice. Langganan belum aktif sampai pembayaran dikonfirmasi
              dan diverifikasi admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex justify-between text-sm">
              <span>Paket</span>
              <span className="font-semibold">{getSelectedPackageLabel(pkg)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Durasi</span>
              <span className="font-semibold">{pkg?.duration_months} bulan</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Pegawai (Billing)</span>
              <span className="font-semibold">{employeeCount}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total (+ angka unik)</span>
              <span className="text-primary">{formatCurrency(total)} + xxx</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Batal
            </Button>
            <Button onClick={handleSubmitPayment} disabled={isSubmitting || !pkg}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Memproses...
                </>
              ) : (
                isTrialSubscription ? "Lanjutkan Aktivasi Awal" : "Buat Invoice Sekarang"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
