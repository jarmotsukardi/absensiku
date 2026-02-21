import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { ManualPaymentFlow } from "@/components/org/ManualPaymentFlow";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import type { Tables } from "@/integrations/supabase/types";

interface OrgActivationTabProps {
  tenantId: string;
  tenantName: string;
}

type SubscriptionPackage = Tables<"subscription_packages">;
type Subscription = Tables<"subscriptions">;
type Invoice = Tables<"invoices">;
type SystemSetting = Tables<"system_settings">;

interface XenditSettingValue {
  enabled?: boolean;
}

interface XenditInvoiceResponse {
  success?: boolean;
  reused?: boolean;
  error?: string;
  invoice?: {
    id?: string;
    invoice_number?: string | null;
    invoice_url?: string | null;
    gross_amount?: number | null;
    due_date?: string | null;
  };
}

type PaymentMethod = "manual" | "xendit";
type InvoicePriorityTone = "critical" | "warning" | "normal" | "ok";
type ActivationStepState = "done" | "current" | "pending";

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

export function OrgActivationTab({ tenantId, tenantName }: OrgActivationTabProps) {
  const ITEMS_PER_PAGE = 10;
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [memberSlider, setMemberSlider] = useState([10]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual");
  const [isCreatingXenditInvoice, setIsCreatingXenditInvoice] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [xenditEnabled, setXenditEnabled] = useState(false);
  const [b2bThreshold, setB2bThreshold] = useState(2000);
  const [isCentralizedBilling, setIsCentralizedBilling] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchAll = useCallback(async () => {
    try {
      const [pkgRes, subRes, invRes, empRes, xenditRes, b2bRes, tenantRes] = await Promise.all([
        supabase.from("subscription_packages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("subscriptions").select("*").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("system_settings").select("value").eq("key", "xendit_enabled").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "b2b_negotiation_threshold").maybeSingle(),
        supabase.from("tenants").select("billing_mode").eq("id", tenantId).maybeSingle(),
      ]);

      setPackages(pkgRes.data || []);
      setSubscription(subRes.data);
      setInvoices(invRes.data || []);
      setEmployeeCount(empRes.count || 0);
      setMemberSlider([empRes.count || 10]);
      const xenditSetting = xenditRes.data as SystemSetting | null;
      const settingValue = xenditSetting?.value;
      const isObjectSetting = typeof settingValue === "object" && settingValue !== null && !Array.isArray(settingValue);
      const enabledFromObject = isObjectSetting ? (settingValue as XenditSettingValue).enabled === true : false;
      setXenditEnabled(settingValue === true || enabledFromObject);

      const b2bRaw = (b2bRes.data as SystemSetting | null)?.value;
      setB2bThreshold(Math.max(1, Math.floor(parseNumericSettingValue(b2bRaw, 2000))));
      setIsCentralizedBilling(tenantRes.data?.billing_mode !== "individual");

      if (pkgRes.data && pkgRes.data.length > 0) {
        setSelectedPkgId(pkgRes.data[0].id);
      }
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

  const selectedPkg = packages.find((p) => p.id === selectedPkgId);
  const hasNegotiatedB2BPrice =
    typeof subscription?.price_per_employee === "number" &&
    Number.isFinite(subscription.price_per_employee) &&
    subscription.price_per_employee > 0;
  const isB2BManualOnly = isCentralizedBilling && (hasNegotiatedB2BPrice || employeeCount >= b2bThreshold);
  const isXenditAllowed = xenditEnabled && !isB2BManualOnly;

  const getEffectiveUnitPrice = (basePrice: number) => {
    const overridePrice = subscription?.price_per_employee;
    return typeof overridePrice === "number" && Number.isFinite(overridePrice) && overridePrice > 0
      ? overridePrice
      : basePrice;
  };

  const calculateTotal = () => {
    if (!selectedPkg) return { unitPrice: 0, subtotal: 0, discount: 0, total: 0 };
    const unitPrice = getEffectiveUnitPrice(selectedPkg.base_price_per_month);
    const subtotal = unitPrice * memberSlider[0] * selectedPkg.duration_months;
    const discount = subtotal * (selectedPkg.discount_percentage / 100);
    return { unitPrice, subtotal, discount, total: subtotal - discount };
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
        { title: "Konfirmasi & Buat Invoice", description: "Invoice terakhir sudah diproses.", state: "done" as ActivationStepState },
        { title: "Bayar Invoice", description: "Pembayaran tercatat.", state: "done" as ActivationStepState },
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
        description: hasSelectedPackage ? "Paket sudah dipilih." : "Pilih paket dan jumlah member.",
        state: step1,
      },
      {
        title: "Konfirmasi & Buat Invoice",
        description: hasCreatedInvoice
          ? `Invoice ${latestInvoice?.invoice_number || "-"} sudah dibuat.`
          : "Buat invoice berdasarkan simulasi.",
        state: step2,
      },
      {
        title: "Bayar Invoice",
        description:
          isPaid || isAwaitingVerification
            ? "Pembayaran sudah dikirim."
            : hasCreatedInvoice
              ? "Selesaikan pembayaran invoice."
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
  }, [selectedPkgId, latestInvoice, subscription?.status, hasOpenInvoice]);

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
          description: `Langganan ${selectedPkg.name} - ${memberSlider[0]} pegawai`,
        },
      });

      if (error) throw error;
      if (!data?.success) {
        toast.warning(data?.error || "Masih ada invoice aktif yang perlu diselesaikan.");
        return;
      }

      if (data.reused) {
        toast.info("Invoice aktif sudah tersedia. Anda diarahkan ke invoice yang sama untuk dilanjutkan.");
      } else {
        toast.success("Invoice berhasil dibuat! Anda akan diarahkan ke halaman pembayaran.");
      }
      
      // Open Xendit checkout URL
      if (data.invoice?.invoice_url) {
        window.open(data.invoice.invoice_url, "_blank");
      }

      // Refresh invoices
      void fetchAll();
    } catch (error: unknown) {
      if (error instanceof Error && error.message.trim().length > 0) {
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

  useEffect(() => {
    setCurrentPage(1);
  }, [invoices.length]);

  useEffect(() => {
    if (paymentMethod === "xendit" && !isXenditAllowed) {
      setPaymentMethod("manual");
    }
  }, [paymentMethod, isXenditAllowed]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { unitPrice, subtotal, discount, total } = calculateTotal();
  const calculatorCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Kalkulator Langganan
        </CardTitle>
        <CardDescription>Buka overlay kalkulator untuk simulasi paket dan jumlah member.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedPkg ? (
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Ringkasan Simulasi Saat Ini</p>
            <p className="font-semibold">
              {selectedPkg.name} • {memberSlider[0]} member • {selectedPkg.duration_months} bulan
            </p>
            <p className="text-lg font-bold text-primary">{formatCurrency(total)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada paket dipilih.</p>
        )}

        <Dialog open={isCalculatorOpen} onOpenChange={setIsCalculatorOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Calculator className="h-4 w-4 mr-2" />
              Buka Kalkulator
            </Button>
          </DialogTrigger>
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
              {typeof subscription?.price_per_employee === "number" &&
                Number.isFinite(subscription.price_per_employee) &&
                subscription.price_per_employee > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
                    Harga negosiasi B2B aktif: <strong>{formatCurrency(subscription.price_per_employee)}</strong> per
                    pegawai per bulan.
                  </div>
                )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPkgId(pkg.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedPkgId === pkg.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <p className="font-semibold">{pkg.name}</p>
                    <p className="text-sm text-muted-foreground">{pkg.duration_months} bulan</p>
                    <p className="text-sm font-medium mt-1">{formatCurrency(getEffectiveUnitPrice(pkg.base_price_per_month))}/org/bln</p>
                    {pkg.discount_percentage > 0 && (
                      <Badge variant="secondary" className="mt-2 text-xs">Hemat {pkg.discount_percentage}%</Badge>
                    )}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Jumlah Member</span>
                  <span className="text-3xl font-bold text-primary">{memberSlider[0]}</span>
                </div>
                <Slider
                  value={memberSlider}
                  onValueChange={setMemberSlider}
                  min={1}
                  max={1000}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1</span>
                  <span>1000</span>
                </div>
              </div>

              {selectedPkg && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {memberSlider[0]} member × {formatCurrency(unitPrice)} × {selectedPkg.duration_months} bln
                    </span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Diskon ({selectedPkg.discount_percentage}%)</span>
                      <span>- {formatCurrency(discount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setIsCalculatorOpen(false)}>
                  Tutup
                </Button>
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
        <Card id="invoice-priority-table" className={criticalInvoice ? "border-red-300 shadow-sm" : undefined}>
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
                        <TableCell>{getStatusBadge(inv.status)}</TableCell>
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
          <div className="grid gap-3 md:grid-cols-4">
            {activationSteps.map((step, index) => (
              <div
                key={step.title}
                className={`rounded-lg border p-3 ${
                  step.state === "done"
                    ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
                    : step.state === "current"
                      ? "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20"
                      : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  {step.state === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : step.state === "current" ? (
                    <Clock className="h-4 w-4 text-blue-600" />
                  ) : (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground">
                      {index + 1}
                    </span>
                  )}
                  <p className="text-sm font-semibold">{step.title}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment Method Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Metode Pembayaran
          </CardTitle>
          <CardDescription>Pilih cara pembayaran yang Anda inginkan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Manual Transfer */}
            <button
              type="button"
              onClick={() => setPaymentMethod("manual")}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                paymentMethod === "manual" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  paymentMethod === "manual" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Transfer Bank Manual</p>
                  <p className="text-xs text-muted-foreground">Transfer ke rekening dengan angka unik</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Badge variant="outline" className="text-[10px]">BCA</Badge>
                <Badge variant="outline" className="text-[10px]">BNI</Badge>
                <Badge variant="outline" className="text-[10px]">BRI</Badge>
                <Badge variant="outline" className="text-[10px]">Mandiri</Badge>
              </div>
            </button>

            {/* Xendit Payment */}
            <button
              type="button"
              onClick={() => isXenditAllowed && setPaymentMethod("xendit")}
              disabled={!isXenditAllowed}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                !isXenditAllowed ? "opacity-50 cursor-not-allowed border-border" :
                paymentMethod === "xendit" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  paymentMethod === "xendit" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Pembayaran Online</p>
                  <p className="text-xs text-muted-foreground">
                    {!xenditEnabled
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
                  {!xenditEnabled
                    ? "Hubungi admin untuk mengaktifkan pembayaran online"
                    : `Tenant B2B billing terpusat (≥ ${b2bThreshold.toLocaleString()} pegawai / harga negosiasi) wajib manual transfer`}
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
            <div className="pt-2">
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

      {paymentMethod === "manual" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px),minmax(0,1fr)] items-start">
          {calculatorCard}
          <ManualPaymentFlow
            tenantId={tenantId}
            tenantName={tenantName}
            currentEmployeeCount={employeeCount}
            subscriptionId={subscription?.id}
          />
        </div>
      ) : (
        calculatorCard
      )}

    </div>
  );
}
