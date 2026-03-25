import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Calculator,
  CreditCard,
  Receipt,
  CheckCircle2,
  Clock,
  Loader2,
  Users,
  Calendar,
  AlertTriangle,
  ExternalLink,
  Smartphone,
  Landmark,
  QrCode,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ManualPaymentFlow } from "@/components/org/ManualPaymentFlow";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import type { Tables } from "@/integrations/supabase/types";
import {
  getBillingPackageDisplayName,
  isAttendanceOnlyBillingPackage,
} from "@/lib/billingPackageScope";
import {
  getBillingPackageEffectiveDiscountPercentage,
  getBillingPackageEffectivePricePerMonth,
  getBillingPackagePromoLabel,
  isBillingPackagePromoActive,
} from "@/lib/billingPackagePricing";
import {
  calculateAttendanceIntroPromoBreakdown,
  getAttendanceIntroPromoCampaignText,
  normalizeAttendanceIntroPromoConfig,
  normalizeAttendanceIntroPromoState,
  type AttendanceIntroPromoConfig,
} from "@/lib/attendanceOnboardingPromo";

interface OrgActivationTabProps {
  tenantId: string;
  tenantName: string;
  openCalculatorRequestToken?: number;
}

type SubscriptionPackage = Tables<"subscription_packages">;
type Subscription = Tables<"subscriptions">;
type Invoice = Tables<"invoices">;
type SystemSetting = Tables<"system_settings">;

interface XenditSettingValue {
  enabled?: boolean;
}

interface BillingSettingRow {
  setting_key: string;
  setting_value: unknown;
}

interface XenditInvoiceResponse {
  success?: boolean;
  reused?: boolean;
  error?: string;
  fallback_payment_method?: "MANUAL_TRANSFER" | null;
  fallback_code?: string | null;
  message?: string;
  invoice?: {
    id?: string;
    invoice_number?: string | null;
    invoice_url?: string | null;
    gross_amount?: number | null;
    due_date?: string | null;
    payment_method_type?: string | null;
  };
}

type PaymentMethod = "manual" | "xendit";
type InvoicePriorityTone = "critical" | "warning" | "normal" | "ok";
type ActivationStepState = "done" | "current" | "pending";
type ScrollFlashTarget = "invoice" | "xendit" | "manual" | null;

const PPN_PERCENTAGE = 11;
const PPH_PERCENTAGE = 2;
const INTERNAL_TAX_PERCENTAGE = PPN_PERCENTAGE + PPH_PERCENTAGE;

const toDueEndTimestamp = (dueDate?: string | null): number | null => {
  if (!dueDate) return null;
  const ts = Date.parse(`${dueDate}T23:59:59`);
  return Number.isFinite(ts) ? ts : null;
};

const formatCountdown = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const parseNumericSettingValue = (raw: unknown, fallback: number): number => {
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

const extractManualBankNames = (raw: unknown): string[] => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const source = raw as Record<string, unknown>;
  const candidates: unknown[] = [
    source.bank_name,
    source.bankName,
    source.bank_names,
    source.bankNames,
    source.supported_banks,
    source.supportedBanks,
  ];

  const collected = candidates.flatMap((entry) => {
    if (!entry) return [];
    if (Array.isArray(entry)) return entry;
    if (typeof entry === "string") {
      return entry
        .split(/[,\n;/|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  });

  const normalized = collected
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.toUpperCase());

  return Array.from(new Set(normalized));
};

const isBriBankName = (bankName: string) => bankName.trim().toUpperCase() === "BRI";

const parseInvoiceBillingScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const raw = metadata as Record<string, unknown>;
  return raw.billing_scope === "individual" ? "individual" : "centralized";
};

export function OrgActivationTab({
  tenantId,
  tenantName,
  openCalculatorRequestToken = 0,
}: OrgActivationTabProps) {
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 10;
  const CALCULATOR_PREFS_KEY = `org_activation_calculator:${tenantId}`;
  const PAYMENT_METHOD_PREFS_KEY = `org_activation_payment_method:${tenantId}`;
  const PAYMENT_METHOD_CARD_ID = "org-activation-payment-method";
  const XENDIT_CHECKOUT_SECTION_ID = "org-activation-xendit-checkout";
  const MANUAL_PAYMENT_SECTION_ID = "org-activation-manual-payment";
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [memberSlider, setMemberSlider] = useState([10]);
  const [hasHydratedCalculatorState, setHasHydratedCalculatorState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual");
  const [isCreatingXenditInvoice, setIsCreatingXenditInvoice] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [manualFlowPrefill, setManualFlowPrefill] = useState<{ packageId: string; employeeCount: number } | null>(null);
  const [xenditEnabled, setXenditEnabled] = useState(false);
  const [b2bThreshold, setB2bThreshold] = useState(2000);
  const [isCentralizedBilling, setIsCentralizedBilling] = useState(true);
  const [attendanceIntroPromoConfig, setAttendanceIntroPromoConfig] = useState<AttendanceIntroPromoConfig | null>(null);
  const [attendanceIntroPromoCampaignText, setAttendanceIntroPromoCampaignText] = useState<string | null>(null);
  const [manualBankNames, setManualBankNames] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [scrollFlashTarget, setScrollFlashTarget] = useState<ScrollFlashTarget>(null);
  const [isSlowLoading, setIsSlowLoading] = useState(false);
  const handledCalculatorTokenRef = useRef(0);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setIsSlowLoading(false);
    try {
      const [pkgRes, subRes, invRes, empRes, xenditRes, b2bRes, tenantRes, billingRes, promoRes] = await Promise.all([
        supabase.from("subscription_packages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("subscriptions").select("*").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
        supabase
          .from("employees")
          .select("id", { count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .limit(1),
        supabase.from("system_settings").select("value").eq("key", "xendit_enabled").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "b2b_negotiation_threshold").maybeSingle(),
        supabase.from("tenants").select("billing_mode, organization_type").eq("id", tenantId).maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "billing_settings").maybeSingle(),
        supabase
          .from("billing_settings")
          .select("setting_key, setting_value")
          .eq("setting_key", "attendance_intro_promo")
          .maybeSingle(),
      ]);

      setPackages((pkgRes.data || []) as SubscriptionPackage[]);
      setSubscription(subRes.data);
      const tenantBillingMode = tenantRes.data?.billing_mode === "individual" ? "individual" : "centralized";
      const scopedInvoices = ((invRes.data || []) as Invoice[]).filter((invoice) =>
        tenantBillingMode === "individual"
          ? parseInvoiceBillingScope(invoice.metadata) === "individual"
          : parseInvoiceBillingScope(invoice.metadata) !== "individual",
      );
      setInvoices(scopedInvoices);
      setEmployeeCount(empRes.count || 0);
      const xenditSetting = xenditRes.data as SystemSetting | null;
      const settingValue = xenditSetting?.value;
      const isObjectSetting = typeof settingValue === "object" && settingValue !== null && !Array.isArray(settingValue);
      const enabledFromObject = isObjectSetting ? (settingValue as XenditSettingValue).enabled === true : false;
      setXenditEnabled(settingValue === true || enabledFromObject);

      const b2bRaw = (b2bRes.data as SystemSetting | null)?.value;
      setB2bThreshold(Math.max(1, Math.floor(parseNumericSettingValue(b2bRaw, 2000))));
      setIsCentralizedBilling(tenantBillingMode !== "individual");
      const billingRaw = (billingRes.data as SystemSetting | null)?.value;
      setManualBankNames(extractManualBankNames(billingRaw));
      if (promoRes.error) throw promoRes.error;
      const promoConfig = normalizeAttendanceIntroPromoConfig((promoRes.data as BillingSettingRow | null)?.setting_value);
      setAttendanceIntroPromoConfig(promoConfig.active ? promoConfig : null);
      setAttendanceIntroPromoCampaignText(getAttendanceIntroPromoCampaignText(promoConfig));

    } catch (error) {
      const errorRef = reportError(error, "org.activation.fetch_all", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal memuat data aktivasi", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!isLoading) {
      setIsSlowLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setIsSlowLoading(true), 7000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    setHasHydratedCalculatorState(false);
  }, [tenantId]);

  const calculatorPackages = useMemo(() => packages, [packages]);
  const defaultBilledEmployeeCount = useMemo(() => {
    if (
      subscription?.billing_headcount_mode === "manual_contract" &&
      typeof subscription.contracted_employee_count === "number" &&
      Number.isFinite(subscription.contracted_employee_count) &&
      subscription.contracted_employee_count > 0
    ) {
      return Math.floor(subscription.contracted_employee_count);
    }

    return employeeCount > 0 ? employeeCount : 10;
  }, [employeeCount, subscription?.billing_headcount_mode, subscription?.contracted_employee_count]);

  useEffect(() => {
    if (hasHydratedCalculatorState) return;
    if (calculatorPackages.length === 0) {
      setSelectedPkgId("");
      setHasHydratedCalculatorState(true);
      return;
    }
    const defaultPkgId = calculatorPackages[0]?.id ?? "";
    const defaultMemberCount = defaultBilledEmployeeCount;
    if (typeof window === "undefined") {
      setSelectedPkgId(defaultPkgId);
      setMemberSlider([defaultMemberCount]);
      setHasHydratedCalculatorState(true);
      return;
    }
    try {
      const persistedRaw = window.localStorage.getItem(CALCULATOR_PREFS_KEY);
      if (!persistedRaw) {
        setSelectedPkgId(defaultPkgId);
        setMemberSlider([defaultMemberCount]);
        setHasHydratedCalculatorState(true);
        return;
      }
      const persisted = JSON.parse(persistedRaw) as { packageId?: string; memberCount?: number } | null;
      const persistedMemberCount = Number(persisted?.memberCount);
      const memberCount = Number.isFinite(persistedMemberCount)
        ? Math.min(1000, Math.max(1, Math.floor(persistedMemberCount)))
        : defaultMemberCount;
      const packageId = calculatorPackages.some((pkg) => pkg.id === persisted?.packageId)
        ? (persisted?.packageId as string)
        : defaultPkgId;
      setSelectedPkgId(packageId);
      setMemberSlider([memberCount]);
    } catch {
      setSelectedPkgId(defaultPkgId);
      setMemberSlider([defaultMemberCount]);
    } finally {
      setHasHydratedCalculatorState(true);
    }
  }, [CALCULATOR_PREFS_KEY, calculatorPackages, defaultBilledEmployeeCount, hasHydratedCalculatorState]);

  useEffect(() => {
    if (!hasHydratedCalculatorState || typeof window === "undefined") return;
    const payload = JSON.stringify({
      packageId: selectedPkgId,
      memberCount: memberSlider[0],
    });
    window.localStorage.setItem(CALCULATOR_PREFS_KEY, payload);
  }, [CALCULATOR_PREFS_KEY, hasHydratedCalculatorState, memberSlider, selectedPkgId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = window.localStorage.getItem(PAYMENT_METHOD_PREFS_KEY);
    if (persisted === "manual" || persisted === "xendit") {
      setPaymentMethod(persisted);
    }
  }, [PAYMENT_METHOD_PREFS_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PAYMENT_METHOD_PREFS_KEY, paymentMethod);
  }, [PAYMENT_METHOD_PREFS_KEY, paymentMethod]);

  useEffect(() => {
    if (!selectedPkgId) {
      if (calculatorPackages[0]?.id) {
        setSelectedPkgId(calculatorPackages[0].id);
      }
      return;
    }
    if (!calculatorPackages.some((pkg) => pkg.id === selectedPkgId)) {
      setSelectedPkgId(calculatorPackages[0]?.id || "");
    }
  }, [calculatorPackages, selectedPkgId]);

  const selectedPkg = calculatorPackages.find((p) => p.id === selectedPkgId);
  const selectedPkgLabel = selectedPkg
    ? getBillingPackageDisplayName(selectedPkg.name, selectedPkg.module_scope)
    : "";
  const b2bMinEmployees = Math.max(2001, b2bThreshold);
  const hasSubscriptionNegotiatedPrice =
    typeof subscription?.price_per_employee === "number" &&
    Number.isFinite(subscription.price_per_employee) &&
    subscription.price_per_employee > 0;
  const isB2BHeadcount = isCentralizedBilling && employeeCount >= b2bMinEmployees;
  const selectedPkgSupportsNegotiatedPrice = selectedPkg
    ? isAttendanceOnlyBillingPackage(selectedPkg)
    : false;
  const hasNegotiatedB2BPrice =
    isB2BHeadcount &&
    hasSubscriptionNegotiatedPrice &&
    selectedPkgSupportsNegotiatedPrice;
  const isB2BManualOnly = isB2BHeadcount;
  const isXenditAllowed = isCentralizedBilling && xenditEnabled && !isB2BManualOnly;

  const getEffectiveUnitPrice = (pkg: SubscriptionPackage) => {
    const overridePrice = subscription?.price_per_employee;
    return hasNegotiatedB2BPrice &&
      isAttendanceOnlyBillingPackage(pkg) &&
      typeof overridePrice === "number" &&
      Number.isFinite(overridePrice) &&
      overridePrice > 0
      ? overridePrice
      : getBillingPackageEffectivePricePerMonth(pkg, pkg.base_price_per_month);
  };

  const calculateTotal = () => {
    if (!selectedPkg) {
      return {
        unitPrice: 0,
        subtotal: 0,
        discount: 0,
        baseAmount: 0,
        internalTaxAmount: 0,
        total: 0,
        promoBreakdown: null as ReturnType<typeof calculateAttendanceIntroPromoBreakdown> | null,
      };
    }

    const promoBreakdown =
      isAttendanceOnlyBillingPackage(selectedPkg) &&
      attendanceIntroPromoConfig &&
      !hasNegotiatedB2BPrice
        ? calculateAttendanceIntroPromoBreakdown({
            normalPricePerEmployee: selectedPkg.base_price_per_month,
            packageDiscountPercentage: selectedPkg.discount_percentage,
            durationMonths: selectedPkg.duration_months,
            employeeCount: memberSlider[0],
            promoConfig: attendanceIntroPromoConfig,
            promoState: subscription || undefined,
            canInitializePromo:
              !subscription ||
              (() => {
                const currentPromoState = normalizeAttendanceIntroPromoState(subscription || undefined);
                return !currentPromoState.intro_promo_active && currentPromoState.intro_promo_months_consumed === 0;
              })(),
          })
        : null;

    if (promoBreakdown) {
      const internalTaxAmount = Math.round(promoBreakdown.taxableBase * (INTERNAL_TAX_PERCENTAGE / 100));
      return {
        unitPrice: promoBreakdown.effectiveAveragePricePerEmployee,
        subtotal: promoBreakdown.subtotal,
        discount: promoBreakdown.discountAmount,
        baseAmount: promoBreakdown.taxableBase,
        internalTaxAmount,
        total: promoBreakdown.taxableBase + internalTaxAmount,
        promoBreakdown,
      };
    }

    const unitPrice = getEffectiveUnitPrice(selectedPkg);
    const subtotal = unitPrice * memberSlider[0] * selectedPkg.duration_months;
    const discountPercentage = getBillingPackageEffectiveDiscountPercentage(selectedPkg);
    const discount = subtotal * (discountPercentage / 100);
    const baseAmount = subtotal - discount;
    const internalTaxAmount = Math.round(baseAmount * (INTERNAL_TAX_PERCENTAGE / 100));
    return { unitPrice, subtotal, discount, baseAmount, internalTaxAmount, total: baseAmount + internalTaxAmount, promoBreakdown: null };
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
  const getInvoicePriorityMeta = useCallback((inv: Invoice) => {
    const status = inv.status || "";
    const dueAt = toDueEndTimestamp(inv.due_date);
    const isPayableStatus = status === "PENDING";
    const isWaitingVerification = status === "AWAITING_VERIFICATION";
    if (status === "PAID") {
      return { rank: 50, tone: "ok" as InvoicePriorityTone, note: "Lunas", dueAt };
    }
    if (status === "CANCELLED" || status === "EXPIRED") {
      return { rank: 40, tone: "normal" as InvoicePriorityTone, note: status, dueAt };
    }
    if (isWaitingVerification) {
      return { rank: 20, tone: "warning" as InvoicePriorityTone, note: "Menunggu verifikasi admin", dueAt };
    }
    if (!isPayableStatus) {
      return { rank: 30, tone: "normal" as InvoicePriorityTone, note: status || "-", dueAt };
    }
    if (!dueAt) {
      return { rank: 3, tone: "warning" as InvoicePriorityTone, note: "Belum ada jatuh tempo", dueAt: null };
    }
    if (nowMs > dueAt) {
      const lateDays = Math.max(1, Math.floor((nowMs - dueAt) / (24 * 60 * 60 * 1000)));
      return { rank: 0, tone: "critical" as InvoicePriorityTone, note: `Terlambat ${lateDays} hari`, dueAt };
    }
    const diffDays = Math.ceil((dueAt - nowMs) / (24 * 60 * 60 * 1000));
    if (diffDays <= 0) {
      return { rank: 1, tone: "critical" as InvoicePriorityTone, note: "Jatuh tempo hari ini", dueAt };
    }
    if (diffDays <= 3) {
      return { rank: 2, tone: "warning" as InvoicePriorityTone, note: `Jatuh tempo H-${diffDays}`, dueAt };
    }
    return { rank: 3, tone: "normal" as InvoicePriorityTone, note: `Jatuh tempo H-${diffDays}`, dueAt };
  }, [nowMs]);

  const prioritizedInvoices = useMemo(() => {
    return [...invoices].sort((left, right) => {
      const leftMeta = getInvoicePriorityMeta(left);
      const rightMeta = getInvoicePriorityMeta(right);
      if (leftMeta.rank !== rightMeta.rank) return leftMeta.rank - rightMeta.rank;
      const leftDue = leftMeta.dueAt ?? Number.MAX_SAFE_INTEGER;
      const rightDue = rightMeta.dueAt ?? Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return Date.parse(right.created_at) - Date.parse(left.created_at);
    });
  }, [invoices, getInvoicePriorityMeta]);

  const totalPages = Math.max(1, Math.ceil(prioritizedInvoices.length / ITEMS_PER_PAGE));
  const paginatedInvoices = prioritizedInvoices.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const attentionInvoices = prioritizedInvoices.filter((inv) => getInvoicePriorityMeta(inv).rank <= 2);
  const criticalInvoice = attentionInvoices[0] || null;
  const latestInvoice = useMemo(() => {
    if (invoices.length === 0) return null;
    return [...invoices].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];
  }, [invoices]);
  const activeInvoice = useMemo(() => {
    return [...invoices]
      .filter((inv) => inv.status === "PENDING" || inv.status === "AWAITING_VERIFICATION")
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;
  }, [invoices]);
  const hasOpenInvoice = useMemo(
    () => invoices.some((inv) => inv.status === "PENDING" || inv.status === "AWAITING_VERIFICATION"),
    [invoices],
  );
  const invoiceStepTitle = subscription?.status === "trial"
    ? "Aktivasi Awal (Buat Invoice)"
    : "Buat Invoice";
  const activationSteps = useMemo(() => {
    const hasSelectedPackage = Boolean(selectedPkgId);
    const hasCreatedInvoice = Boolean(latestInvoice);
    const invoiceStatus = latestInvoice?.status || "";
    const isPaid = invoiceStatus === "PAID";
    const isAwaitingVerification = invoiceStatus === "AWAITING_VERIFICATION";
    const isSubscriptionHealthy = subscription?.status === "active" && !hasOpenInvoice;

    if (isSubscriptionHealthy) {
      return [
        { title: "Pilih Paket", description: "Paket langganan aktif.", state: "done" as ActivationStepState },
        { title: invoiceStepTitle, description: "Invoice terakhir sudah diproses.", state: "done" as ActivationStepState },
        { title: "Konfirmasi Pembayaran", description: "Pembayaran tercatat.", state: "done" as ActivationStepState },
        { title: "Verifikasi & Aktivasi", description: "Langganan sudah aktif.", state: "done" as ActivationStepState },
      ];
    }

    const step1: ActivationStepState = hasSelectedPackage ? "done" : "current";
    const step2: ActivationStepState = hasCreatedInvoice ? "done" : hasSelectedPackage ? "current" : "pending";
    const step3: ActivationStepState = isPaid || isAwaitingVerification
      ? "done"
      : hasCreatedInvoice
        ? "current"
        : "pending";
    const step4: ActivationStepState = isPaid
      ? "done"
      : isAwaitingVerification
        ? "current"
        : hasCreatedInvoice
          ? "pending"
          : "pending";

    return [
      {
        title: "Pilih Paket",
        description: hasSelectedPackage ? "Paket sudah dipilih." : "Pilih paket dan jumlah pegawai yang dibayar.",
        state: step1,
      },
      {
        title: invoiceStepTitle,
        description: hasCreatedInvoice
          ? `Invoice ${latestInvoice?.invoice_number || "-"} sudah dibuat.`
          : subscription?.status === "trial"
            ? "Gunakan aktivasi awal jika organisasi sudah siap berlangganan sebelum trial selesai dipantau."
            : "Buat invoice berdasarkan simulasi.",
        state: step2,
      },
      {
        title: "Konfirmasi Pembayaran",
        description:
          isPaid || isAwaitingVerification
            ? "Pembayaran sudah dikonfirmasi."
            : hasCreatedInvoice
              ? "Setelah transfer, kirim bukti dan konfirmasi pembayaran."
              : "Menunggu invoice dibuat.",
        state: step3,
      },
      {
        title: "Verifikasi & Aktivasi",
        description:
          isPaid
            ? "Langganan aktif."
            : isAwaitingVerification
              ? "Menunggu verifikasi admin."
              : "Langganan aktif setelah invoice tervalidasi.",
        state: step4,
      },
    ];
  }, [selectedPkgId, latestInvoice, subscription?.status, hasOpenInvoice, invoiceStepTitle]);

  const activationProgressPercent = useMemo(() => {
    const totalSegments = Math.max(activationSteps.length - 1, 1);
    const doneCount = activationSteps.filter((step) => step.state === "done").length;
    const currentIndex = activationSteps.findIndex((step) => step.state === "current");
    const weightedProgress = doneCount + (currentIndex >= 0 ? 0.5 : 0);
    return Math.min(100, Math.max(0, (weightedProgress / totalSegments) * 100));
  }, [activationSteps]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Lunas</Badge>;
      case "PENDING": return <Badge variant="secondary">Menunggu</Badge>;
      case "AWAITING_VERIFICATION": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Menunggu Verifikasi</Badge>;
      case "CANCELLED": return <Badge variant="destructive">Batal</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleXenditCheckout = async () => {
    if (!selectedPkg) return;
    if (!isXenditAllowed) {
      toast.warning(
        isCentralizedBilling
          ? "Skema B2B (billing terpusat) hanya mendukung transfer manual."
          : "Pembayaran online saat ini tidak tersedia.",
      );
      return;
    }
    setIsCreatingXenditInvoice(true);
    try {
      const { data, error } = await supabase.functions.invoke<XenditInvoiceResponse>("create-xendit-invoice", {
        body: {
          tenant_id: tenantId,
          package_id: selectedPkg.id,
          employee_count: memberSlider[0],
          duration_months: selectedPkg.duration_months,
          description: `Langganan ${selectedPkgLabel} - ${memberSlider[0]} pegawai`,
        },
      });

      if (error) throw error;
      if (!data?.success) {
        toast.warning(data?.error || "Masih ada invoice aktif yang perlu diselesaikan.");
        return;
      }

      const fallbackManual =
        data.fallback_payment_method === "MANUAL_TRANSFER" ||
        data.invoice?.payment_method_type === "MANUAL_TRANSFER";

      if (data.reused) {
        toast.info("Invoice aktif sudah tersedia. Anda diarahkan ke invoice yang sama untuk dilanjutkan.");
      } else {
        toast.success("Invoice berhasil dibuat! Anda akan diarahkan ke halaman pembayaran.");
      }

      if (fallbackManual) {
        setPaymentMethod("manual");
        toast.info(data.message || "Pembayaran online tidak tersedia. Invoice dialihkan ke konfirmasi transfer manual.");
        if (data.invoice?.invoice_number) {
          navigate(
            `/org/billing?menu=invoices&invoice=${encodeURIComponent(data.invoice.invoice_number)}&focus=payment-proof`,
          );
        }
        void fetchAll();
        return;
      }

      // Open Xendit checkout URL
      if (data.invoice?.invoice_url) {
        window.open(data.invoice.invoice_url, "_blank");
      } else {
        toast.info("Invoice berhasil dibuat tanpa URL checkout. Lanjutkan dari menu invoice.");
      }

      // Refresh invoices
      void fetchAll();
    } catch (error: unknown) {
      if (error instanceof Error && error.message.trim().length > 0) {
        reportError(error, "org.activation.xendit_checkout", {
          tenant_id: tenantId,
          package_id: selectedPkg?.id || null,
          source: "direct_error_message",
        });
        toast.error(error.message);
        return;
      }
      const errorRef = reportError(error, "org.activation.xendit_checkout", {
        tenant_id: tenantId,
        package_id: selectedPkg?.id || null,
      });
      toast.error(appendErrorReference("Gagal membuat invoice Xendit", errorRef));
    } finally {
      setIsCreatingXenditInvoice(false);
    }
  };

  const handleContinueToInvoice = () => {
    const scrollAndFlash = (targetId: string, flashTarget: Exclude<ScrollFlashTarget, null>) => {
      const targetEl = document.getElementById(targetId);
      targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollFlashTarget(flashTarget);
      window.setTimeout(() => setScrollFlashTarget((prev) => (prev === flashTarget ? null : prev)), 1400);
    };

    if (hasOpenInvoice) {
      setIsCalculatorOpen(false);
      if (activeInvoice?.invoice_number) {
        navigate(
          `/org/billing?menu=invoices&invoice=${encodeURIComponent(activeInvoice.invoice_number)}&focus=payment-proof`,
        );
        toast.info(`Invoice aktif ${activeInvoice.invoice_number} masih berjalan. Anda diarahkan ke form konfirmasi pembayarannya.`);
        return;
      }
      window.setTimeout(() => {
        scrollAndFlash("invoice-priority-table", "invoice");
      }, 120);
      toast.info("Masih ada invoice aktif yang perlu diselesaikan terlebih dahulu.");
      return;
    }
    if (selectedPkgId) {
      setManualFlowPrefill({
        packageId: selectedPkgId,
        employeeCount: memberSlider[0],
      });
    }
    setIsCalculatorOpen(false);
    const nextPaymentMethod: PaymentMethod = isXenditAllowed ? "xendit" : "manual";
    setPaymentMethod(nextPaymentMethod);
    window.setTimeout(() => {
      const targetId =
        nextPaymentMethod === "xendit" ? XENDIT_CHECKOUT_SECTION_ID : MANUAL_PAYMENT_SECTION_ID;
      scrollAndFlash(targetId, nextPaymentMethod === "xendit" ? "xendit" : "manual");
    }, 120);
  };

  const handleStatusClick = (invoice: Invoice) => {
    const invoiceNumber = (invoice.invoice_number || "").trim();
    if (!invoiceNumber) {
      navigate("/org/billing?menu=invoices");
      toast.info("Nomor invoice tidak tersedia. Anda diarahkan ke daftar faktur.");
      return;
    }

    const isPayableStatus = invoice.status === "PENDING" || invoice.status === "AWAITING_VERIFICATION";
    const targetUrl = isPayableStatus
      ? `/org/billing?menu=invoices&invoice=${encodeURIComponent(invoiceNumber)}&focus=payment-proof`
      : `/org/billing?menu=invoices&invoice=${encodeURIComponent(invoiceNumber)}`;

    navigate(targetUrl);
  };

  const handleResetCalculatorPreferences = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CALCULATOR_PREFS_KEY);
      window.localStorage.removeItem(PAYMENT_METHOD_PREFS_KEY);
    }
    const defaultPkgId = calculatorPackages[0]?.id ?? "";
    const defaultMemberCount = defaultBilledEmployeeCount;
    setSelectedPkgId(defaultPkgId);
    setMemberSlider([defaultMemberCount]);
    setManualFlowPrefill(null);
    setPaymentMethod("manual");
    toast.success("Simulasi dikembalikan ke default organisasi.");
  };

  const handleOpenCalculator = () => {
    if (hasOpenInvoice) {
      handleContinueToInvoice();
      return;
    }
    setIsCalculatorOpen(true);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [invoices.length]);

  useEffect(() => {
    if (paymentMethod === "xendit" && !isXenditAllowed) {
      setPaymentMethod("manual");
    }
  }, [paymentMethod, isXenditAllowed]);

  useEffect(() => {
    if (isB2BManualOnly && paymentMethod !== "manual") {
      setPaymentMethod("manual");
    }
  }, [isB2BManualOnly, paymentMethod]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!openCalculatorRequestToken) return;
    if (handledCalculatorTokenRef.current === openCalculatorRequestToken) return;
    handledCalculatorTokenRef.current = openCalculatorRequestToken;
    setIsCalculatorOpen(true);
  }, [openCalculatorRequestToken]);

  if (isLoading) {
    return (
      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="py-10">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-slate-100 p-3">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
            <p className="text-base font-medium text-slate-800">Memuat data penawaran dan faktur...</p>
            <p className="text-sm text-muted-foreground">
              Sistem sedang mengambil data paket, langganan aktif, dan riwayat invoice.
            </p>
            {isSlowLoading ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  Pemuatan lebih lama dari biasanya
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Coba muat ulang. Jika tetap lambat, cek koneksi atau refresh halaman.
                </p>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => void fetchAll()}>
                    Coba Lagi
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { subtotal, discount, total, promoBreakdown } = calculateTotal();
  const calculatorCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Kalkulator Langganan
        </CardTitle>
        <CardDescription>
          Buka overlay kalkulator untuk simulasi paket dan jumlah member. Pilihan terakhir disimpan otomatis per
          organisasi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedPkg ? (
          <div className="rounded-lg border p-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Ringkasan Simulasi Saat Ini</p>
              {hasOpenInvoice && <Badge variant="secondary">Invoice Aktif</Badge>}
            </div>
            <p className="font-semibold">
              {selectedPkgLabel} • {memberSlider[0]} member • {selectedPkg.duration_months} bulan
            </p>
            <p className="text-lg font-bold text-primary">{formatCurrency(total)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada paket dipilih.</p>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleResetCalculatorPreferences}>
            Reset Simulasi
          </Button>
        </div>

        <Button className="w-full sm:w-auto" onClick={handleOpenCalculator}>
          <Calculator className="h-4 w-4 mr-2" />
          {hasOpenInvoice ? "Lihat Invoice Aktif" : "Buka Kalkulator"}
        </Button>

        <Dialog open={isCalculatorOpen} onOpenChange={setIsCalculatorOpen}>
          <DialogContent className="w-[100vw] max-w-none h-[100dvh] rounded-none p-0 sm:h-auto sm:max-w-4xl sm:rounded-lg sm:p-6">
	            <DialogHeader className="px-4 pt-4 sm:px-0 sm:pt-0">
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                Kalkulator Langganan
              </DialogTitle>
	              <DialogDescription>
	                Pilih paket dan jumlah member untuk menghitung estimasi biaya langganan.
	              </DialogDescription>
	            </DialogHeader>
	            <div className="px-4 pb-4 sm:px-0 sm:pb-0 max-h-[calc(100dvh-6rem)] sm:max-h-[70vh] overflow-y-auto space-y-5">
              {attendanceIntroPromoCampaignText ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100">
                  {attendanceIntroPromoCampaignText}
                </div>
              ) : null}
	              {isB2BHeadcount && typeof subscription?.price_per_employee === "number" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
                    {selectedPkgSupportsNegotiatedPrice ? (
                      <>
                        Harga negosiasi B2B aktif:{" "}
                        <strong>{formatCurrency(subscription.price_per_employee)}</strong> per pegawai per bulan.
                      </>
                    ) : (
                      <>
                        Harga negosiasi B2B yang tersimpan saat ini hanya berlaku untuk paket{" "}
                        <strong>Absensi</strong>. Bundle HR/Payroll memakai harga paket final.
                      </>
                    )}
                  </div>
                )}
              {hasOpenInvoice && activeInvoice && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 space-y-2">
                  <p>
                    Invoice aktif: <strong>{activeInvoice.invoice_number}</strong> masih berjalan.
                  </p>
                  <p className="text-xs">
                    Status <strong>{activeInvoice.status}</strong>
                    {activeInvoice.due_date
                      ? ` • Jatuh tempo ${format(new Date(activeInvoice.due_date), "d MMM yyyy", { locale: idLocale })}`
                      : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={handleContinueToInvoice}>
                      Lihat Invoice Aktif
                    </Button>
                    {activeInvoice.status === "PENDING" && activeInvoice.invoice_url && (
                      <Button size="sm" asChild>
                        <a href={activeInvoice.invoice_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Bayar Sekarang
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              )}

	              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
	                {calculatorPackages.map((pkg) => (
	                  <button
                    key={pkg.id}
                    onClick={() => !hasOpenInvoice && setSelectedPkgId(pkg.id)}
                    disabled={hasOpenInvoice}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedPkgId === pkg.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    } ${hasOpenInvoice ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <p className="font-semibold">
                      {getBillingPackageDisplayName(pkg.name, pkg.module_scope)}
                    </p>
                    <p className="text-sm text-muted-foreground">{pkg.duration_months} bulan</p>
                    <div className="mt-1 space-y-1">
                      <p className="text-sm font-medium">
                        {formatCurrency(getEffectiveUnitPrice(pkg))}/org/bln
                      </p>
                      {isBillingPackagePromoActive(pkg, pkg.base_price_per_month) ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground line-through">
                            {formatCurrency(pkg.base_price_per_month)}
                          </span>
                          <Badge variant="secondary">
                            {getBillingPackagePromoLabel(pkg, pkg.base_price_per_month) || "Promo"}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                    {getBillingPackageEffectiveDiscountPercentage(pkg) > 0 && (
                      <Badge variant="secondary" className="mt-2 text-xs">
                        Hemat {getBillingPackageEffectiveDiscountPercentage(pkg)}%
                      </Badge>
                    )}
	                  </button>
	                ))}
	              </div>
              {calculatorPackages.length === 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  Tidak ada paket aktif.
                </div>
              )}

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Jumlah Pegawai yang Dibayar</span>
                  <span className="text-3xl font-bold text-primary">{memberSlider[0]}</span>
                </div>
                <Slider
                  value={memberSlider}
                  onValueChange={setMemberSlider}
                  min={1}
                  max={1000}
                  step={1}
                  disabled={hasOpenInvoice}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1</span>
                  <span>1000</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Seat tagihan ini boleh berbeda dari pegawai aktif saat ini. Pegawai aktif terdaftar: {employeeCount}
                </p>
                {hasOpenInvoice && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Simulasi dikunci sementara karena masih ada invoice aktif.
                  </p>
                )}
              </div>

              {selectedPkg && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {memberSlider[0]} pegawai dibayar × {formatCurrency(selectedPkg.base_price_per_month)} × {selectedPkg.duration_months} bln
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
                      <span>Diskon ({getBillingPackageEffectiveDiscountPercentage(selectedPkg)}%)</span>
                      <span>- {formatCurrency(discount)}</span>
                    </div>
                  ) : null}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {promoBreakdown
                      ? "Promo onboarding dihitung per subscription."
                      : "Total tagihan sudah final sesuai kebijakan biaya internal."}
                  </p>
                </div>
              )}

              <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-0 sm:px-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Ringkasan Cepat</p>
                    <p className="text-sm font-semibold">
                      {selectedPkg ? `${selectedPkgLabel} • ${memberSlider[0]} pegawai dibayar` : "Pilih paket"}
                    </p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(total)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsCalculatorOpen(false)}>
                      Tutup
                    </Button>
                    <Button onClick={handleContinueToInvoice} disabled={!selectedPkg || calculatorPackages.length === 0}>
                      {hasOpenInvoice
                        ? "Lihat Invoice Aktif"
                        : subscription?.status === "trial"
                          ? "Lanjut Aktivasi Awal"
                          : "Lanjut Buat Invoice"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(280px,360px),minmax(0,1fr)]">
        {/* Current Subscription */}
        <Card className="xl:sticky xl:top-6 self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Status Langganan
            </CardTitle>
            <CardDescription>Informasi langganan saat ini untuk {tenantName}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="p-4 rounded-lg border flex items-center gap-3">
                {subscription?.status === "active" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-semibold capitalize">{subscription?.status || "Trial"}</p>
                </div>
              </div>
              <div className="p-4 rounded-lg border flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Pegawai Aktif</p>
                  <p className="font-semibold">{employeeCount}</p>
                </div>
              </div>
              <div className="p-4 rounded-lg border flex items-center gap-3">
                <Calendar className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Mulai</p>
                  <p className="font-semibold">
                    {subscription?.start_date ? format(new Date(subscription.start_date), "d MMM yyyy", { locale: idLocale }) : "-"}
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-lg border flex items-center gap-3">
                <Calendar className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Berakhir</p>
                  <p className="font-semibold">
                    {subscription?.end_date ? format(new Date(subscription.end_date), "d MMM yyyy", { locale: idLocale }) : "-"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Priority */}
        <Card
          id="invoice-priority-table"
          className={`${criticalInvoice ? "border-red-300 shadow-sm" : ""} ${
            scrollFlashTarget === "invoice" ? "ring-2 ring-primary/50 animate-pulse" : ""
          }`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Daftar Invoice
              {attentionInvoices.length > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  {attentionInvoices.length} Butuh Tindakan
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Invoice prioritas ditampilkan di urutan teratas agar cepat ditindaklanjuti.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {criticalInvoice && (() => {
              const criticalMeta = getInvoicePriorityMeta(criticalInvoice);
              const dueAt = criticalMeta.dueAt;
              const countdownLabel =
                dueAt && dueAt > nowMs
                  ? `Batas waktu: ${formatCountdown(dueAt - nowMs)}`
                  : criticalMeta.rank === 0
                    ? "Tagihan sudah melewati jatuh tempo"
                    : criticalMeta.note;
              return (
                <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        PERINGATAN TAGIHAN PRIORITAS
                      </p>
                      <p className="text-sm">
                        Invoice <strong>{criticalInvoice.invoice_number}</strong> - {criticalMeta.note}
                      </p>
                      <p className="text-xs font-medium">{countdownLabel}</p>
                    </div>
                    {criticalInvoice.invoice_url && criticalInvoice.status === "PENDING" ? (
                      <Button asChild size="lg" className="bg-red-700 hover:bg-red-800">
                        <a href={criticalInvoice.invoice_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Bayar Sekarang
                        </a>
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        variant="destructive"
                        onClick={() => setPaymentMethod("manual")}
                      >
                        Prioritaskan Pembayaran Manual
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}

            {prioritizedInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Belum ada invoice</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Invoice</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioritas</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInvoices.map((inv) => {
                    const meta = getInvoicePriorityMeta(inv);
                    const rowClass =
                      meta.tone === "critical"
                        ? "bg-red-50/70 hover:bg-red-50"
                        : meta.tone === "warning"
                          ? "bg-amber-50/60 hover:bg-amber-50"
                          : "";
                    return (
                      <TableRow key={inv.id} className={rowClass}>
                        <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                        <TableCell>{inv.due_date ? format(new Date(inv.due_date), "d MMM yyyy", { locale: idLocale }) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {inv.payment_method_type === "XENDIT" ? "Online" : "Transfer"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{formatCurrency(inv.gross_amount)}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto px-0 hover:bg-transparent hover:opacity-80"
                            onClick={() => handleStatusClick(inv)}
                            title="Buka detail invoice"
                          >
                            {getStatusBadge(inv.status)}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              meta.tone === "critical"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : meta.tone === "warning"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            }
                          >
                            {meta.note}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {inv.invoice_url && inv.status === "PENDING" && (
                            <Button
                              variant={meta.tone === "critical" ? "destructive" : "default"}
                              size="sm"
                              className={meta.tone === "critical" ? "animate-pulse" : ""}
                              asChild
                            >
                              <a href={inv.invoice_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Bayar Sekarang
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {prioritizedInvoices.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Alur Konfirmasi & Invoice
          </CardTitle>
          <CardDescription>Progress realtime proses langganan dari pemilihan paket sampai aktivasi.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="hidden md:block">
              <div className="relative h-1 rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${activationProgressPercent}%` }}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
            {activationSteps.map((step, index) => (
              <div
                key={step.title}
                className={`rounded-xl border p-3 shadow-sm transition-colors ${
                  step.state === "done"
                    ? "border-emerald-300 bg-emerald-50/90 dark:border-emerald-900 dark:bg-emerald-950/20"
                    : step.state === "current"
                      ? "border-blue-300 bg-blue-50/90 ring-1 ring-blue-200 dark:border-blue-900 dark:bg-blue-950/20 dark:ring-blue-900/30"
                      : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  {step.state === "done" ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  ) : step.state === "current" ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                      <Clock className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                      {index + 1}
                    </span>
                  )}
                  <p className="text-sm font-semibold">{step.title}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              </div>
            ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method Selection */}
      <Card id={PAYMENT_METHOD_CARD_ID} className="border-slate-200/80 shadow-sm">
        <CardHeader className="space-y-2 pb-5">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Metode Pembayaran
          </CardTitle>
          <CardDescription>
            {isCentralizedBilling
              ? "Pilih cara pembayaran yang Anda inginkan"
              : "Billing Mandiri aktif: pembayaran dilakukan langsung oleh masing-masing pegawai di dashboard employee."}
          </CardDescription>
          {isB2BManualOnly && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Mode otomatis: tenant B2B menggunakan transfer manual.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {!isCentralizedBilling && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
              Tenant ini menggunakan <strong>Billing Mandiri</strong>. Halaman aktivasi organisasi hanya menampilkan
              ringkasan, sedangkan pembuatan dan pembayaran invoice dilakukan dari akun pegawai.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Manual Transfer */}
            <button
              type="button"
              onClick={() => isCentralizedBilling && setPaymentMethod("manual")}
              disabled={!isCentralizedBilling}
              className={`group p-4 rounded-2xl border text-left transition-all ${
                !isCentralizedBilling
                  ? "opacity-55 cursor-not-allowed border-slate-200 bg-slate-50/20 dark:border-slate-800 dark:bg-slate-900/10"
                  : paymentMethod === "manual"
                  ? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/30 shadow-sm"
                  : "border-slate-200 bg-slate-50/30 hover:border-primary/35 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/20"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  paymentMethod === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted group-hover:bg-primary/10 group-hover:text-primary"
                }`}>
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Transfer Bank Manual</p>
                  <p className="text-xs text-muted-foreground">Transfer ke rekening dengan angka unik</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {manualBankNames.length > 0 ? (
                  manualBankNames.map((bankName) => (
                    isBriBankName(bankName) ? (
                      <Badge
                        key={bankName}
                        variant="outline"
                        className="text-[10px] gap-1.5 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                      >
                        <span className="inline-flex h-4 min-w-6 items-center justify-center rounded bg-[#00529b] px-1 font-bold text-[9px] leading-none text-white">
                          BRI
                        </span>
                        Bank Rakyat Indonesia
                      </Badge>
                    ) : (
                      <Badge key={bankName} variant="outline" className="text-[10px]">
                        {bankName}
                      </Badge>
                    )
                  ))
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Ikuti rekening di detail invoice
                  </Badge>
                )}
              </div>
            </button>

            {/* Xendit Payment */}
            <button
              type="button"
              onClick={() => isXenditAllowed && setPaymentMethod("xendit")}
              disabled={!isXenditAllowed}
              className={`group p-4 rounded-2xl border text-left transition-all ${
                !isXenditAllowed
                  ? "opacity-55 cursor-not-allowed border-slate-200 bg-slate-50/20 dark:border-slate-800 dark:bg-slate-900/10"
                  : paymentMethod === "xendit"
                    ? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/30 shadow-sm"
                    : "border-slate-200 bg-slate-50/30 hover:border-primary/35 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/20"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  paymentMethod === "xendit"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted group-hover:bg-primary/10 group-hover:text-primary"
                }`}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Pembayaran Online</p>
                  <p className="text-xs text-muted-foreground">
                    {!isCentralizedBilling
                      ? "Billing Mandiri: checkout di dashboard employee"
                      : !xenditEnabled
                      ? "Belum dikonfigurasi admin"
                      : isB2BManualOnly
                        ? "Skema B2B: wajib transfer manual"
                        : "QRIS, Virtual Account, E-Wallet, Kartu"}
                  </p>
                </div>
              </div>
              {isXenditAllowed && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                    <QrCode className="h-3 w-3" /> QRIS
                  </Badge>
                  <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                    <Landmark className="h-3 w-3" /> VA
                  </Badge>
                  <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                    <Smartphone className="h-3 w-3" /> E-Wallet
                  </Badge>
                  <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Kartu
                  </Badge>
                </div>
              )}
              {!isXenditAllowed && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  {!isCentralizedBilling
                    ? "Tenant billing mandiri: pembayaran hanya tersedia di dashboard employee"
                    : !xenditEnabled
                    ? "Hubungi admin untuk mengaktifkan pembayaran online"
                    : `Tenant billing terpusat dengan ≥ ${b2bMinEmployees.toLocaleString()} pegawai wajib manual transfer`}
                </p>
              )}
            </button>
          </div>

          {isB2BManualOnly && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Skema B2B aktif. Pembayaran online Xendit dinonaktifkan otomatis, gunakan <strong>Transfer Bank Manual</strong>.
            </div>
          )}

          {activeInvoice && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
              Invoice aktif terdeteksi: <strong>{activeInvoice.invoice_number}</strong>. Sistem akan menggunakan invoice ini
              sampai statusnya berubah lunas/dibatalkan.
            </div>
          )}

          {/* Xendit Checkout Button */}
          {paymentMethod === "xendit" && selectedPkg && isXenditAllowed && (
            <div
              id={XENDIT_CHECKOUT_SECTION_ID}
              className={`pt-2 rounded-md ${scrollFlashTarget === "xendit" ? "ring-2 ring-primary/50 animate-pulse" : ""}`}
            >
              <Button
                onClick={handleXenditCheckout}
                disabled={isCreatingXenditInvoice || !selectedPkg || hasOpenInvoice}
                className="w-full"
                size="lg"
              >
                {isCreatingXenditInvoice ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Membuat Invoice...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Bayar {formatCurrency(total)} via Xendit
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {hasOpenInvoice
                  ? "Masih ada invoice aktif. Selesaikan invoice tersebut terlebih dahulu."
                  : "Anda akan diarahkan ke halaman pembayaran Xendit"}
              </p>
              {activeInvoice?.status === "PENDING" && activeInvoice.invoice_url && (
                <Button asChild variant="outline" className="w-full mt-2">
                  <a href={activeInvoice.invoice_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Lanjutkan Invoice Aktif ({activeInvoice.invoice_number})
                  </a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isCentralizedBilling && paymentMethod === "manual" ? (
        <div
          id={MANUAL_PAYMENT_SECTION_ID}
          className={`grid gap-7 xl:grid-cols-[minmax(320px,400px),minmax(0,1fr)] items-start rounded-md ${
            scrollFlashTarget === "manual" ? "ring-2 ring-primary/50 animate-pulse p-1" : ""
          }`}
        >
          {calculatorCard}
          <ManualPaymentFlow
            tenantId={tenantId}
            tenantName={tenantName}
            currentEmployeeCount={employeeCount}
            subscriptionId={subscription?.id}
            initialPackageId={manualFlowPrefill?.packageId}
            initialEmployeeCount={manualFlowPrefill?.employeeCount}
          />
        </div>
      ) : (
        calculatorCard
      )}

    </div>
  );
}
