import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { ACTIVE_INVOICE_STATUSES, isActiveInvoiceStatus } from "@/lib/billingGuards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CENTRALIZED_MIN_DURATION_SETTING_KEYS,
  INDIVIDUAL_MIN_DURATION_SETTING_KEY,
  resolveMinimumBillingDuration,
} from "@/lib/billingMinDuration";

interface EmployeeActivationPageProps {
  tenantId: string;
  employeeId: string;
  onBack?: () => void;
}

interface SubscriptionPackage {
  id: string;
  name: string;
  duration_months: number;
  base_price_per_month: number;
  discount_percentage: number;
  description: string | null;
}

interface EmployeeInvoiceRecord {
  id: string;
  invoice_number: string;
  status: string;
  gross_amount: number;
  created_at: string;
  due_date: string | null;
  paid_at: string | null;
  package_name: string | null;
  package_duration_months: number | null;
  employee_count?: number | null;
  price_per_employee?: number | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  vat_percentage?: number | null;
  vat_amount?: number | null;
  ppn_percentage?: number | null;
  ppn_amount?: number | null;
  pph_percentage?: number | null;
  pph_amount?: number | null;
  invoice_url: string | null;
  payment_proof_url?: string | null;
  payment_method_type: string | null;
  rejection_reason?: string | null;
  metadata?: unknown;
}

interface XenditInvoiceResponse {
  success?: boolean;
  reused?: boolean;
  error?: string;
  trace_id?: string;
  fallback_payment_method?: "MANUAL_TRANSFER" | null;
  fallback_code?: string | null;
  message?: string;
  active_invoice?: {
    id?: string;
    invoice_number?: string | null;
    status?: string | null;
    due_date?: string | null;
  } | null;
  invoice?: {
    id?: string;
    invoice_number?: string | null;
    invoice_url?: string | null;
    gross_amount?: number | null;
    due_date?: string | null;
    payment_method_type?: string | null;
  };
}

interface BillingSettingRow {
  setting_key: string;
  setting_value: unknown;
}

interface ManualPaymentEvidenceRow {
  id: string;
  status: string | null;
  payment_date: string | null;
  created_at: string;
  transfer_proof_url: string | null;
  amount: number | null;
  confirmed_amount: number | null;
  verified_amount: number | null;
  verification_method: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

const parseMetadataScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const raw = metadata as Record<string, unknown>;
  return raw.billing_scope === "individual" ? "individual" : "centralized";
};

const parseMetadataEmployeeId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  if (typeof raw.employee_id === "string" && raw.employee_id.trim().length > 0) {
    return raw.employee_id.trim();
  }
  return null;
};

const canConfirmManualTransfer = (invoice: EmployeeInvoiceRecord) => {
  const normalizedStatus = (invoice.status || "").toUpperCase();
  if (invoice.payment_method_type !== "MANUAL_TRANSFER") return false;
  return normalizedStatus === "PENDING" || normalizedStatus === "REJECTED_NEEDS_REVISION";
};

const getInvoiceStatusBadge = (status: string) => {
  const normalized = (status || "").toUpperCase();
  if (normalized === "PAID") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Lunas</Badge>;
  }
  if (ACTIVE_INVOICE_STATUSES.includes(normalized as (typeof ACTIVE_INVOICE_STATUSES)[number])) {
    return <Badge variant="secondary">Belum Lunas</Badge>;
  }
  if (normalized === "CANCELLED") {
    return <Badge variant="destructive">Dibatalkan</Badge>;
  }
  if (normalized === "EXPIRED") {
    return <Badge variant="destructive">Kedaluwarsa</Badge>;
  }
  return <Badge variant="outline">{normalized || "-"}</Badge>;
};

const computeCoverageEnd = (paidInvoices: EmployeeInvoiceRecord[]): Date | null => {
  if (paidInvoices.length === 0) return null;

  const sorted = [...paidInvoices].sort((a, b) => {
    const aTime = Date.parse(a.paid_at || a.created_at);
    const bTime = Date.parse(b.paid_at || b.created_at);
    return aTime - bTime;
  });

  let coverageEnd: Date | null = null;
  for (const invoice of sorted) {
    const baseStart = new Date(invoice.paid_at || invoice.created_at);
    if (Number.isNaN(baseStart.getTime())) continue;
    const startAt =
      coverageEnd && coverageEnd.getTime() > baseStart.getTime() ? new Date(coverageEnd) : baseStart;
    const endAt = new Date(startAt);
    endAt.setMonth(endAt.getMonth() + Math.max(1, invoice.package_duration_months || 1));
    coverageEnd = endAt;
  }

  return coverageEnd;
};

export function EmployeeActivationPage({ tenantId, employeeId, onBack }: EmployeeActivationPageProps) {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [invoices, setInvoices] = useState<EmployeeInvoiceRecord[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [minDurationMonths, setMinDurationMonths] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [xenditFallbackInvoice, setXenditFallbackInvoice] = useState<EmployeeInvoiceRecord | null>(null);
  const [xenditFallbackMessage, setXenditFallbackMessage] = useState(
    "Pembayaran online Xendit tidak aktif. Lanjutkan pembayaran melalui transfer manual.",
  );
  const [continuePaymentInvoice, setContinuePaymentInvoice] = useState<EmployeeInvoiceRecord | null>(null);
  const [activeManualInvoice, setActiveManualInvoice] = useState<EmployeeInvoiceRecord | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<EmployeeInvoiceRecord | null>(null);
  const [invoiceDetailEvidence, setInvoiceDetailEvidence] = useState<ManualPaymentEvidenceRow[]>([]);
  const [isLoadingInvoiceDetailEvidence, setIsLoadingInvoiceDetailEvidence] = useState(false);
  const [manualReferenceNumber, setManualReferenceNumber] = useState("");
  const [manualPaymentDate, setManualPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualDeclaration, setManualDeclaration] = useState(false);
  const [confirmingManualInvoiceId, setConfirmingManualInvoiceId] = useState<string | null>(null);

  const resetManualDialogForm = useCallback(() => {
    setActiveManualInvoice(null);
    setManualReferenceNumber("");
    setManualPaymentDate(new Date().toISOString().slice(0, 10));
    setManualDeclaration(false);
  }, []);

  const fetchData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [pkgRes, invRes, tenantRes, minDurationRes] = await Promise.all([
          supabase
            .from("subscription_packages")
            .select("id, name, duration_months, base_price_per_month, discount_percentage, description")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("invoices")
            .select(
              "id, invoice_number, status, gross_amount, created_at, due_date, paid_at, package_name, package_duration_months, employee_count, price_per_employee, subtotal, discount_amount, vat_percentage, vat_amount, ppn_percentage, ppn_amount, pph_percentage, pph_amount, invoice_url, payment_proof_url, payment_method_type, rejection_reason, metadata",
            )
            .eq("tenant_id", tenantId)
            .eq("metadata->>billing_scope", "individual")
            .eq("metadata->>employee_id", employeeId)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase.from("tenants").select("billing_mode, organization_type").eq("id", tenantId).maybeSingle(),
          supabase
            .from("billing_settings")
            .select("setting_key, setting_value")
            .in("setting_key", [
              INDIVIDUAL_MIN_DURATION_SETTING_KEY,
              CENTRALIZED_MIN_DURATION_SETTING_KEYS.pemerintah_daerah,
              CENTRALIZED_MIN_DURATION_SETTING_KEYS.instansi_pemerintah,
              CENTRALIZED_MIN_DURATION_SETTING_KEYS.perusahaan,
              CENTRALIZED_MIN_DURATION_SETTING_KEYS.sekolah,
            ]),
        ]);

        if (pkgRes.error) throw pkgRes.error;
        if (invRes.error) throw invRes.error;
        if (tenantRes.error) throw tenantRes.error;
        if (minDurationRes.error) throw minDurationRes.error;

        const minDurationRows = (minDurationRes.data || []) as BillingSettingRow[];
        const minDurationMap = new Map(minDurationRows.map((row) => [row.setting_key, row.setting_value]));
        const resolvedMinDuration = resolveMinimumBillingDuration({
          billingMode: tenantRes.data?.billing_mode,
          organizationType: tenantRes.data?.organization_type,
          getSettingValue: (key) => minDurationMap.get(key),
        });
        setMinDurationMonths(resolvedMinDuration);

        const packageRows = ((pkgRes.data || []) as SubscriptionPackage[]).filter(
          (pkg) => Number(pkg.duration_months || 0) >= resolvedMinDuration,
        );
        const invoiceRows = ((invRes.data || []) as EmployeeInvoiceRecord[]).filter((row) => {
          const scope = parseMetadataScope(row.metadata);
          const scopedEmployeeId = parseMetadataEmployeeId(row.metadata);
          return scope === "individual" && scopedEmployeeId === employeeId;
        });

        setPackages(packageRows);
        setInvoices(invoiceRows);
        setSelectedPkgId((prev) => {
          if (prev && packageRows.some((pkg) => pkg.id === prev)) return prev;
          return packageRows[0]?.id || "";
        });
      } catch (error) {
        const errorRef = reportError(error, "employee.billing.fetch_data", {
          tenant_id: tenantId,
          employee_id: employeeId,
        });
        toast.error(appendErrorReference("Gagal memuat data billing.", errorRef));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [employeeId, tenantId],
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const selectedPkg = useMemo(
    () => packages.find((pkg) => pkg.id === selectedPkgId) || null,
    [packages, selectedPkgId],
  );

  const latestActiveInvoice = useMemo(() => {
    return (
      invoices.find((invoice) => isActiveInvoiceStatus(invoice.status)) || null
    );
  }, [invoices]);

  const openXenditFallbackOverlay = useCallback((invoice: EmployeeInvoiceRecord | null, message?: string | null) => {
    if (!invoice) return;
    const normalizedMessage = (message || "").trim();
    setXenditFallbackMessage(
      normalizedMessage || "Pembayaran online Xendit tidak aktif. Lanjutkan pembayaran melalui transfer manual.",
    );
    setXenditFallbackInvoice(invoice);
  }, []);

  const openManualConfirmDialog = useCallback((invoice: EmployeeInvoiceRecord) => {
    setActiveManualInvoice(invoice);
    setManualReferenceNumber("");
    setManualPaymentDate(new Date().toISOString().slice(0, 10));
    setManualDeclaration(false);
  }, []);

  const openInvoiceDetail = useCallback(
    async (invoice: EmployeeInvoiceRecord) => {
      setInvoiceDetail(invoice);
      setInvoiceDetailEvidence([]);
      if (invoice.payment_method_type !== "MANUAL_TRANSFER") {
        return;
      }
      setIsLoadingInvoiceDetailEvidence(true);
      try {
        const { data, error } = await supabase
          .from("manual_payments")
          .select(
            "id, status, payment_date, created_at, transfer_proof_url, amount, confirmed_amount, verified_amount, verification_method, rejection_reason, notes",
          )
          .eq("tenant_id", tenantId)
          .eq("invoice_number", invoice.invoice_number)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        setInvoiceDetailEvidence((data || []) as ManualPaymentEvidenceRow[]);
      } catch (error) {
        const errorRef = reportError(error, "employee.billing.invoice_detail.fetch_evidence", {
          tenant_id: tenantId,
          employee_id: employeeId,
          invoice_id: invoice.id,
        });
        toast.error(appendErrorReference("Gagal memuat detail bukti pembayaran.", errorRef));
      } finally {
        setIsLoadingInvoiceDetailEvidence(false);
      }
    },
    [employeeId, tenantId],
  );

  const handleConfirmManualTransfer = useCallback(
    async () => {
      const invoice = activeManualInvoice;
      if (!invoice) return;
      const normalizedStatus = (invoice.status || "").toUpperCase();
      if (!canConfirmManualTransfer(invoice)) return;
      if (!manualDeclaration) {
        toast.warning("Centang deklarasi konfirmasi transfer terlebih dahulu.");
        return;
      }
      if (!manualPaymentDate) {
        toast.warning("Tanggal transfer wajib diisi.");
        return;
      }

      setConfirmingManualInvoiceId(invoice.id);
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          toast.error("Sesi login tidak valid. Silakan login ulang.");
          return;
        }

        const requestPayload: Record<string, unknown> = {
          tenant_id: tenantId,
          employee_id: employeeId,
          invoice_id: invoice.id,
          reference_number: manualReferenceNumber.trim() || null,
          payment_date: manualPaymentDate,
        };

        const { data, error } = await supabase.functions.invoke<{
          success?: boolean;
          error?: string;
          trace_id?: string;
          status?: string;
        }>("confirm-manual-transfer", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: requestPayload,
        });

        if (error) throw error;
        if (!data?.success) {
          toast.warning(data?.error || "Konfirmasi transfer belum berhasil diproses.");
          return;
        }

        if (["AWAITING_VERIFICATION", "AWAITING_VERIFICATION_FULL"].includes((data.status || "").toUpperCase())) {
          toast.success("Konfirmasi transfer terkirim. Menunggu verifikasi admin.");
        } else if (normalizedStatus === "PAID") {
          toast.success("Invoice sudah lunas.");
        } else {
          toast.success("Konfirmasi transfer berhasil dikirim.");
        }

        resetManualDialogForm();
        await fetchData({ silent: true });
      } catch (error) {
        const errorRef = reportError(error, "employee.billing.confirm_manual_transfer", {
          tenant_id: tenantId,
          employee_id: employeeId,
          invoice_id: invoice.id,
        });
        toast.error(appendErrorReference("Gagal mengirim konfirmasi transfer.", errorRef));
      } finally {
        setConfirmingManualInvoiceId(null);
      }
    },
    [
      activeManualInvoice,
      employeeId,
      fetchData,
      manualDeclaration,
      manualPaymentDate,
      manualReferenceNumber,
      resetManualDialogForm,
      tenantId,
    ],
  );

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => (invoice.status || "").toUpperCase() === "PAID"),
    [invoices],
  );

  const coverageEndAt = useMemo(() => computeCoverageEnd(paidInvoices), [paidInvoices]);
  const hasActiveCoverage = Boolean(coverageEndAt && coverageEndAt.getTime() > Date.now());

  const latestInvoiceProofUrl = useMemo(() => {
    const fallbackFromInvoice = (invoiceDetail?.payment_proof_url || "").trim();
    const fallbackFromEvidence = (invoiceDetailEvidence[0]?.transfer_proof_url || "").trim();
    return fallbackFromInvoice || fallbackFromEvidence || null;
  }, [invoiceDetail?.payment_proof_url, invoiceDetailEvidence]);

  const isPdfProof = useMemo(() => {
    if (!latestInvoiceProofUrl) return false;
    return /\.pdf($|[?#])/i.test(latestInvoiceProofUrl);
  }, [latestInvoiceProofUrl]);

  const invoiceDetailBreakdown = useMemo(() => {
    if (!invoiceDetail) return null;

    const durationMonths = Math.max(1, Number(invoiceDetail.package_duration_months || 1));
    const employeeCount = Math.max(1, Number(invoiceDetail.employee_count || 1));
    const unitPrice = Math.max(0, Number(invoiceDetail.price_per_employee || 0));

    const subtotalRaw = Number(invoiceDetail.subtotal ?? 0);
    const subtotal = subtotalRaw > 0 ? subtotalRaw : Math.max(0, unitPrice * employeeCount * durationMonths);
    const discountAmount = Math.max(0, Number(invoiceDetail.discount_amount ?? 0));
    const taxableBase = Math.max(0, subtotal - discountAmount);

    const ppnPercentage = Math.max(0, Number(invoiceDetail.ppn_percentage ?? 0));
    const pphPercentage = Math.max(0, Number(invoiceDetail.pph_percentage ?? 0));
    const combinedVatPercentage = Math.max(0, Number(invoiceDetail.vat_percentage ?? 0));
    const serviceFeePercentage = combinedVatPercentage > 0 ? combinedVatPercentage : ppnPercentage + pphPercentage;

    const ppnAmountRaw = Math.max(0, Number(invoiceDetail.ppn_amount ?? 0));
    const pphAmountRaw = Math.max(0, Number(invoiceDetail.pph_amount ?? 0));
    const vatAmountRaw = Math.max(0, Number(invoiceDetail.vat_amount ?? 0));
    const splitTaxAmount = ppnAmountRaw + pphAmountRaw;
    const serviceFeeAmount =
      splitTaxAmount > 0
        ? splitTaxAmount
        : vatAmountRaw > 0
          ? vatAmountRaw
          : serviceFeePercentage > 0
            ? taxableBase * (serviceFeePercentage / 100)
            : 0;

    return {
      employeeCount,
      durationMonths,
      unitPrice,
      subtotal,
      discountAmount,
      taxableBase,
      serviceFeePercentage,
      serviceFeeAmount,
      total: Math.max(0, Number(invoiceDetail.gross_amount || 0)),
    };
  }, [invoiceDetail]);

  const handleCreateOrContinueInvoice = useCallback(async () => {
    if (!selectedPkg) {
      toast.warning("Pilih paket terlebih dahulu.");
      return;
    }

    if (latestActiveInvoice && isActiveInvoiceStatus(latestActiveInvoice.status)) {
      if (latestActiveInvoice.payment_method_type === "MANUAL_TRANSFER") {
        openXenditFallbackOverlay(
          latestActiveInvoice,
          "Pembayaran online Xendit tidak aktif. Lanjutkan pembayaran melalui transfer manual.",
        );
        return;
      }
      setContinuePaymentInvoice(latestActiveInvoice);
      return;
    }

    setIsCreatingInvoice(true);
    try {
      const { data, error } = await supabase.functions.invoke<XenditInvoiceResponse>("create-xendit-invoice", {
        body: {
          tenant_id: tenantId,
          package_id: selectedPkg.id,
          employee_count: 1,
          duration_months: selectedPkg.duration_months,
          description: `Billing Mandiri - ${selectedPkg.name}`,
          billing_scope: "individual",
          employee_id: employeeId,
        },
      });

      if (error) throw error;
      if (!data?.success) {
        const invoiceNo = data?.active_invoice?.invoice_number || null;
        if (invoiceNo) {
          toast.warning(`Masih ada invoice aktif ${invoiceNo}. Selesaikan invoice tersebut terlebih dahulu.`);
        } else {
          toast.warning(data?.error || "Invoice belum bisa dibuat saat ini.");
        }
        return;
      }

      const createdInvoiceUrl = data.invoice?.invoice_url || null;
      const createdInvoiceNo = data.invoice?.invoice_number || "-";
      const createdInvoiceId = data.invoice?.id || data.active_invoice?.id || null;
      const fallbackManual = data.fallback_payment_method === "MANUAL_TRANSFER";
      const createdMethod = data.invoice?.payment_method_type || null;
      const knownInvoice =
        invoices.find((row) => {
          if (createdInvoiceId && row.id === createdInvoiceId) return true;
          return Boolean(createdInvoiceNo) && row.invoice_number === createdInvoiceNo;
        }) || null;
      const continuationInvoice =
        knownInvoice ||
        (createdInvoiceId
          ? {
              id: createdInvoiceId,
              invoice_number: createdInvoiceNo,
              status: "PENDING",
              gross_amount: Number(data.invoice?.gross_amount || 0),
              created_at: new Date().toISOString(),
              due_date: data.invoice?.due_date || data.active_invoice?.due_date || null,
              paid_at: null,
              package_name: selectedPkg.name,
              package_duration_months: selectedPkg.duration_months,
              invoice_url: data.invoice?.invoice_url || null,
              payment_method_type: createdMethod || (fallbackManual ? "MANUAL_TRANSFER" : null),
            }
          : null);

      if (data.reused) {
        toast.info(`Invoice aktif ${createdInvoiceNo} digunakan kembali.`);
      } else {
        toast.success(`Invoice ${createdInvoiceNo} berhasil dibuat.`);
      }

      if (createdInvoiceUrl && createdMethod !== "MANUAL_TRANSFER") {
        window.open(createdInvoiceUrl, "_blank", "noopener,noreferrer");
      } else if (fallbackManual || createdMethod === "MANUAL_TRANSFER") {
        openXenditFallbackOverlay(
          continuationInvoice,
          data.message || "Pembayaran online Xendit tidak aktif. Lanjutkan pembayaran melalui transfer manual.",
        );
      } else {
        toast.info("Invoice dibuat tanpa URL pembayaran. Silakan cek riwayat invoice.");
      }

      await fetchData({ silent: true });
    } catch (error) {
      const errorRef = reportError(error, "employee.billing.create_invoice", {
        tenant_id: tenantId,
        employee_id: employeeId,
        package_id: selectedPkg.id,
      });
      toast.error(appendErrorReference("Gagal membuat invoice.", errorRef));
    } finally {
      setIsCreatingInvoice(false);
    }
  }, [employeeId, fetchData, invoices, latestActiveInvoice, openXenditFallbackOverlay, selectedPkg, tenantId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack ? (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <div>
            <h2 className="text-xl font-bold">Billing Mandiri</h2>
            <p className="text-sm text-muted-foreground">Kelola invoice dan pembayaran akun Anda.</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchData({ silent: true })}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Refresh
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" />
            Status Billing
          </CardTitle>
          <CardDescription>Status akses Anda ditentukan dari invoice individual yang sudah lunas.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasActiveCoverage ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-200">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Billing aktif
              </p>
              <p className="mt-1">
                Berlaku sampai{" "}
                <strong>
                  {coverageEndAt ? format(coverageEndAt, "d MMM yyyy", { locale: idLocale }) : "-"}
                </strong>
                .
              </p>
            </div>
          ) : latestActiveInvoice ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <p className="flex items-center gap-2 font-medium">
                <Clock className="h-4 w-4" />
                Menunggu pembayaran
              </p>
              <p className="mt-1">
                Invoice aktif <strong>{latestActiveInvoice.invoice_number}</strong>{" "}
                {latestActiveInvoice.due_date
                  ? `jatuh tempo ${format(new Date(latestActiveInvoice.due_date), "d MMM yyyy", { locale: idLocale })}`
                  : "sedang diproses"}.
              </p>
              {latestActiveInvoice.payment_method_type === "MANUAL_TRANSFER" ? (
                <p className="mt-2 text-xs">
                  Metode pembayaran: <strong>Transfer Manual</strong>. Setelah transfer, klik tombol{" "}
                  <strong>Konfirmasi Transfer</strong> pada riwayat invoice.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Belum aktif
              </p>
              <p className="mt-1">Buat invoice lalu selesaikan pembayaran untuk membuka akses penuh.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pilih Paket</CardTitle>
          <CardDescription>
            Harga final mengikuti invoice yang dibuat sistem. Pilih satu paket untuk membuat invoice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Minimum durasi pembayaran billing mandiri: <strong>{minDurationMonths} bulan</strong>.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {packages.map((pkg) => (
              <button
                type="button"
                key={pkg.id}
                onClick={() => setSelectedPkgId(pkg.id)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  selectedPkgId === pkg.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <p className="font-semibold">{pkg.name}</p>
                <p className="text-sm text-muted-foreground">{pkg.duration_months} bulan</p>
                <p className="mt-2 text-sm">
                  {formatCurrency(pkg.base_price_per_month)}/bulan
                  {pkg.discount_percentage > 0 ? ` • diskon ${pkg.discount_percentage}%` : ""}
                </p>
              </button>
            ))}
          </div>
          {packages.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
              Tidak ada paket aktif yang memenuhi minimum {minDurationMonths} bulan.
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {selectedPkg ? (
              <p className="text-sm text-muted-foreground">
                Paket dipilih: <strong>{selectedPkg.name}</strong> ({selectedPkg.duration_months} bulan)
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada paket dipilih.</p>
            )}

            <Button
              type="button"
              onClick={() => void handleCreateOrContinueInvoice()}
              disabled={!selectedPkg || isCreatingInvoice}
            >
              {isCreatingInvoice ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses
                </>
              ) : latestActiveInvoice ? (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Lanjutkan Pembayaran
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Buat Invoice
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-primary" />
            Riwayat Invoice Anda
          </CardTitle>
          <CardDescription>Hanya invoice individual yang terkait akun Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <Receipt className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">Belum ada invoice individual.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openInvoiceDetail(invoice)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void openInvoiceDetail(invoice);
                    }
                  }}
                  className="flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold">{invoice.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(invoice.created_at), "d MMM yyyy", { locale: idLocale })}
                      {invoice.package_name ? ` • ${invoice.package_name}` : ""}
                    </p>
                    {invoice.due_date ? (
                      <p className="text-xs text-muted-foreground">
                        Jatuh tempo {format(new Date(invoice.due_date), "d MMM yyyy", { locale: idLocale })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{formatCurrency(invoice.gross_amount || 0)}</p>
                    {getInvoiceStatusBadge(invoice.status)}
                    {invoice.invoice_url && isActiveInvoiceStatus(invoice.status) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.open(invoice.invoice_url || "", "_blank", "noopener,noreferrer");
                        }}
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Bayar
                      </Button>
                    ) : null}
                    {canConfirmManualTransfer(invoice) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={confirmingManualInvoiceId === invoice.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          openManualConfirmDialog(invoice);
                        }}
                      >
                        {confirmingManualInvoiceId === invoice.id ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Mengirim
                          </>
                        ) : (
                          "Konfirmasi Transfer"
                        )}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void openInvoiceDetail(invoice);
                      }}
                    >
                      Detail
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(invoiceDetail)}
        onOpenChange={(open) => {
          if (!open) {
            setInvoiceDetail(null);
            setInvoiceDetailEvidence([]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Invoice</DialogTitle>
            <DialogDescription>
              Ringkasan invoice dan data konfirmasi transfer untuk <strong>{invoiceDetail?.invoice_number || "-"}</strong>.
            </DialogDescription>
          </DialogHeader>

          {invoiceDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Nomor Invoice</p>
                  <p className="font-medium">{invoiceDetail.invoice_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div>{getInvoiceStatusBadge(invoiceDetail.status)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tanggal Invoice</p>
                  <p className="font-medium">
                    {format(new Date(invoiceDetail.created_at), "d MMM yyyy", { locale: idLocale })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Jatuh Tempo</p>
                  <p className="font-medium">
                    {invoiceDetail.due_date
                      ? format(new Date(invoiceDetail.due_date), "d MMM yyyy", { locale: idLocale })
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paket</p>
                  <p className="font-medium">
                    {invoiceDetail.package_name || "-"}
                    {invoiceDetail.package_duration_months ? ` (${invoiceDetail.package_duration_months} bulan)` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Metode</p>
                  <p className="font-medium">
                    {invoiceDetail.payment_method_type === "MANUAL_TRANSFER" ? "Transfer Manual" : "Pembayaran Online"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-semibold">{formatCurrency(invoiceDetail.gross_amount || 0)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Rincian Perhitungan</p>
                {invoiceDetailBreakdown ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Jumlah pegawai</span>
                      <span className="font-medium">{invoiceDetailBreakdown.employeeCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Durasi paket</span>
                      <span className="font-medium">{invoiceDetailBreakdown.durationMonths} bulan</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Harga/pegawai/bulan</span>
                      <span className="font-medium">{formatCurrency(invoiceDetailBreakdown.unitPrice)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatCurrency(invoiceDetailBreakdown.subtotal)}</span>
                    </div>
                    {invoiceDetailBreakdown.discountAmount > 0 ? (
                      <div className="flex items-center justify-between gap-3 text-emerald-700">
                        <span>Diskon</span>
                        <span>-{formatCurrency(invoiceDetailBreakdown.discountAmount)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Dasar perhitungan</span>
                      <span>{formatCurrency(invoiceDetailBreakdown.taxableBase)}</span>
                    </div>
                    {invoiceDetailBreakdown.serviceFeeAmount > 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Service Fee</span>
                        <span>{formatCurrency(invoiceDetailBreakdown.serviceFeeAmount)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 border-t pt-2 font-semibold">
                      <span>Total invoice</span>
                      <span>{formatCurrency(invoiceDetailBreakdown.total)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Rincian belum tersedia.</p>
                )}
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Bukti Pembayaran</p>
                {isLoadingInvoiceDetailEvidence ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat bukti pembayaran...
                  </div>
                ) : latestInvoiceProofUrl ? (
                  <div className="space-y-2">
                    {isPdfProof ? (
                      <iframe
                        src={latestInvoiceProofUrl}
                        title={`Bukti pembayaran ${invoiceDetail.invoice_number}`}
                        className="h-[52vh] w-full rounded-md border bg-white"
                      />
                    ) : (
                      <img
                        src={latestInvoiceProofUrl}
                        alt={`Bukti pembayaran ${invoiceDetail.invoice_number}`}
                        className="max-h-[52vh] w-full rounded-md border object-contain"
                      />
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <a href={latestInvoiceProofUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Buka bukti di tab baru
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Tidak ada file bukti transfer pada konfirmasi ini. Gunakan No. Ref untuk pelacakan transaksi.
                  </p>
                )}
              </div>

              {invoiceDetailEvidence.length > 0 ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Riwayat Konfirmasi Transfer</p>
                  <div className="space-y-2">
                    {invoiceDetailEvidence.map((item) => (
                      <div key={item.id} className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
                        <p className="font-medium uppercase">{item.status || "-"}</p>
                        <p className="text-muted-foreground">
                          {item.payment_date
                            ? `Tanggal transfer ${format(new Date(item.payment_date), "d MMM yyyy", { locale: idLocale })}`
                            : `Dibuat ${format(new Date(item.created_at), "d MMM yyyy HH:mm", { locale: idLocale })}`}
                        </p>
                        <p className="text-muted-foreground">
                          Nominal klaim: {formatCurrency(Number(item.confirmed_amount ?? item.amount ?? 0))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDetail(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(xenditFallbackInvoice)}
        onOpenChange={(open) => {
          if (!open) {
            setXenditFallbackInvoice(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pembayaran Xendit Tidak Aktif</DialogTitle>
            <DialogDescription>{xenditFallbackMessage}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Invoice</p>
              <p className="font-semibold">{xenditFallbackInvoice?.invoice_number || "-"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Metode: <strong>Transfer Manual</strong>
              </p>
              <p className="mt-2 text-base font-semibold">
                {formatCurrency(xenditFallbackInvoice?.gross_amount || 0)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Setelah transfer, lanjutkan melalui dialog <strong>Konfirmasi Transfer</strong> dan isi No. Ref bila ada.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setXenditFallbackInvoice(null)}>
              Tutup
            </Button>
            <Button
              onClick={() => {
                const nextInvoice = xenditFallbackInvoice;
                setXenditFallbackInvoice(null);
                if (!nextInvoice) return;
                setContinuePaymentInvoice(nextInvoice);
              }}
            >
              Lanjutkan Transfer Manual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(continuePaymentInvoice)}
        onOpenChange={(open) => {
          if (!open) {
            setContinuePaymentInvoice(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lanjutkan Pembayaran</DialogTitle>
            <DialogDescription>
              Invoice aktif terdeteksi. Lanjutkan proses pembayaran dari invoice berikut.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{continuePaymentInvoice?.invoice_number || "-"}</p>
                {continuePaymentInvoice ? getInvoiceStatusBadge(continuePaymentInvoice.status) : null}
              </div>
              <p className="text-sm font-medium">{formatCurrency(continuePaymentInvoice?.gross_amount || 0)}</p>
              <p className="text-xs text-muted-foreground">
                Jatuh tempo{" "}
                {continuePaymentInvoice?.due_date
                  ? format(new Date(continuePaymentInvoice.due_date), "d MMM yyyy", { locale: idLocale })
                  : "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                Metode:{" "}
                <strong>
                  {continuePaymentInvoice?.payment_method_type === "MANUAL_TRANSFER"
                    ? "Transfer Manual"
                    : "Pembayaran Online"}
                </strong>
              </p>
            </div>

            {continuePaymentInvoice?.payment_method_type === "MANUAL_TRANSFER" ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
                Lakukan transfer sesuai nominal invoice, lalu kirim konfirmasi melalui tombol{" "}
                <strong>Konfirmasi Transfer</strong>.
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setContinuePaymentInvoice(null)}>
              Tutup
            </Button>
            {continuePaymentInvoice?.payment_method_type === "MANUAL_TRANSFER" ? (
              <Button
                onClick={() => {
                  if (!continuePaymentInvoice) return;
                  openManualConfirmDialog(continuePaymentInvoice);
                  setContinuePaymentInvoice(null);
                }}
                disabled={!continuePaymentInvoice || !canConfirmManualTransfer(continuePaymentInvoice)}
              >
                Konfirmasi Transfer
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (continuePaymentInvoice?.invoice_url) {
                    window.open(continuePaymentInvoice.invoice_url, "_blank", "noopener,noreferrer");
                  } else {
                    toast.info("URL pembayaran belum tersedia. Silakan refresh data invoice.");
                  }
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Buka Pembayaran
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeManualInvoice)}
        onOpenChange={(open) => {
          if (!open && !confirmingManualInvoiceId) {
            resetManualDialogForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi Transfer Manual</DialogTitle>
            <DialogDescription>
              Kirim konfirmasi untuk invoice <strong>{activeManualInvoice?.invoice_number || "-"}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Nominal invoice</p>
              <p className="text-lg font-semibold">
                {formatCurrency(activeManualInvoice?.gross_amount || 0)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-payment-date">Tanggal transfer</Label>
              <Input
                id="manual-payment-date"
                type="date"
                value={manualPaymentDate}
                onChange={(event) => setManualPaymentDate(event.target.value)}
                disabled={Boolean(confirmingManualInvoiceId)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-reference-number">No. Ref (opsional)</Label>
              <Input
                id="manual-reference-number"
                type="text"
                value={manualReferenceNumber}
                onChange={(event) => setManualReferenceNumber(event.target.value)}
                placeholder="Contoh: TRF-BRI-123456"
                disabled={Boolean(confirmingManualInvoiceId)}
              />
              <p className="text-xs text-muted-foreground">Isi jika ada nomor referensi dari mutasi/transfer bank.</p>
            </div>

            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="manual-transfer-declaration"
                checked={manualDeclaration}
                onCheckedChange={(checked) => setManualDeclaration(Boolean(checked))}
                disabled={Boolean(confirmingManualInvoiceId)}
              />
              <Label
                htmlFor="manual-transfer-declaration"
                className="text-sm font-normal leading-relaxed"
              >
                Saya menyatakan transfer sudah dilakukan sesuai nominal invoice.
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={resetManualDialogForm}
              disabled={Boolean(confirmingManualInvoiceId)}
            >
              Batal
            </Button>
            <Button
              onClick={() => void handleConfirmManualTransfer()}
              disabled={
                Boolean(confirmingManualInvoiceId) ||
                !manualDeclaration ||
                !manualPaymentDate ||
                !activeManualInvoice
              }
            >
              {confirmingManualInvoiceId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengirim
                </>
              ) : (
                "Kirim Konfirmasi"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
