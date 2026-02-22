import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowUpDown,
  CalendarRange,
  CircleAlert,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  FileUp,
  Filter,
  Landmark,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgActivationTab } from "@/components/org/OrgActivationTab";
import { GlossaryPanel } from "@/components/common/GlossaryPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { ACTIVE_INVOICE_STATUSES, isAmountOverRemaining, parseIntegerAmountInput } from "@/lib/billingGuards";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BILLING_INVOICE_TEMPLATE,
  renderBillingInvoiceTemplate,
} from "@/lib/billingInvoiceTemplate";

type InvoiceRow = Pick<
  Tables<"invoices">,
  | "id"
  | "invoice_number"
  | "issue_date"
  | "due_date"
  | "gross_amount"
  | "status"
  | "created_at"
  | "package_name"
  | "package_duration_months"
  | "employee_count"
  | "subtotal"
  | "discount_amount"
  | "vat_amount"
  | "vat_percentage"
  | "xendit_fee"
  | "net_amount"
  | "payment_method_type"
  | "payment_proof_url"
  | "invoice_url"
  | "external_id"
  | "paid_at"
  | "verified_at"
  | "rejection_reason"
  | "updated_at"
  | "metadata"
  | "notes"
>;

interface TenantBillingProfile {
  id: string;
  name: string;
  code: string;
  address: string | null;
}

interface SubscriptionSnapshot {
  status: string | null;
  end_date: string | null;
  grace_period_end: string | null;
}

interface BillingBankInfo {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface FinancialLedgerRow {
  id: string;
  transaction_date: string | null;
  payment_source: string | null;
  gross_amount: number | null;
}

interface ManualPaymentHistoryRow {
  id: string;
  amount: number;
  confirmed_amount: number | null;
  verified_amount: number | null;
  verification_method: string | null;
  status: string | null;
  payment_date: string | null;
  reference_number: string | null;
  transfer_proof_url: string | null;
  created_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
}

interface WalletTransactionRow {
  id: string;
  direction: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string | null;
  notes: string | null;
  created_at: string | null;
}

interface WalletSnapshot {
  balance: number;
  transactions: WalletTransactionRow[];
}

interface WalletTopupRequestRow {
  id: string;
  requested_amount: number;
  approved_amount: number | null;
  status: string;
  reference_number: string | null;
  notes: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

const CANCEL_REASON_OPTIONS = [
  { value: "employee_count_changed", label: "Jumlah pegawai berubah" },
  { value: "duration_changed", label: "Durasi paket berubah" },
  { value: "payment_method_changed", label: "Salah metode pembayaran" },
  { value: "invoice_data_mismatch", label: "Data invoice tidak sesuai" },
  { value: "other", label: "Lainnya" },
] as const;

const CANCEL_REASON_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CANCEL_REASON_OPTIONS.map((option) => [option.value, option.label]),
);

type BillingStatusFilter = "all" | "paid" | "unpaid";
type BillingMenu = "invoices" | "offers" | "topup";
type BillingSortField = "invoice_number" | "issue_date" | "due_date" | "gross_amount" | "status";
type BillingSortDirection = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const PAYMENT_PROOF_BUCKET = "payment-proofs";
const DEFAULT_BANK_INFO: BillingBankInfo = {
  bankName: "BCA",
  accountNumber: "1234567890",
  accountName: "PT AbsensiKu Indonesia",
};

const parseInvoiceTemplate = (value: unknown): string => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_BILLING_INVOICE_TEMPLATE;
  const raw = value as Record<string, unknown>;
  const template = raw.html_template;
  if (typeof template !== "string" || !template.trim()) return DEFAULT_BILLING_INVOICE_TEMPLATE;
  return template;
};

const sanitizeClientInvoiceTemplate = (template: string): string =>
  template.replace(
    /<tr>\s*<td[^>]*>\s*(PPN|PPH|Pajak|VAT|Tax|Taxes)[\s\S]*?<\/tr>/gi,
    "",
  );

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? 0 : size >= 100 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
};

const formatRupiahInput = (raw: string): string => {
  const value = parseIntegerAmountInput(raw);
  if (!value) return "";
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value)}`;
};

const formatInvoiceDate = (value: string | null) => {
  if (!value) return "-";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "-";
  return format(parsedDate, "dd-MM-yyyy", { locale: idLocale });
};

const isInvoicePaid = (status: string | null | undefined) => status === "PAID";
const isInvoiceAwaitingVerification = (status: string | null | undefined) =>
  ["AWAITING_VERIFICATION", "AWAITING_VERIFICATION_FULL", "PENDING_VERIFICATION_PARTIAL"].includes(
    (status || "").toUpperCase(),
  );
const isInvoicePending = (status: string | null | undefined) => status === "PENDING";
const isInvoicePartiallyPaid = (status: string | null | undefined) => status === "PARTIALLY_PAID";
const isInvoiceRejectedNeedsRevision = (status: string | null | undefined) => status === "REJECTED_NEEDS_REVISION";
const isInvoiceExpired = (status: string | null | undefined) => status === "EXPIRED";
const isInvoiceCancelled = (status: string | null | undefined) => status === "CANCELLED";
const isInvoicePayable = (status: string | null | undefined) =>
  isInvoicePending(status) ||
  isInvoiceAwaitingVerification(status) ||
  isInvoicePartiallyPaid(status) ||
  isInvoiceRejectedNeedsRevision(status);
const isInvoiceCancellableByOrg = (status: string | null | undefined) => isInvoicePending(status);

const getInvoiceStatusMeta = (status: string | null | undefined) => {
  if (isInvoicePending(status)) {
    return {
      label: "Menunggu Pembayaran",
      className: "border-amber-300 bg-amber-50 text-amber-700",
    };
  }
  if (isInvoiceAwaitingVerification(status)) {
    return {
      label: "Menunggu Verifikasi",
      className: "border-blue-300 bg-blue-50 text-blue-700",
    };
  }
  if (isInvoicePartiallyPaid(status)) {
    return {
      label: "Cicilan Terverifikasi",
      className: "border-indigo-300 bg-indigo-50 text-indigo-700",
    };
  }
  if (isInvoiceRejectedNeedsRevision(status)) {
    return {
      label: "Ditolak - Wajib Revisi",
      className: "border-red-300 bg-red-50 text-red-700",
    };
  }
  if (isInvoicePaid(status)) {
    return {
      label: "Lunas",
      className: "border-green-300 bg-green-50 text-green-700",
    };
  }
  if (isInvoiceExpired(status)) {
    return {
      label: "Kedaluwarsa",
      className: "border-slate-300 bg-slate-100 text-slate-700",
    };
  }
  if (isInvoiceCancelled(status)) {
    return {
      label: "Dibatalkan",
      className: "border-red-300 bg-red-100 text-red-700",
    };
  }
  return {
    label: status ? status.replaceAll("_", " ") : "Belum Lunas",
    className: "border-zinc-300 bg-zinc-100 text-zinc-700",
  };
};

const getPaymentMethodLabel = (paymentMethodType: string | null | undefined) => {
  if (!paymentMethodType) return "-";
  if (paymentMethodType === "MANUAL_TRANSFER") return "Transfer Bank";
  if (paymentMethodType === "XENDIT") return "Xendit";
  return paymentMethodType.replaceAll("_", " ");
};

const getGatewayLabel = (paymentSource: string | null | undefined) => {
  if (!paymentSource) return "-";
  if (paymentSource === "XENDIT") return "Xendit";
  if (paymentSource === "MANUAL") return "Manual";
  return paymentSource.replaceAll("_", " ");
};

const getManualPaymentStatusMeta = (status: string | null | undefined) => {
  switch ((status || "").toLowerCase()) {
    case "verified":
      return { label: "Terverifikasi", className: "border-green-300 bg-green-50 text-green-700" };
    case "awaiting_verification_full":
      return { label: "Menunggu Verifikasi Penuh", className: "border-blue-300 bg-blue-50 text-blue-700" };
    case "pending_verification_partial":
      return { label: "Menunggu Verifikasi Parsial", className: "border-indigo-300 bg-indigo-50 text-indigo-700" };
    case "rejected":
      return { label: "Ditolak", className: "border-red-300 bg-red-50 text-red-700" };
    case "pending":
      return { label: "Menunggu Verifikasi", className: "border-amber-300 bg-amber-50 text-amber-700" };
    default:
      return { label: status || "-", className: "border-zinc-300 bg-zinc-100 text-zinc-700" };
  }
};

const getWalletTransactionTypeLabel = (type: string | null | undefined) => {
  switch ((type || "").toUpperCase()) {
    case "CREDIT_UNIQUE":
      return "Kredit Angka Unik";
    case "DEBIT_INVOICE":
      return "Auto Bayar Invoice";
    case "TOPUP":
      return "Topup";
    case "ADJUSTMENT":
      return "Penyesuaian";
    default:
      return type || "-";
  }
};

const getTopupStatusMeta = (status: string | null | undefined) => {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return { label: "Disetujui", className: "border-green-300 bg-green-50 text-green-700" };
    case "REJECTED":
      return { label: "Ditolak", className: "border-red-300 bg-red-50 text-red-700" };
    case "CANCELLED":
      return { label: "Dibatalkan", className: "border-zinc-300 bg-zinc-100 text-zinc-700" };
    default:
      return { label: "Menunggu", className: "border-amber-300 bg-amber-50 text-amber-700" };
  }
};

const getInvoiceDateValue = (invoice: Pick<InvoiceRow, "issue_date" | "created_at">) => {
  const raw = invoice.issue_date || invoice.created_at;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseBillingSettings = (value: unknown): BillingBankInfo => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_BANK_INFO;
  const raw = value as Record<string, unknown>;
  const bankName = raw.bank_name ?? raw.bankName;
  const accountNumber = raw.bank_account ?? raw.bankAccount;
  const accountName = raw.bank_account_name ?? raw.bankAccountName;
  return {
    bankName: typeof bankName === "string" && bankName.trim() ? bankName : DEFAULT_BANK_INFO.bankName,
    accountNumber:
      typeof accountNumber === "string" && accountNumber.trim()
        ? accountNumber
        : DEFAULT_BANK_INFO.accountNumber,
    accountName:
      typeof accountName === "string" && accountName.trim()
        ? accountName
        : DEFAULT_BANK_INFO.accountName,
  };
};

const getDueStatusMeta = (invoice: Pick<InvoiceRow, "due_date" | "status">) => {
  if (isInvoicePaid(invoice.status)) {
    return { label: "Lunas", className: "text-green-700" };
  }
  if (!invoice.due_date) {
    return { label: "Tanpa jatuh tempo", className: "text-muted-foreground" };
  }
  const dueTs = Date.parse(`${invoice.due_date}T23:59:59`);
  if (!Number.isFinite(dueTs)) {
    return { label: "Tanggal tidak valid", className: "text-muted-foreground" };
  }
  const now = Date.now();
  const diffDays = Math.ceil((dueTs - now) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    return { label: `Terlambat ${Math.abs(diffDays)} hari`, className: "text-red-700" };
  }
  if (diffDays === 0) {
    return { label: "Jatuh tempo hari ini", className: "text-amber-700" };
  }
  if (diffDays <= 3) {
    return { label: `Jatuh tempo H-${diffDays}`, className: "text-amber-700" };
  }
  return { label: `Jatuh tempo H-${diffDays}`, className: "text-muted-foreground" };
};

const toCsvCell = (value: unknown) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderStatusBadge = (
  status: string | null | undefined,
  options?: { onClick?: () => void },
) => {
  const statusMeta = getInvoiceStatusMeta(status);
  const baseClass = cn(
    "min-w-[120px] rounded-sm border px-3 py-1 text-center text-sm font-semibold",
    statusMeta.className,
  );

  if (!options?.onClick) {
    return <div className={baseClass}>{statusMeta.label}</div>;
  }

  return (
    <button
      type="button"
      onClick={options.onClick}
      className={cn(
        baseClass,
        "transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      {statusMeta.label}
    </button>
  );
};

export default function OrgBilling() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantProfile, setTenantProfile] = useState<TenantBillingProfile | null>(null);
  const [subscriptionSnapshot, setSubscriptionSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [bankInfo, setBankInfo] = useState<BillingBankInfo>(DEFAULT_BANK_INFO);
  const [invoiceTemplateHtml, setInvoiceTemplateHtml] = useState(DEFAULT_BILLING_INVOICE_TEMPLATE);
  const [walletSnapshot, setWalletSnapshot] = useState<WalletSnapshot | null>(null);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [walletTopupRequests, setWalletTopupRequests] = useState<WalletTopupRequestRow[]>([]);
  const [isWalletTopupLoading, setIsWalletTopupLoading] = useState(false);
  const [topupAmountInput, setTopupAmountInput] = useState("");
  const [topupReferenceInput, setTopupReferenceInput] = useState("");
  const [topupNotesInput, setTopupNotesInput] = useState("");
  const [isSubmittingTopup, setIsSubmittingTopup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BillingStatusFilter>("all");
  const [activeBillingMenu, setActiveBillingMenu] = useState<BillingMenu>("invoices");
  const [sortField, setSortField] = useState<BillingSortField>("issue_date");
  const [sortDirection, setSortDirection] = useState<BillingSortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailTransactions, setDetailTransactions] = useState<FinancialLedgerRow[]>([]);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [detailTransactionError, setDetailTransactionError] = useState<string | null>(null);
  const [detailManualPayments, setDetailManualPayments] = useState<ManualPaymentHistoryRow[]>([]);
  const [isManualPaymentLoading, setIsManualPaymentLoading] = useState(false);
  const [detailManualPaymentError, setDetailManualPaymentError] = useState<string | null>(null);
  const [issueDateFrom, setIssueDateFrom] = useState("");
  const [issueDateTo, setIssueDateTo] = useState("");
  const [manualPaidAmountInput, setManualPaidAmountInput] = useState("");
  const [manualProofFile, setManualProofFile] = useState<File | null>(null);
  const [manualProofPreviewUrl, setManualProofPreviewUrl] = useState<string | null>(null);
  const [isProofPreviewOpen, setIsProofPreviewOpen] = useState(false);
  const [isActualTransferDeclared, setIsActualTransferDeclared] = useState(false);
  const [isSubmittingPaymentProof, setIsSubmittingPaymentProof] = useState(false);
  const [cancelReasonCode, setCancelReasonCode] = useState<string>("");
  const [cancelReasonDetail, setCancelReasonDetail] = useState("");
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);
  const [isRevisingInvoice, setIsRevisingInvoice] = useState(false);
  const [isDuplicatingInvoice, setIsDuplicatingInvoice] = useState(false);
  const [shouldAutoFocusPaymentSection, setShouldAutoFocusPaymentSection] = useState(false);
  const [paymentSectionFlash, setPaymentSectionFlash] = useState(false);
  const [isProofUploadConfirmOpen, setIsProofUploadConfirmOpen] = useState(false);
  const proofFileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchWalletSnapshot = useCallback(async (resolvedTenantId: string) => {
    setIsWalletLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_tenant_wallet_snapshot" as never, {
        p_tenant_id: resolvedTenantId,
        p_limit: 20,
      } as never);
      if (error) throw error;

      const raw = (data || {}) as {
        balance?: number;
        transactions?: Array<{
          id?: string;
          direction?: string;
          transaction_type?: string;
          amount?: number;
          balance_before?: number;
          balance_after?: number;
          reference?: string | null;
          notes?: string | null;
          created_at?: string | null;
        }>;
      };

      const transactions: WalletTransactionRow[] = Array.isArray(raw.transactions)
        ? raw.transactions.map((row) => ({
            id: row.id || `${Date.now()}-${Math.random()}`,
            direction: row.direction || "",
            transaction_type: row.transaction_type || "",
            amount: Number(row.amount || 0),
            balance_before: Number(row.balance_before || 0),
            balance_after: Number(row.balance_after || 0),
            reference: row.reference || null,
            notes: row.notes || null,
            created_at: row.created_at || null,
          }))
        : [];

      setWalletSnapshot({
        balance: Number(raw.balance || 0),
        transactions,
      });
    } catch (error) {
      reportError(error, "org.billing.wallet.fetch", { tenant_id: resolvedTenantId });
      setWalletSnapshot({
        balance: 0,
        transactions: [],
      });
    } finally {
      setIsWalletLoading(false);
    }
  }, []);

  const fetchWalletTopupRequests = useCallback(async (resolvedTenantId: string) => {
    setIsWalletTopupLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_wallet_topup_requests_for_tenant" as never, {
        p_tenant_id: resolvedTenantId,
        p_limit: 50,
      } as never);
      if (error) throw error;
      const rows = ((data as { requests?: WalletTopupRequestRow[] } | null)?.requests || []).map((row) => ({
        id: row.id,
        requested_amount: Number(row.requested_amount || 0),
        approved_amount: row.approved_amount === null ? null : Number(row.approved_amount || 0),
        status: row.status || "PENDING",
        reference_number: row.reference_number || null,
        notes: row.notes || null,
        rejection_reason: row.rejection_reason || null,
        reviewed_at: row.reviewed_at || null,
        created_at: row.created_at || null,
      }));
      setWalletTopupRequests(rows);
    } catch (error) {
      reportError(error, "org.billing.wallet_topup.fetch", { tenant_id: resolvedTenantId });
      setWalletTopupRequests([]);
    } finally {
      setIsWalletTopupLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
      setLoadError(null);
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Avoid noisy error logs when user is not authenticated yet.
      if (!session) {
        setInvoices([]);
        setTenantId(null);
        setTenantProfile(null);
        setSubscriptionSnapshot(null);
        setWalletSnapshot(null);
        setWalletTopupRequests([]);
        return;
      }

      const resolvedTenantId = await resolveOrgTenantId();
      if (!resolvedTenantId) {
        throw new Error("Tenant organisasi tidak ditemukan");
      }
      setTenantId(resolvedTenantId);

      const [invoicesRes, tenantRes, subscriptionRes, billingSettingsRes, invoiceTemplateRes] = await Promise.all([
        supabase
          .from("invoices")
          .select(
            "id, invoice_number, issue_date, due_date, gross_amount, status, created_at, package_name, package_duration_months, employee_count, subtotal, discount_amount, vat_amount, vat_percentage, xendit_fee, net_amount, payment_method_type, payment_proof_url, invoice_url, external_id, paid_at, verified_at, rejection_reason, updated_at, metadata, notes",
          )
          .eq("tenant_id", resolvedTenantId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("tenants").select("id, name, code, address").eq("id", resolvedTenantId).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status, end_date, grace_period_end")
          .eq("tenant_id", resolvedTenantId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "billing_settings").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "billing_invoice_template").maybeSingle(),
      ]);

      if (invoicesRes.error) throw invoicesRes.error;
      if (tenantRes.error) {
        console.warn("Failed to load tenant profile for billing invoice preview:", tenantRes.error);
      }
      if (subscriptionRes.error) {
        console.warn("Failed to load subscription snapshot for billing:", subscriptionRes.error);
      }
      if (billingSettingsRes.error) {
        console.warn("Failed to load billing settings for bank info:", billingSettingsRes.error);
      }
      if (invoiceTemplateRes.error) {
        console.warn("Failed to load billing invoice template:", invoiceTemplateRes.error);
      }

      setInvoices((invoicesRes.data as InvoiceRow[]) || []);
      setTenantProfile(tenantRes.data || null);
      setSubscriptionSnapshot((subscriptionRes.data as SubscriptionSnapshot | null) || null);
      setBankInfo(parseBillingSettings(billingSettingsRes.data?.value));
      setInvoiceTemplateHtml(parseInvoiceTemplate(invoiceTemplateRes.data?.value));
    } catch (error) {
      const errorRef = reportError(error, "org.billing.fetch_invoices");
      const message = appendErrorReference("Gagal memuat data faktur", errorRef);
      setLoadError(message);
      setInvoices([]);
      setTenantId(null);
      setTenantProfile(null);
      setSubscriptionSnapshot(null);
      setWalletSnapshot(null);
      setWalletTopupRequests([]);
      if (!options?.silent) {
        toast.error(message);
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`org-billing-invoices-${tenantId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `tenant_id=eq.${tenantId}` },
        () => {
          void fetchInvoices({ silent: true });
          void fetchWalletSnapshot(tenantId);
          void fetchWalletTopupRequests(tenantId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_topup_requests", filter: `tenant_id=eq.${tenantId}` },
        () => {
          void fetchWalletTopupRequests(tenantId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenant_wallet_transactions", filter: `tenant_id=eq.${tenantId}` },
        () => {
          void fetchWalletSnapshot(tenantId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInvoices, fetchWalletSnapshot, fetchWalletTopupRequests, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void fetchWalletSnapshot(tenantId);
  }, [fetchWalletSnapshot, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void fetchWalletTopupRequests(tenantId);
  }, [fetchWalletTopupRequests, tenantId]);

  useEffect(() => {
    if (!selectedInvoice) return;
    const latest = invoices.find((entry) => entry.id === selectedInvoice.id);
    if (!latest) {
      setIsDetailOpen(false);
      setSelectedInvoice(null);
      return;
    }
    setSelectedInvoice(latest);
  }, [invoices, selectedInvoice]);

  useEffect(() => {
    if (!selectedInvoice) {
      setManualProofFile(null);
      setIsActualTransferDeclared(false);
      setCancelReasonCode("");
      setCancelReasonDetail("");
      if (proofFileInputRef.current) {
        proofFileInputRef.current.value = "";
      }
      return;
    }
    setManualProofFile(null);
    setIsActualTransferDeclared(false);
    setCancelReasonCode("");
    setCancelReasonDetail("");
    if (proofFileInputRef.current) {
      proofFileInputRef.current.value = "";
    }
  }, [selectedInvoice]);

  const statusCounts = useMemo(() => {
    const paid = invoices.filter((invoice) => isInvoicePaid(invoice.status)).length;
    const unpaid = invoices.filter((invoice) => isInvoicePayable(invoice.status)).length;
    const pendingVerification = invoices.filter((invoice) => isInvoiceAwaitingVerification(invoice.status)).length;
    const overdue = invoices.filter((invoice) => {
      if (!isInvoicePayable(invoice.status) || !invoice.due_date) return false;
      const dueAt = Date.parse(`${invoice.due_date}T23:59:59`);
      return Number.isFinite(dueAt) && dueAt < Date.now();
    }).length;
    return {
      all: invoices.length,
      paid,
      unpaid,
      pendingVerification,
      overdue,
    };
  }, [invoices]);

  const invoicesByStatus = useMemo(() => {
    if (statusFilter === "all") return invoices;
    if (statusFilter === "paid") {
      return invoices.filter((invoice) => isInvoicePaid(invoice.status));
    }
    return invoices.filter((invoice) => isInvoicePayable(invoice.status));
  }, [invoices, statusFilter]);

  const filteredInvoices = useMemo(() => {
    const fromDate = issueDateFrom ? Date.parse(`${issueDateFrom}T00:00:00`) : null;
    const toDate = issueDateTo ? Date.parse(`${issueDateTo}T23:59:59`) : null;
    const query = searchQuery.trim().toLowerCase();

    return invoicesByStatus.filter((invoice) => {
      const invoiceDateValue = getInvoiceDateValue(invoice);
      if (fromDate && Number.isFinite(fromDate) && invoiceDateValue < fromDate) return false;
      if (toDate && Number.isFinite(toDate) && invoiceDateValue > toDate) return false;

      const invoiceNumber = invoice.invoice_number?.toLowerCase() || "";
      const status = getInvoiceStatusMeta(invoice.status).label.toLowerCase();
      const issueDate = formatInvoiceDate(invoice.issue_date);
      const dueDate = formatInvoiceDate(invoice.due_date);
      const rejectionReason = invoice.rejection_reason?.toLowerCase() || "";

      if (!query) return true;

      return (
        invoiceNumber.includes(query) ||
        status.includes(query) ||
        issueDate.toLowerCase().includes(query) ||
        dueDate.toLowerCase().includes(query) ||
        rejectionReason.includes(query)
      );
    });
  }, [invoicesByStatus, issueDateFrom, issueDateTo, searchQuery]);

  const sortedInvoices = useMemo(() => {
    const rows = [...filteredInvoices];
    const compareDate = (value: string | null | undefined) => {
      if (!value) return 0;
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    rows.sort((left, right) => {
      let result = 0;
      if (sortField === "invoice_number") {
        const leftValue = left.invoice_number || "";
        const rightValue = right.invoice_number || "";
        const leftNum = Number(leftValue);
        const rightNum = Number(rightValue);
        if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
          result = leftNum - rightNum;
        } else {
          result = leftValue.localeCompare(rightValue);
        }
      } else if (sortField === "issue_date") {
        result = compareDate(left.issue_date || left.created_at) - compareDate(right.issue_date || right.created_at);
      } else if (sortField === "due_date") {
        result = compareDate(left.due_date) - compareDate(right.due_date);
      } else if (sortField === "gross_amount") {
        result = (left.gross_amount || 0) - (right.gross_amount || 0);
      } else if (sortField === "status") {
        result = Number(isInvoicePaid(left.status)) - Number(isInvoicePaid(right.status));
      }
      return sortDirection === "asc" ? result : -result;
    });

    return rows;
  }, [filteredInvoices, sortDirection, sortField]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, issueDateFrom, issueDateTo, pageSize, statusFilter, activeBillingMenu]);

  const totalEntries = sortedInvoices.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedInvoices = sortedInvoices.slice(startIndex, endIndex);

  const visiblePages = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    let start = Math.max(1, safeCurrentPage - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [safeCurrentPage, totalPages]);

  const hasActiveFilter =
    searchQuery.trim().length > 0 || statusFilter !== "all" || issueDateFrom.length > 0 || issueDateTo.length > 0;
  const dueInvoicesCount = statusCounts.unpaid;

  const statusFilterItems: Array<{ key: BillingStatusFilter; label: string; count: number }> = [
    { key: "all", label: "Semua", count: statusCounts.all },
    { key: "paid", label: "Lunas", count: statusCounts.paid },
    { key: "unpaid", label: "Belum Lunas", count: statusCounts.unpaid },
  ];

  const billingMenus: Array<{ key: BillingMenu; label: string }> = [
    { key: "invoices", label: "Faktur Saya" },
    { key: "offers", label: "Penawaran Saya" },
    { key: "topup", label: "Tambah Saldo" },
  ];

  const clearBillingDeepLinkQuery = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("menu");
    next.delete("invoice");
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const deepLinkMenu = searchParams.get("menu");
    if (deepLinkMenu === "invoices" || deepLinkMenu === "offers" || deepLinkMenu === "topup") {
      if (activeBillingMenu !== deepLinkMenu) {
        setActiveBillingMenu(deepLinkMenu);
      }
    }
  }, [activeBillingMenu, searchParams]);

  useEffect(() => {
    if (isLoading) return;
    const deepLinkInvoiceNumber = searchParams.get("invoice");
    if (!deepLinkInvoiceNumber) return;

    const normalizedInvoiceNumber = deepLinkInvoiceNumber.trim().toLowerCase();
    if (!normalizedInvoiceNumber) {
      clearBillingDeepLinkQuery();
      return;
    }

    const targetInvoice =
      invoices.find((row) => (row.invoice_number || "").trim().toLowerCase() === normalizedInvoiceNumber) || null;

    if (!targetInvoice) {
      toast.warning("Invoice tujuan tidak ditemukan. Silakan cek daftar faktur terbaru.");
      clearBillingDeepLinkQuery();
      return;
    }

    setActiveBillingMenu("invoices");
    setSelectedInvoice(targetInvoice);
    setManualPaidAmountInput(formatRupiahInput(String(Math.max(0, Math.round(targetInvoice.gross_amount || 0)))));
    setCancelReasonCode("");
    setCancelReasonDetail("");
    setManualProofFile(null);
    setIsActualTransferDeclared(false);
    if (proofFileInputRef.current) {
      proofFileInputRef.current.value = "";
    }
    setIsDetailOpen(true);

    if (searchParams.get("focus") === "payment-proof") {
      setShouldAutoFocusPaymentSection(true);
      setPaymentSectionFlash(true);
      window.setTimeout(() => setPaymentSectionFlash(false), 1800);
    }

    clearBillingDeepLinkQuery();
  }, [clearBillingDeepLinkQuery, invoices, isLoading, searchParams]);

  useEffect(() => {
    if (!shouldAutoFocusPaymentSection || !isDetailOpen || !selectedInvoice) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById("invoice-payment-confirmation-section");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      setShouldAutoFocusPaymentSection(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isDetailOpen, selectedInvoice, shouldAutoFocusPaymentSection]);

  const subscriptionStatusMeta = useMemo(() => {
    const status = subscriptionSnapshot?.status?.toLowerCase();
    if (status === "active") {
      return {
        label: "Aktif",
        badgeClassName: "border-green-300 bg-green-50 text-green-700",
        description: subscriptionSnapshot?.end_date
          ? `Berakhir ${formatInvoiceDate(subscriptionSnapshot.end_date)}`
          : "Langganan aktif",
      };
    }
    if (status === "grace_period") {
      return {
        label: "Masa Tenggang",
        badgeClassName: "border-amber-300 bg-amber-50 text-amber-700",
        description: subscriptionSnapshot?.grace_period_end
          ? `Masa tenggang sampai ${formatInvoiceDate(subscriptionSnapshot.grace_period_end)}`
          : "Segera lakukan pembayaran",
      };
    }
    if (status === "expired") {
      return {
        label: "Berakhir",
        badgeClassName: "border-red-300 bg-red-50 text-red-700",
        description: "Perlu pembayaran untuk aktivasi ulang",
      };
    }
    return {
      label: "Belum Aktif",
      badgeClassName: "border-zinc-300 bg-zinc-100 text-zinc-700",
      description: "Belum ada langganan aktif",
    };
  }, [subscriptionSnapshot]);

  const handleBillingMenuClick = (menu: BillingMenu) => {
    setActiveBillingMenu(menu);
  };

  const resetInvoiceFilters = () => {
    setIssueDateFrom("");
    setIssueDateTo("");
    setSearchQuery("");
    setStatusFilter("all");
  };

  const submitWalletTopupRequest = async () => {
    if (!tenantId) return;
    const parsedAmount = Number(topupAmountInput.replace(/[^\d]/g, ""));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Nominal topup wajib diisi dan lebih dari 0.");
      return;
    }

    setIsSubmittingTopup(true);
    try {
      const { data, error } = await supabase.rpc("submit_wallet_topup_request" as never, {
        p_tenant_id: tenantId,
        p_requested_amount: parsedAmount,
        p_reference_number: topupReferenceInput.trim() || null,
        p_notes: topupNotesInput.trim() || null,
      } as never);
      if (error) throw error;

      const reused = Boolean((data as { reused?: boolean } | null)?.reused);
      toast.success(
        reused
          ? "Masih ada request topup menunggu verifikasi. Sistem menggunakan request yang sama."
          : "Request topup berhasil dikirim. Menunggu verifikasi admin.",
      );
      setTopupAmountInput("");
      setTopupReferenceInput("");
      setTopupNotesInput("");
      await Promise.all([fetchWalletTopupRequests(tenantId), fetchWalletSnapshot(tenantId)]);
    } catch (error) {
      const errorRef = reportError(error, "org.billing.wallet_topup.submit", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal mengirim request topup.", errorRef));
    } finally {
      setIsSubmittingTopup(false);
    }
  };

  const exportInvoicesCsv = () => {
    if (sortedInvoices.length === 0) {
      toast.info("Tidak ada data faktur untuk diekspor");
      return;
    }

    const header = ["Nomor Faktur", "Tanggal Faktur", "Jatuh Tempo", "Total", "Status", "Metode Bayar", "Bukti Bayar"];
    const rows = sortedInvoices.map((invoice) => [
      getInvoiceNumber(invoice),
      formatInvoiceDate(invoice.issue_date || invoice.created_at),
      formatInvoiceDate(invoice.due_date),
      invoice.gross_amount || 0,
      getInvoiceStatusMeta(invoice.status).label,
      getPaymentMethodLabel(invoice.payment_method_type),
      invoice.payment_proof_url || "",
    ]);

    const csv = [header, ...rows]
      .map((columns) => columns.map((column) => toCsvCell(column)).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `billing-invoices-${format(new Date(), "yyyyMMdd-HHmmss")}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    toast.success("CSV faktur berhasil diunduh");
  };

  const openInvoiceCheckout = (invoice: InvoiceRow) => {
    if (!invoice.invoice_url) {
      toast.info("Faktur ini tidak memiliki link pembayaran online");
      return;
    }
    window.open(invoice.invoice_url, "_blank", "noopener,noreferrer");
  };

  const submitPaymentProof = async () => {
    if (!selectedInvoice || !tenantId) return;

    const paidAmount = parseIntegerAmountInput(manualPaidAmountInput);
    if (!manualProofFile) {
      toast.error("Unggah file bukti bayar terlebih dahulu.");
      return;
    }
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      toast.error("Nominal transfer wajib diisi dan harus lebih dari 0");
      return;
    }
    if (!isActualTransferDeclared) {
      toast.error("Centang deklarasi bahwa nominal sesuai transfer aktual sebelum kirim.");
      return;
    }
    if (isAmountOverRemaining(paidAmount, selectedInvoiceRemaining)) {
      toast.error(
        `Nominal transfer melebihi sisa tagihan (${formatCurrency(selectedInvoiceRemaining)}). Koreksi nominal konfirmasi.`,
      );
      return;
    }
    setIsSubmittingPaymentProof(true);
    try {
      let paymentProofUrl = "";
      let paymentProofPath: string | null = null;
      const safeName = manualProofFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const objectPath = `${tenantId}/${selectedInvoice.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(PAYMENT_PROOF_BUCKET)
        .upload(objectPath, manualProofFile, {
          cacheControl: "3600",
          contentType: manualProofFile.type || undefined,
          upsert: false,
        });

      if (uploadError) throw uploadError;
      paymentProofUrl = supabase.storage.from(PAYMENT_PROOF_BUCKET).getPublicUrl(objectPath).data.publicUrl;
      paymentProofPath = objectPath;

      if (!paymentProofUrl) {
        throw new Error("URL bukti bayar tidak tersedia");
      }

      const invoiceNumber = selectedInvoice.invoice_number || getInvoiceNumber(selectedInvoice);
      const { error: manualPaymentError } = await supabase
        .from("manual_payments")
        .insert({
          tenant_id: tenantId,
          amount: paidAmount,
          confirmed_amount: paidAmount,
          payment_method: "bank_transfer",
          transfer_proof_url: paymentProofUrl,
          transfer_proof_path: paymentProofPath,
          reference_number: null,
          payment_date: new Date().toISOString().slice(0, 10),
          status: paidAmount < selectedInvoiceRemaining ? "pending_verification_partial" : "awaiting_verification_full",
          invoice_number: invoiceNumber,
          notes: "Konfirmasi pembayaran dari /org/billing",
        });
      if (manualPaymentError) throw manualPaymentError;

      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          payment_proof_url: paymentProofUrl,
          status: paidAmount < selectedInvoiceRemaining ? "PENDING_VERIFICATION_PARTIAL" : "AWAITING_VERIFICATION_FULL",
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedInvoice.id)
        .eq("tenant_id", tenantId);

      if (updateError) throw updateError;

      toast.success("Bukti pembayaran berhasil dikirim. Menunggu verifikasi admin.");
      setManualProofFile(null);
      setIsActualTransferDeclared(false);
      if (proofFileInputRef.current) {
        proofFileInputRef.current.value = "";
      }
      await fetchInvoices({ silent: true });
    } catch (error) {
      const errorRef = reportError(error, "org.billing.submit_payment_proof", {
        invoice_id: selectedInvoice.id,
      });
      toast.error(appendErrorReference("Gagal mengirim bukti pembayaran", errorRef));
    } finally {
      setIsSubmittingPaymentProof(false);
    }
  };

  const cancelPendingInvoice = async () => {
    if (!selectedInvoice || !tenantId) return;
    if (!isInvoiceCancellableByOrg(selectedInvoice.status)) {
      toast.warning("Hanya faktur berstatus menunggu pembayaran yang bisa dibatalkan.");
      return;
    }
    if (!cancelReasonCode) {
      toast.error("Pilih alasan pembatalan.");
      return;
    }
    const detail = cancelReasonDetail.trim();
    if (cancelReasonCode === "other" && !detail) {
      toast.error("Isi detail alasan pembatalan untuk opsi Lainnya.");
      return;
    }
    const reasonLabel = CANCEL_REASON_LABEL_MAP[cancelReasonCode] || "Lainnya";
    const reason = cancelReasonCode === "other" ? detail : reasonLabel;
    const reasonAudit = `[${reasonLabel}] ${reason}`;

    setIsCancellingInvoice(true);
    try {
      const nextNotes = [selectedInvoice.notes, `[USER_CANCEL] ${reasonAudit}`]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n");

      const { error } = await supabase
        .from("invoices")
        .update({
          status: "CANCELLED",
          notes: nextNotes,
          rejection_reason: reasonAudit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedInvoice.id)
        .eq("tenant_id", tenantId);

      if (error) throw error;

      toast.success("Faktur berhasil dibatalkan.");
      await fetchInvoices({ silent: true });
    } catch (error) {
      const errorRef = reportError(error, "org.billing.cancel_invoice", {
        invoice_id: selectedInvoice.id,
      });
      toast.error(appendErrorReference("Gagal membatalkan faktur", errorRef));
    } finally {
      setIsCancellingInvoice(false);
    }
  };

  const reviseInvoiceViaActivation = async () => {
    if (!selectedInvoice || !tenantId) return;
    if (!isInvoiceCancellableByOrg(selectedInvoice.status)) {
      toast.warning("Revisi hanya bisa dilakukan saat faktur berstatus Menunggu Pembayaran.");
      return;
    }

    if (!cancelReasonCode) {
      toast.error("Pilih alasan pembatalan sebelum membuat revisi faktur.");
      return;
    }
    const detail = cancelReasonDetail.trim();
    if (cancelReasonCode === "other" && !detail) {
      toast.error("Isi detail alasan pembatalan untuk opsi Lainnya.");
      return;
    }
    const reasonLabel = CANCEL_REASON_LABEL_MAP[cancelReasonCode] || "Lainnya";
    const reason = cancelReasonCode === "other" ? detail : reasonLabel;
    const reasonAudit = `[${reasonLabel}] ${reason}`;

    setIsRevisingInvoice(true);
    try {
      const nextNotes = [selectedInvoice.notes, `[USER_REVISE] ${reasonAudit}`]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n");

      const { error: cancelError } = await supabase
        .from("invoices")
        .update({
          status: "CANCELLED",
          notes: nextNotes,
          rejection_reason: reasonAudit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedInvoice.id)
        .eq("tenant_id", tenantId);

      if (cancelError) throw cancelError;

      const { data: activePackages, error: packageError } = await supabase
        .from("subscription_packages")
        .select("id, name, duration_months")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (packageError) throw packageError;

      const matchedPackage = (activePackages || []).find(
        (pkg) =>
          pkg.name === (selectedInvoice.package_name || "") &&
          Number(pkg.duration_months || 0) === Number(selectedInvoice.package_duration_months || 0),
      );

      if (typeof window !== "undefined") {
        const calculatorKey = `org_activation_calculator:${tenantId}`;
        const nextMemberCount = Math.max(1, Number(selectedInvoice.employee_count || 1));
        window.localStorage.setItem(
          calculatorKey,
          JSON.stringify({
            packageId: matchedPackage?.id || "",
            memberCount: nextMemberCount,
          }),
        );
        window.localStorage.setItem(`org_activation_payment_method:${tenantId}`, "manual");
      }

      toast.success("Faktur lama dibatalkan. Lanjutkan revisi jumlah pegawai/bulan di halaman aktivasi.");
      await fetchInvoices({ silent: true });
      setIsDetailOpen(false);
      navigate("/org/activation?from=invoice-revision");
    } catch (error) {
      const errorRef = reportError(error, "org.billing.revise_invoice_via_activation", {
        invoice_id: selectedInvoice.id,
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menyiapkan revisi faktur", errorRef));
    } finally {
      setIsRevisingInvoice(false);
    }
  };

  const duplicateInvoiceAsNew = async () => {
    if (!selectedInvoice || !tenantId) return;
    if (isInvoicePayable(selectedInvoice.status)) {
      toast.warning("Faktur aktif tidak bisa diduplikasi. Batalkan atau selesaikan dulu faktur aktif.");
      return;
    }

    setIsDuplicatingInvoice(true);
    try {
      const { data: activeInvoice, error: activeInvoiceError } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("tenant_id", tenantId)
        .in("status", [...ACTIVE_INVOICE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeInvoiceError) throw activeInvoiceError;
      if (activeInvoice?.id) {
        toast.warning(
          `Masih ada faktur aktif ${activeInvoice.invoice_number || activeInvoice.id}. Selesaikan atau batalkan dulu sebelum membuat faktur baru.`,
        );
        return;
      }

      const { data: invoiceNumberData, error: invoiceNumberError } = await supabase.rpc("generate_invoice_number");
      if (invoiceNumberError) throw invoiceNumberError;
      const invoiceNumber = typeof invoiceNumberData === "string" ? invoiceNumberData.trim() : "";
      if (!invoiceNumber) {
        throw new Error("Nomor faktur otomatis tidak tersedia");
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);

      const { data: insertedInvoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          invoice_number: invoiceNumber,
          package_name: selectedInvoice.package_name || "Langganan Sistem Absensi",
          package_duration_months: selectedInvoice.package_duration_months || 1,
          package_discount_percentage: 0,
          employee_count: selectedInvoice.employee_count || 1,
          price_per_employee:
            (selectedInvoice.subtotal || selectedInvoice.gross_amount || 0) /
            Math.max(1, (selectedInvoice.employee_count || 1) * (selectedInvoice.package_duration_months || 1)),
          subtotal: selectedInvoice.subtotal || selectedInvoice.gross_amount || 0,
          discount_amount: selectedInvoice.discount_amount || 0,
          vat_percentage: selectedInvoice.vat_percentage || 0,
          vat_amount: selectedInvoice.vat_amount || 0,
          gross_amount: selectedInvoice.gross_amount || 0,
          xendit_fee: 0,
          net_amount: selectedInvoice.gross_amount || 0,
          status: "PENDING",
          payment_method_type: "MANUAL_TRANSFER",
          due_date: dueDate.toISOString().slice(0, 10),
          metadata: {
            duplicated_from_invoice_id: selectedInvoice.id,
            duplicated_from_invoice_number: getInvoiceNumber(selectedInvoice),
          },
          notes: [selectedInvoice.notes, `[DUPLICATED_FROM] ${getInvoiceNumber(selectedInvoice)}`]
            .filter((value) => typeof value === "string" && value.trim().length > 0)
            .join("\n"),
        })
        .select(
          "id, invoice_number, issue_date, due_date, gross_amount, status, created_at, package_name, package_duration_months, employee_count, subtotal, discount_amount, vat_amount, vat_percentage, xendit_fee, net_amount, payment_method_type, payment_proof_url, invoice_url, external_id, paid_at, verified_at, rejection_reason, updated_at, metadata, notes",
        )
        .single();

      if (insertError) throw insertError;

      toast.success("Faktur baru berhasil dibuat dari duplikasi.");
      await fetchInvoices({ silent: true });
      if (insertedInvoice) {
        setSelectedInvoice(insertedInvoice as InvoiceRow);
        setIsDetailOpen(true);
      }
    } catch (error) {
      const pgCode =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: string }).code || "")
          : "";
      if (pgCode === "23505") {
        toast.warning("Masih ada faktur aktif. Selesaikan atau batalkan faktur aktif sebelum membuat faktur baru.");
        return;
      }
      const errorRef = reportError(error, "org.billing.duplicate_invoice", {
        invoice_id: selectedInvoice.id,
      });
      toast.error(appendErrorReference("Gagal menduplikasi faktur", errorRef));
    } finally {
      setIsDuplicatingInvoice(false);
    }
  };

  const toggleSort = (field: BillingSortField) => {
    if (sortField === field) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  };

  const openInvoiceDetail = (invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
    setManualPaidAmountInput(formatRupiahInput(String(Math.max(0, Math.round(invoice.gross_amount || 0)))));
    setCancelReasonCode("");
    setCancelReasonDetail("");
    setManualProofFile(null);
    setIsActualTransferDeclared(false);
    if (proofFileInputRef.current) {
      proofFileInputRef.current.value = "";
    }
    setIsDetailOpen(true);
  };

  const getInvoiceNumber = (invoice: InvoiceRow) => {
    if (invoice.invoice_number && invoice.invoice_number.trim()) {
      return invoice.invoice_number;
    }

    const createdAt = new Date(invoice.created_at);
    const yearMonth = Number.isNaN(createdAt.getTime())
      ? format(new Date(), "yyyyMM")
      : format(createdAt, "yyyyMM");
    return `INV-${yearMonth}-${invoice.id.slice(0, 4).toUpperCase()}`;
  };

  const downloadInvoicePdf = (invoice: InvoiceRow) => {
    try {
      const invoiceNo = getInvoiceNumber(invoice);
      const statusMeta = getInvoiceStatusMeta(invoice.status);
      const issueDate = formatInvoiceDate(invoice.issue_date || invoice.created_at);
      const dueDate = formatInvoiceDate(invoice.due_date);
      const subtotal = formatCurrency(invoice.gross_amount || 0);
      const discount = formatCurrency(0);
      const vatAmount = formatCurrency(0);
      const serviceFee = formatCurrency(0);
      const total = formatCurrency(invoice.gross_amount || 0);
      const net = formatCurrency(invoice.gross_amount || 0);
      const paidAmount = detailTransactions.reduce((sum, tx) => sum + (tx.gross_amount || 0), 0);
      const balance = isInvoicePaid(invoice.status)
        ? 0
        : Math.max(0, (invoice.gross_amount || 0) - paidAmount);
      const balanceFormatted = formatCurrency(balance);

      const transactionRows = detailTransactions.length
        ? detailTransactions
            .map((tx) => {
              const txDate = tx.transaction_date ? formatInvoiceDate(tx.transaction_date) : "-";
              const gateway = getGatewayLabel(tx.payment_source);
              const txId = `TX-${tx.id.slice(0, 8).toUpperCase()}`;
              const txAmount = formatCurrency(tx.gross_amount || 0);
              return `<tr>
                <td>${escapeHtml(txDate)}</td>
                <td>${escapeHtml(gateway)}</td>
                <td>${escapeHtml(txId)}</td>
                <td style="text-align:right">${escapeHtml(txAmount)}</td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="4" style="text-align:center;color:#6b7280">No Related Transactions Found</td></tr>`;

      const printableHtml = renderBillingInvoiceTemplate(sanitizeClientInvoiceTemplate(invoiceTemplateHtml), {
        invoice_number: escapeHtml(invoiceNo),
        invoice_status: escapeHtml(statusMeta.label),
        invoice_status_class: isInvoicePaid(invoice.status) ? "status-paid" : "status-unpaid",
        issue_date: escapeHtml(issueDate),
        due_date: escapeHtml(dueDate),
        tenant_name: escapeHtml(tenantProfile?.name || "-"),
        tenant_code: escapeHtml(tenantProfile?.code || "-"),
        tenant_address: escapeHtml(tenantProfile?.address || "-"),
        bank_account_name: escapeHtml(bankInfo.accountName),
        bank_name: escapeHtml(bankInfo.bankName),
        bank_account_number: escapeHtml(bankInfo.accountNumber),
        payment_method: escapeHtml(getPaymentMethodLabel(invoice.payment_method_type)),
        invoice_item_name: escapeHtml(invoice.package_name || "Langganan Sistem Absensi"),
        invoice_item_meta: escapeHtml(
          `${invoice.employee_count || 0} pegawai${invoice.package_duration_months ? ` • ${invoice.package_duration_months} bulan` : ""}`,
        ),
        subtotal: escapeHtml(subtotal),
        discount: escapeHtml(discount),
        vat_percentage: escapeHtml("0"),
        vat_amount: escapeHtml(vatAmount),
        service_fee: escapeHtml(serviceFee),
        total: escapeHtml(total),
        net: escapeHtml(net),
        transaction_rows: transactionRows,
        balance: escapeHtml(balanceFormatted),
        notes: invoice.notes ? `<div class="actions-note">${escapeHtml(invoice.notes)}</div>` : "",
      });

      const popup = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
      if (!popup) {
        toast.error("Popup diblokir browser. Izinkan popup untuk Download PDF.");
        return;
      }

      popup.document.open();
      popup.document.write(printableHtml);
      popup.document.close();
      popup.focus();
      window.setTimeout(() => {
        popup.print();
      }, 400);

      toast.success("Dokumen siap diunduh sebagai PDF");
    } catch (error) {
      const errorRef = reportError(error, "org.billing.download_invoice_pdf", {
        invoice_id: invoice.id,
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menyiapkan dokumen PDF", errorRef));
    }
  };

  useEffect(() => {
    if (!isDetailOpen || !selectedInvoice) {
      setDetailTransactions([]);
      setDetailTransactionError(null);
      setDetailManualPayments([]);
      setDetailManualPaymentError(null);
      return;
    }

    let isMounted = true;

    const fetchInvoiceTransactions = async () => {
      setIsTransactionLoading(true);
      setDetailTransactionError(null);
      setIsManualPaymentLoading(true);
      setDetailManualPaymentError(null);

      try {
        const invoiceNumber = selectedInvoice.invoice_number || "";
        const invoiceTenantId = selectedInvoice.tenant_id || tenantId || null;
        const [ledgerRes, manualRes] = await Promise.all([
          supabase
            .from("financial_ledger")
            .select("id, transaction_date, payment_source, gross_amount")
            .eq("invoice_id", selectedInvoice.id)
            .order("transaction_date", { ascending: false })
            .limit(20),
          invoiceNumber && invoiceTenantId
            ? supabase
                .from("manual_payments")
                .select("id, amount, confirmed_amount, verified_amount, verification_method, status, payment_date, reference_number, transfer_proof_url, created_at, verified_at, rejection_reason")
                .eq("tenant_id", invoiceTenantId)
                .eq("invoice_number", invoiceNumber)
                .order("created_at", { ascending: false })
                .limit(50)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (ledgerRes.error) throw ledgerRes.error;
        if (manualRes.error) throw manualRes.error;

        if (isMounted) {
          setDetailTransactions((ledgerRes.data as FinancialLedgerRow[]) || []);
          setDetailManualPayments((manualRes.data as ManualPaymentHistoryRow[]) || []);
        }
      } catch (error) {
        const errorRef = reportError(error, "org.billing.fetch_invoice_detail_history", {
          invoice_id: selectedInvoice.id,
          tenant_id: selectedInvoice.tenant_id || tenantId || null,
        });
        if (isMounted) {
          setDetailTransactions([]);
          setDetailManualPayments([]);
          setDetailTransactionError(
            appendErrorReference("Gagal memuat transaksi faktur", errorRef),
          );
          setDetailManualPaymentError(
            appendErrorReference("Gagal memuat riwayat cicilan", errorRef),
          );
        }
      } finally {
        if (isMounted) {
          setIsTransactionLoading(false);
          setIsManualPaymentLoading(false);
        }
      }
    };

    void fetchInvoiceTransactions();

    return () => {
      isMounted = false;
    };
  }, [isDetailOpen, selectedInvoice, tenantId]);

  const verifiedManualPaidTotal = useMemo(
    () =>
      detailManualPayments
        .filter((entry) => entry.status === "verified")
        .reduce((sum, entry) => sum + Number(entry.verified_amount ?? entry.amount ?? 0), 0),
    [detailManualPayments],
  );
  const ledgerPaidTotal = useMemo(
    () => detailTransactions.reduce((sum, tx) => sum + Number(tx.gross_amount || 0), 0),
    [detailTransactions],
  );
  const effectivePaidTotal = Math.max(verifiedManualPaidTotal, ledgerPaidTotal);
  const latestRejectedManualAmount = useMemo(() => {
    const latestRejected = detailManualPayments.find((entry) => (entry.status || "").toLowerCase() === "rejected");
    if (!latestRejected) return 0;
    return Number(latestRejected.confirmed_amount ?? latestRejected.amount ?? 0);
  }, [detailManualPayments]);
  const selectedInvoiceRemaining = selectedInvoice
    ? isInvoicePaid(selectedInvoice.status)
      ? 0
      : Math.max(0, Number(selectedInvoice.gross_amount || 0) - effectivePaidTotal)
    : 0;
  const manualPaidAmountValue = useMemo(
    () => parseIntegerAmountInput(manualPaidAmountInput),
    [manualPaidAmountInput],
  );
  const manualPaidAmountInlineError = useMemo(() => {
    if (!manualPaidAmountInput.trim()) return null;
    if (!Number.isFinite(manualPaidAmountValue) || manualPaidAmountValue <= 0) {
      return "Nominal transfer harus lebih dari Rp 0.";
    }
    if (isAmountOverRemaining(manualPaidAmountValue, selectedInvoiceRemaining)) {
      return `Nominal melebihi sisa tagihan (${formatCurrency(selectedInvoiceRemaining)}).`;
    }
    return null;
  }, [manualPaidAmountInput, manualPaidAmountValue, selectedInvoiceRemaining]);

  const handleManualPaidAmountChange = (value: string) => {
    if (isActualTransferDeclared) {
      setIsActualTransferDeclared(false);
    }
    setManualPaidAmountInput(formatRupiahInput(value));
  };

  useEffect(() => {
    if (!selectedInvoice) return;
    if (!isInvoicePayable(selectedInvoice.status)) return;
    if (selectedInvoiceRemaining <= 0) return;

    const currentAmount = parseIntegerAmountInput(manualPaidAmountInput);
    const normalizedRemaining = Math.max(0, Math.round(selectedInvoiceRemaining));
    if (!normalizedRemaining) return;
    if (currentAmount === normalizedRemaining) return;

    if (currentAmount <= 0 || currentAmount > normalizedRemaining) {
      setManualPaidAmountInput(formatRupiahInput(String(normalizedRemaining)));
    }
  }, [manualPaidAmountInput, selectedInvoice, selectedInvoiceRemaining]);

  useEffect(() => {
    if (!manualProofFile) {
      setManualProofPreviewUrl(null);
      setIsProofPreviewOpen(false);
      return;
    }

    const previewable = manualProofFile.type.startsWith("image/") || manualProofFile.type === "application/pdf";
    if (!previewable) {
      setManualProofPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(manualProofFile);
    setManualProofPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [manualProofFile]);

  const handleChooseProofFileClick = () => {
    setIsProofUploadConfirmOpen(true);
  };

  const handleConfirmChooseProofFile = () => {
    setIsProofUploadConfirmOpen(false);
    proofFileInputRef.current?.click();
  };

  const handleBackToNominal = () => {
    setIsProofUploadConfirmOpen(false);
    const nominalInput = document.getElementById("payment-amount");
    nominalInput?.focus();
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="h-6 w-6" />
              Faktur Saya
            </h1>
            <p className="text-muted-foreground">Riwayat faktur dengan kami</p>
            <p className="text-xs text-muted-foreground mt-1">Home Area Pelanggan / Area Pelanggan / Faktur Saya</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void fetchInvoices()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <GlossaryPanel defaultCategory="billing" />
          </div>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[280px,minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {dueInvoicesCount} Invoices Due
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground space-y-2">
                <p>
                  {dueInvoicesCount > 0
                    ? `Anda memiliki ${dueInvoicesCount} tagihan yang belum dibayar.`
                    : "Anda tidak memiliki tagihan yang belum dibayar pada saat ini."}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary">Verifikasi: {statusCounts.pendingVerification}</Badge>
                  <Badge className="border-red-200 bg-red-50 text-red-700">Overdue: {statusCounts.overdue}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Status Langganan
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Badge className={subscriptionStatusMeta.badgeClassName}>{subscriptionStatusMeta.label}</Badge>
                <p className="text-sm text-muted-foreground">{subscriptionStatusMeta.description}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-0">
                <div className="divide-y">
                  {statusFilterItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setStatusFilter(item.key)}
                      className={cn(
                        "w-full px-4 py-3 text-sm flex items-center justify-between transition-colors",
                        statusFilter === item.key ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-4 w-4 rounded-full border",
                            statusFilter === item.key ? "border-primary bg-primary/20" : "border-muted-foreground/40",
                          )}
                        />
                        {item.label}
                      </span>
                      <Badge variant={statusFilter === item.key ? "default" : "secondary"}>{item.count}</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Landmark className="h-4 w-4" />
                  Billing
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-0">
                <div className="divide-y">
                  {billingMenus.map((menu) => (
                    <button
                      key={menu.key}
                      type="button"
                      onClick={() => handleBillingMenuClick(menu.key)}
                      className={cn(
                        "w-full px-4 py-3 text-left text-sm transition-colors",
                        activeBillingMenu === menu.key
                          ? "bg-slate-700 text-white"
                          : "hover:bg-muted/50 text-foreground",
                      )}
                    >
                      {menu.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>

          <section>
            {activeBillingMenu === "offers" ? (
              tenantId && tenantProfile ? (
                <OrgActivationTab tenantId={tenantId} tenantName={tenantProfile.name || "Organisasi"} />
              ) : (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">
                    Data tenant belum tersedia. Klik refresh untuk memuat ulang.
                  </CardContent>
                </Card>
              )
            ) : activeBillingMenu === "topup" ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    Saldo Wallet Billing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="font-semibold">Ajukan Topup Saldo</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="wallet-topup-amount">Nominal Topup</Label>
                        <Input
                          id="wallet-topup-amount"
                          inputMode="numeric"
                          placeholder="Contoh: 500000"
                          value={topupAmountInput}
                          onChange={(event) => setTopupAmountInput(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="wallet-topup-reference">Referensi (opsional)</Label>
                        <Input
                          id="wallet-topup-reference"
                          placeholder="No transfer / catatan singkat"
                          value={topupReferenceInput}
                          onChange={(event) => setTopupReferenceInput(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="wallet-topup-notes">Catatan (opsional)</Label>
                        <Textarea
                          id="wallet-topup-notes"
                          placeholder="Tujuan topup saldo"
                          value={topupNotesInput}
                          onChange={(event) => setTopupNotesInput(event.target.value)}
                          rows={2}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={() => void submitWalletTopupRequest()} disabled={isSubmittingTopup}>
                        {isSubmittingTopup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Kirim Request Topup
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <p className="text-xs text-muted-foreground">Saldo Saat Ini</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700">
                        {formatCurrency(walletSnapshot?.balance || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <p className="text-xs text-muted-foreground">Skema Kredit</p>
                      <p className="mt-1 font-semibold">Kembalian angka unik invoice</p>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <p className="text-xs text-muted-foreground">Pemakaian</p>
                      <p className="mt-1 font-semibold">Auto-potong invoice berikutnya</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
                    Saldo wallet dipakai otomatis saat membuat invoice baru jika saldo cukup. Angka unik pembayaran
                    yang sudah tervalidasi akan dikreditkan kembali ke saldo ini.
                  </div>

                  <div className="rounded-lg border">
                    <div className="border-b px-4 py-3 font-semibold">Riwayat Request Topup</div>
                    {isWalletTopupLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Memuat request topup...
                      </div>
                    ) : walletTopupRequests.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">Belum ada request topup.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium">Tanggal</th>
                              <th className="px-4 py-2 text-right font-medium">Nominal</th>
                              <th className="px-4 py-2 text-right font-medium">Disetujui</th>
                              <th className="px-4 py-2 text-left font-medium">Status</th>
                              <th className="px-4 py-2 text-left font-medium">Catatan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {walletTopupRequests.map((row) => {
                              const statusMeta = getTopupStatusMeta(row.status);
                              return (
                                <tr key={row.id} className="border-t">
                                  <td className="px-4 py-2">{formatInvoiceDate(row.created_at)}</td>
                                  <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.requested_amount || 0)}</td>
                                  <td className="px-4 py-2 text-right">
                                    {row.approved_amount === null ? "-" : formatCurrency(row.approved_amount)}
                                  </td>
                                  <td className="px-4 py-2">
                                    <Badge variant="outline" className={statusMeta.className}>
                                      {statusMeta.label}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2 text-xs text-muted-foreground">
                                    {row.rejection_reason || row.notes || row.reference_number || "-"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border">
                    <div className="border-b px-4 py-3 font-semibold">Riwayat Transaksi Wallet</div>
                    {isWalletLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Memuat riwayat saldo...
                      </div>
                    ) : !walletSnapshot?.transactions?.length ? (
                      <div className="py-8 text-center text-muted-foreground">Belum ada transaksi saldo wallet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium">Tanggal</th>
                              <th className="px-4 py-2 text-left font-medium">Jenis</th>
                              <th className="px-4 py-2 text-right font-medium">Nominal</th>
                              <th className="px-4 py-2 text-right font-medium">Saldo Akhir</th>
                              <th className="px-4 py-2 text-left font-medium">Ref</th>
                            </tr>
                          </thead>
                          <tbody>
                            {walletSnapshot.transactions.map((row) => (
                              <tr key={row.id} className="border-t">
                                <td className="px-4 py-2">{formatInvoiceDate(row.created_at)}</td>
                                <td className="px-4 py-2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      row.direction === "CREDIT"
                                        ? "border-green-300 bg-green-50 text-green-700"
                                        : "border-red-300 bg-red-50 text-red-700",
                                    )}
                                  >
                                    {getWalletTransactionTypeLabel(row.transaction_type)}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2 text-right font-semibold">
                                  {row.direction === "CREDIT" ? "+" : "-"} {formatCurrency(row.amount || 0)}
                                </td>
                                <td className="px-4 py-2 text-right">{formatCurrency(row.balance_after || 0)}</td>
                                <td className="px-4 py-2">{row.reference || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        void (tenantId
                          ? Promise.all([fetchWalletSnapshot(tenantId), fetchWalletTopupRequests(tenantId)])
                          : Promise.resolve())
                      }
                    >
                      Muat Ulang Saldo
                    </Button>
                    <Button variant="outline" onClick={() => setActiveBillingMenu("offers")}>
                      Buka Penawaran
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/org/activation")}>
                      Buka Aktivasi
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="border-b px-5 py-4 text-white" style={{ backgroundColor: "#555968" }}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm md:text-base text-white">
                        Tampilan {totalEntries === 0 ? 0 : startIndex + 1} ke {endIndex} dari {totalEntries} entri
                        {hasActiveFilter && (
                          <span className="text-slate-200"> (filtered from {invoices.length} total entri)</span>
                        )}
                      </p>
                      <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        <Input
                          placeholder="Cari faktur..."
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          className="h-10 rounded-sm border-slate-300 bg-slate-100 text-slate-900 placeholder:text-slate-400 pl-10"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-b bg-slate-50 px-5 py-3">
                    <div className="grid gap-3 md:grid-cols-[1fr,1fr,auto,auto] md:items-end">
                      <div className="space-y-1">
                        <Label htmlFor="issue-from" className="text-xs text-muted-foreground">
                          Dari Tanggal Faktur
                        </Label>
                        <div className="relative">
                          <CalendarRange className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="issue-from"
                            type="date"
                            value={issueDateFrom}
                            onChange={(event) => setIssueDateFrom(event.target.value)}
                            className="h-9 pl-8"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="issue-to" className="text-xs text-muted-foreground">
                          Sampai Tanggal Faktur
                        </Label>
                        <div className="relative">
                          <CalendarRange className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="issue-to"
                            type="date"
                            value={issueDateTo}
                            onChange={(event) => setIssueDateTo(event.target.value)}
                            className="h-9 pl-8"
                          />
                        </div>
                      </div>
                      <Button variant="outline" onClick={resetInvoiceFilters}>
                        Reset Filter
                      </Button>
                      <Button variant="outline" onClick={exportInvoicesCsv}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Export CSV
                      </Button>
                    </div>
                  </div>

                  <div className="relative w-full overflow-x-auto">
                    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="border-0 bg-transparent">
                          <th className="h-11 border-r border-slate-300 border-b-4 border-[#8cc46b] bg-[#f2f2f2] px-4 text-left text-base font-medium align-middle">
                            <button
                              type="button"
                              className="inline-flex w-full items-center justify-between gap-2 text-slate-800"
                              onClick={() => toggleSort("invoice_number")}
                            >
                              Faktur #
                              <ArrowUpDown
                                className={cn(
                                  "h-4 w-4 text-slate-400",
                                  sortField === "invoice_number" && "text-slate-700",
                                )}
                              />
                            </button>
                          </th>
                          <th className="h-11 border-r border-slate-300 border-b-4 border-[#8cc46b] bg-[#f2f2f2] px-4 text-left text-base font-medium align-middle">
                            <button
                              type="button"
                              className="inline-flex w-full items-center justify-between gap-2 text-slate-800"
                              onClick={() => toggleSort("issue_date")}
                            >
                              Tanggal Faktur
                              <ArrowUpDown
                                className={cn("h-4 w-4 text-slate-400", sortField === "issue_date" && "text-slate-700")}
                              />
                            </button>
                          </th>
                          <th className="h-11 border-r border-slate-300 border-b-4 border-[#8cc46b] bg-[#f2f2f2] px-4 text-left text-base font-medium align-middle">
                            <button
                              type="button"
                              className="inline-flex w-full items-center justify-between gap-2 text-slate-800"
                              onClick={() => toggleSort("due_date")}
                            >
                              Due Date
                              <ArrowUpDown
                                className={cn("h-4 w-4 text-slate-400", sortField === "due_date" && "text-slate-700")}
                              />
                            </button>
                          </th>
                          <th className="h-11 border-r border-slate-300 border-b-4 border-[#8cc46b] bg-[#f2f2f2] px-4 text-left text-base font-medium align-middle">
                            <button
                              type="button"
                              className="inline-flex w-full items-center justify-between gap-2 text-slate-800"
                              onClick={() => toggleSort("gross_amount")}
                            >
                              Total
                              <ArrowUpDown
                                className={cn(
                                  "h-4 w-4 text-slate-400",
                                  sortField === "gross_amount" && "text-slate-700",
                                )}
                              />
                            </button>
                          </th>
                          <th className="h-11 border-b-4 border-[#8cc46b] bg-[#f2f2f2] px-4 text-left text-base font-medium align-middle">
                            <button
                              type="button"
                              className="inline-flex w-full items-center justify-between gap-2 text-slate-800"
                              onClick={() => toggleSort("status")}
                            >
                              Status
                              <ArrowUpDown
                                className={cn("h-4 w-4 text-slate-400", sortField === "status" && "text-slate-700")}
                              />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoading && (
                          <tr className="border-b border-slate-200/90">
                            <td colSpan={5} className="p-4 py-10">
                              <div className="flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            </td>
                          </tr>
                        )}
                        {!isLoading && paginatedInvoices.length === 0 && (
                          <tr className="border-b border-slate-200/90 bg-white">
                            <td colSpan={5} className="p-4 py-10 text-center text-muted-foreground">
                              Tidak ada data faktur
                            </td>
                          </tr>
                        )}
                        {!isLoading &&
                          paginatedInvoices.map((invoice, index) => {
                            const dueMeta = getDueStatusMeta(invoice);
                            return (
                              <tr
                                key={invoice.id}
                                className={cn(
                                  "border-b border-slate-200/90 hover:bg-slate-50",
                                  index % 2 === 1 ? "bg-[#f7fbfd]" : "bg-white",
                                )}
                              >
                                <td className="px-4 py-3 align-middle font-mono text-sm">
                                  <button
                                    type="button"
                                    onClick={() => openInvoiceDetail(invoice)}
                                    className="text-left text-slate-800 hover:text-primary hover:underline"
                                  >
                                    {getInvoiceNumber(invoice)}
                                  </button>
                                </td>
                                <td className="px-4 py-3 align-middle text-sm">
                                  {formatInvoiceDate(invoice.issue_date || invoice.created_at)}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm">
                                  <p>{formatInvoiceDate(invoice.due_date)}</p>
                                  <p className={cn("mt-1 text-xs", dueMeta.className)}>{dueMeta.label}</p>
                                </td>
                                <td className="px-4 py-3 align-middle text-sm font-semibold">
                                  {formatCurrency(invoice.gross_amount || 0)}
                                </td>
                                <td className="px-4 py-3 align-middle">
                                  {renderStatusBadge(invoice.status, { onClick: () => openInvoiceDetail(invoice) })}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Tampil</span>
                      <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <SelectItem key={size} value={String(size)}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span>entri</span>
                    </div>

                    {totalEntries > 0 && (
                      <Pagination className="justify-end">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                              className={safeCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          {visiblePages.map((page) => (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={safeCurrentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          <PaginationItem>
                            <PaginationNext
                              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                              className={safeCurrentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Detail Faktur</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 p-4 md:p-6">
              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice</p>
                  <h2 className="text-2xl font-bold text-slate-900">#{getInvoiceNumber(selectedInvoice)}</h2>
                </div>
                {renderStatusBadge(selectedInvoice.status)}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Invoiced To</p>
                  <p className="mt-1 text-sm text-slate-900">{tenantProfile?.name || "-"}</p>
                  <p className="text-sm text-muted-foreground">{tenantProfile?.code || "-"}</p>
                  <p className="text-sm text-muted-foreground">{tenantProfile?.address || "-"}</p>
                </div>
                <div className="md:text-right">
                  <p className="text-sm font-semibold text-slate-700">Pay To</p>
                  <p className="mt-1 text-sm text-slate-900">{bankInfo.accountName}</p>
                  <p className="text-sm text-muted-foreground">
                    {bankInfo.bankName} {bankInfo.accountNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">Transfer Bank / Payment Gateway</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Invoice Date</p>
                  <p className="mt-1 text-sm text-slate-900">{formatInvoiceDate(selectedInvoice.issue_date || selectedInvoice.created_at)}</p>
                  <p className="mt-3 text-sm font-semibold text-slate-700">Due Date</p>
                  <p className="mt-1 text-sm text-slate-900">{formatInvoiceDate(selectedInvoice.due_date)}</p>
                  <p className={cn("mt-1 text-xs", getDueStatusMeta(selectedInvoice).className)}>
                    {getDueStatusMeta(selectedInvoice).label}
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="text-sm font-semibold text-slate-700">Payment Method</p>
                  <p className="mt-1 text-sm text-slate-900">{getPaymentMethodLabel(selectedInvoice.payment_method_type)}</p>
                </div>
              </div>

              <div className="grid gap-3 rounded-md border bg-slate-50/70 p-4 text-sm md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">External ID</p>
                  <p className="font-medium text-slate-900">{selectedInvoice.external_id || "-"}</p>
                </div>
                <div className="md:text-right">
                  <p className="text-xs text-muted-foreground">Terakhir Diperbarui</p>
                  <p className="font-medium text-slate-900">{formatInvoiceDate(selectedInvoice.updated_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tanggal Bayar</p>
                  <p className="font-medium text-slate-900">{formatInvoiceDate(selectedInvoice.paid_at)}</p>
                </div>
                <div className="md:text-right">
                  <p className="text-xs text-muted-foreground">Tanggal Verifikasi</p>
                  <p className="font-medium text-slate-900">{formatInvoiceDate(selectedInvoice.verified_at)}</p>
                </div>
              </div>

              {isInvoiceRejectedNeedsRevision(selectedInvoice.status) ? (
                <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold">Ditolak - Wajib Revisi Pembayaran</p>
                    <p>
                      {selectedInvoice.rejection_reason || "Admin menolak konfirmasi sebelumnya. Lakukan revisi dan unggah ulang bukti transfer."}
                    </p>
                    <p className="text-xs">
                      Total tagihan: <span className="font-semibold">{formatCurrency(selectedInvoice.gross_amount || 0)}</span> ·
                      Total terverifikasi: <span className="font-semibold">{formatCurrency(verifiedManualPaidTotal)}</span> ·
                      Nominal ditolak: <span className="font-semibold">{formatCurrency(latestRejectedManualAmount)}</span> ·
                      Sisa wajib bayar: <span className="font-semibold">{formatCurrency(selectedInvoiceRemaining)}</span>
                    </p>
                    <div className="pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const target = document.getElementById("invoice-payment-confirmation-section");
                          target?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        Revisi Pembayaran
                      </Button>
                    </div>
                  </div>
                </div>
              ) : selectedInvoice.rejection_reason ? (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Bukti bayar ditolak</p>
                    <p>{selectedInvoice.rejection_reason}</p>
                  </div>
                </div>
              ) : null}

              {isInvoicePayable(selectedInvoice.status) ? (
                <div
                  id="invoice-payment-confirmation-section"
                  className={cn("rounded-md border", paymentSectionFlash && "ring-2 ring-primary/50 animate-pulse")}
                >
                  <div className="border-b px-4 py-3 font-semibold">Aksi Pembayaran</div>
                  <div className="space-y-3 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => openInvoiceCheckout(selectedInvoice)}
                        disabled={!selectedInvoice.invoice_url}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Bayar via Link
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Gunakan tombol ini jika metode pembayaran online tersedia.
                      </span>
                    </div>

                    {selectedInvoice.payment_proof_url ? (
                      <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                        Bukti saat ini:{" "}
                        <a
                          href={selectedInvoice.payment_proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Lihat Bukti
                        </a>
                      </div>
                    ) : null}

                    <div className="space-y-1">
                      <Label htmlFor="payment-amount">Nominal Transfer Aktual</Label>
                      <Input
                        id="payment-amount"
                        inputMode="numeric"
                        placeholder="Contoh: Rp 445.940"
                        value={manualPaidAmountInput}
                        onChange={(event) => handleManualPaidAmountChange(event.target.value)}
                      />
                      {manualPaidAmountInlineError ? (
                        <p className="text-xs text-destructive">{manualPaidAmountInlineError}</p>
                      ) : (
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">
                            Sisa tagihan saat ini: <span className="font-medium">{formatCurrency(selectedInvoiceRemaining)}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Nominal otomatis diarahkan ke sisa tagihan untuk pembayaran susulan.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="payment-proof-file">Upload Bukti Pembayaran</Label>
                        <input
                          id="payment-proof-file"
                          ref={proofFileInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(event) => {
                            const nextFile = event.target.files?.[0] || null;
                            setManualProofFile(nextFile);
                            setIsProofPreviewOpen(false);
                            setIsActualTransferDeclared(false);
                          }}
                        />
                      <div className="rounded-md border border-dashed p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleChooseProofFileClick}
                          >
                            <FileUp className="mr-1 h-3.5 w-3.5" />
                            {manualProofFile ? "Ganti File Bukti" : "Pilih File Bukti"}
                          </Button>
                          {manualProofFile ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setManualProofFile(null);
                                setIsProofPreviewOpen(false);
                                if (proofFileInputRef.current) proofFileInputRef.current.value = "";
                              }}
                            >
                              Hapus File
                            </Button>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Format JPG/PNG/PDF, rekomendasi maksimal 5MB.
                        </p>
                        {manualProofFile ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs font-medium text-slate-700">
                              File dipilih: {manualProofFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Tipe: {manualProofFile.type || "Tidak diketahui"} · Ukuran: {formatFileSize(manualProofFile.size)}
                            </p>
                            {manualProofFile.type.startsWith("image/") && manualProofPreviewUrl ? (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-700">Pratinjau bukti transfer</p>
                                <button
                                  type="button"
                                  className="block w-fit"
                                  onClick={() => setIsProofPreviewOpen(true)}
                                >
                                  <img
                                    src={manualProofPreviewUrl}
                                    alt="Pratinjau bukti pembayaran"
                                    className="max-h-56 w-auto rounded-md border object-contain hover:opacity-90"
                                  />
                                </button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => setIsProofPreviewOpen(true)}
                                >
                                  Perbesar Pratinjau
                                </Button>
                              </div>
                            ) : null}
                            {manualProofFile.type === "application/pdf" && manualProofPreviewUrl ? (
                              <div className="rounded-md border bg-slate-50 p-2 text-xs text-slate-700">
                                Bukti pembayaran PDF siap diunggah.
                                <Button
                                  type="button"
                                  variant="link"
                                  className="h-auto px-1 py-0 text-xs"
                                  onClick={() => window.open(manualProofPreviewUrl, "_blank", "noopener,noreferrer")}
                                >
                                  Lihat file PDF
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {manualProofFile ? (
                      <div className="rounded-md border bg-muted/20 px-3 py-2">
                        <label htmlFor="declare-actual-transfer" className="flex cursor-pointer items-start gap-2">
                          <Checkbox
                            id="declare-actual-transfer"
                            checked={isActualTransferDeclared}
                            onCheckedChange={(checked) => setIsActualTransferDeclared(Boolean(checked))}
                          />
                          <span className="text-xs text-muted-foreground">
                            Saya menyatakan nominal di atas adalah nominal transfer aktual sesuai bukti pembayaran.
                          </span>
                        </label>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Pilih file bukti pembayaran terlebih dahulu, lalu centang deklarasi sebelum kirim konfirmasi.
                      </p>
                    )}
                    <Button
                      className="w-full md:w-auto"
                      onClick={() => void submitPaymentProof()}
                      disabled={isSubmittingPaymentProof || Boolean(manualPaidAmountInlineError) || !isActualTransferDeclared}
                    >
                      {isSubmittingPaymentProof ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Kirim Konfirmasi Pembayaran
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border">
                <div className="border-b px-4 py-3 font-semibold">Aksi Faktur</div>
                <div className="space-y-3 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Demi integritas audit, faktur terbit tidak bisa diedit. Gunakan pembatalan atau duplikasi sebagai faktur baru.
                  </p>
                  {isInvoiceCancellableByOrg(selectedInvoice.status) ? (
                    <div className="grid gap-2 md:grid-cols-[1fr,auto] md:items-end">
                      <div className="space-y-1">
                        <Label htmlFor="cancel-reason">Alasan Pembatalan</Label>
                        <Select
                          value={cancelReasonCode}
                          onValueChange={(value) => {
                            setCancelReasonCode(value);
                            if (value !== "other") setCancelReasonDetail("");
                          }}
                        >
                          <SelectTrigger id="cancel-reason">
                            <SelectValue placeholder="Pilih alasan pembatalan" />
                          </SelectTrigger>
                          <SelectContent>
                            {CANCEL_REASON_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {cancelReasonCode === "other" ? (
                          <Textarea
                            placeholder="Tulis detail alasan pembatalan"
                            value={cancelReasonDetail}
                            onChange={(event) => setCancelReasonDetail(event.target.value)}
                            rows={2}
                          />
                        ) : null}
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => void cancelPendingInvoice()}
                        disabled={isCancellingInvoice || isRevisingInvoice}
                      >
                        {isCancellingInvoice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Batalkan Faktur
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Faktur hanya bisa dibatalkan saat status <strong>Menunggu Pembayaran</strong>.
                    </p>
                  )}
                  {isInvoiceCancellableByOrg(selectedInvoice.status) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void reviseInvoiceViaActivation()}
                        disabled={isRevisingInvoice || isCancellingInvoice}
                      >
                        {isRevisingInvoice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Ubah Detail & Buat Revisi
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Sistem akan membatalkan faktur ini dulu, lalu membuka kalkulator aktivasi dengan data prefill.
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Revisi detail via aktivasi hanya tersedia untuk faktur berstatus <strong>Menunggu Pembayaran</strong>.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void duplicateInvoiceAsNew()}
                      disabled={isDuplicatingInvoice || isInvoicePayable(selectedInvoice.status)}
                    >
                      {isDuplicatingInvoice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Duplikasi jadi Faktur Baru
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Faktur baru dibuat sebagai <strong>Transfer Manual</strong> dengan nomor baru.
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border">
                <div className="border-b px-4 py-3 font-semibold">Invoice Items</div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-[1fr,180px] gap-3 border-b pb-2 text-sm font-semibold">
                    <span>Description</span>
                    <span className="text-right">Amount</span>
                  </div>
                  <div className="grid grid-cols-[1fr,180px] gap-3 border-b py-3 text-sm">
                    <div>
                      <p>{selectedInvoice.package_name || "Langganan Sistem Absensi"}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedInvoice.employee_count || 0} pegawai
                        {selectedInvoice.package_duration_months
                          ? ` • ${selectedInvoice.package_duration_months} bulan`
                          : ""}
                      </p>
                    </div>
                    <span className="text-right">{formatCurrency(selectedInvoice.gross_amount || 0)}</span>
                  </div>
                  <div className="space-y-1 py-3 text-sm">
                    <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
                      <span>Total Tagihan</span>
                      <span>{formatCurrency(selectedInvoice.gross_amount || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedInvoice.notes ? (
                <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  {selectedInvoice.notes}
                </div>
              ) : null}

              <div className="rounded-md border">
                <div className="border-b px-4 py-3">
                  <p className="font-semibold">Riwayat Cicilan Pembayaran</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kebijakan cicilan digunakan ketika pembayaran belum penuh (misalnya kurang transfer atau transfer bertahap).
                    Invoice dinyatakan lunas setelah total pembayaran terverifikasi sama dengan total tagihan.
                  </p>
                </div>
                <div className="grid gap-2 border-b bg-muted/20 px-4 py-3 text-sm md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tagihan</p>
                    <p className="font-semibold">{formatCurrency(selectedInvoice.gross_amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Terverifikasi</p>
                    <p className="font-semibold">{formatCurrency(verifiedManualPaidTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sisa Tagihan</p>
                    <p className="font-semibold">{formatCurrency(selectedInvoiceRemaining)}</p>
                  </div>
                </div>
                {detailManualPaymentError ? (
                  <div className="px-4 py-3 text-sm text-destructive">{detailManualPaymentError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b bg-[#f8f8f8]">
                          <th className="px-4 py-2 text-left font-semibold">Tanggal</th>
                          <th className="px-4 py-2 text-left font-semibold">Referensi</th>
                          <th className="px-4 py-2 text-right font-semibold">Nominal</th>
                          <th className="px-4 py-2 text-left font-semibold">Status</th>
                          <th className="px-4 py-2 text-left font-semibold">Bukti</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isManualPaymentLoading && (
                          <tr className="border-b">
                            <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                              Memuat riwayat cicilan...
                            </td>
                          </tr>
                        )}
                        {!isManualPaymentLoading && detailManualPayments.length === 0 && (
                          <tr className="border-b">
                            <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                              Belum ada data cicilan pembayaran
                            </td>
                          </tr>
                        )}
                        {!isManualPaymentLoading &&
                          detailManualPayments.map((entry) => {
                            const statusMeta = getManualPaymentStatusMeta(entry.status);
                            return (
                              <tr key={entry.id} className="border-b">
                                <td className="px-4 py-3">{formatInvoiceDate(entry.payment_date || entry.created_at)}</td>
                                <td className="px-4 py-3 font-mono text-xs">{entry.reference_number || "-"}</td>
                                <td className="px-4 py-3 text-right">
                                  {entry.status === "verified"
                                    ? formatCurrency(entry.verified_amount ?? entry.amount ?? 0)
                                    : formatCurrency(entry.confirmed_amount ?? entry.amount ?? 0)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={cn("inline-flex rounded-sm border px-2 py-1 text-xs font-semibold", statusMeta.className)}>
                                    {statusMeta.label}
                                  </span>
                                  {entry.verification_method ? (
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      Metode verifikasi: {entry.verification_method}
                                    </p>
                                  ) : null}
                                  {entry.rejection_reason ? (
                                    <p className="mt-1 text-xs text-red-700">{entry.rejection_reason}</p>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3">
                                  {entry.transfer_proof_url ? (
                                    <a
                                      href={entry.transfer_proof_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      Lihat Bukti
                                    </a>
                                  ) : (
                                    "-"
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-md border">
                <div className="border-b px-4 py-3 font-semibold">Riwayat Transaksi</div>
                {detailTransactionError ? (
                  <div className="px-4 py-3 text-sm text-destructive">{detailTransactionError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead>
                        <tr className="border-b bg-[#f8f8f8]">
                          <th className="px-4 py-2 text-left font-semibold">Transaction Date</th>
                          <th className="px-4 py-2 text-left font-semibold">Gateway</th>
                          <th className="px-4 py-2 text-left font-semibold">Transaction ID</th>
                          <th className="px-4 py-2 text-right font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isTransactionLoading && (
                          <tr className="border-b">
                            <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                              Memuat transaksi...
                            </td>
                          </tr>
                        )}
                        {!isTransactionLoading && detailTransactions.length === 0 && (
                          <tr className="border-b">
                            <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                              No Related Transactions Found
                            </td>
                          </tr>
                        )}
                        {!isTransactionLoading &&
                          detailTransactions.map((tx) => (
                            <tr key={tx.id} className="border-b">
                              <td className="px-4 py-3">{tx.transaction_date ? formatInvoiceDate(tx.transaction_date) : "-"}</td>
                              <td className="px-4 py-3">{getGatewayLabel(tx.payment_source)}</td>
                              <td className="px-4 py-3 font-mono text-xs">TX-{tx.id.slice(0, 8).toUpperCase()}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(tx.gross_amount || 0)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-end gap-6 border-t px-4 py-3 text-sm font-semibold">
                  <span>Balance</span>
                  <span>
                    {formatCurrency(selectedInvoiceRemaining)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {selectedInvoice.invoice_url && isInvoicePayable(selectedInvoice.status) ? (
                  <Button variant="outline" onClick={() => openInvoiceCheckout(selectedInvoice)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Buka Link Pembayaran
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => downloadInvoicePdf(selectedInvoice)}
                >
                  Download PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(getInvoiceNumber(selectedInvoice));
                      toast.success("Nomor faktur disalin");
                    } catch {
                      toast.error("Gagal menyalin nomor faktur");
                    }
                  }}
                >
                  Salin Nomor Faktur
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={isProofUploadConfirmOpen} onOpenChange={setIsProofUploadConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Nominal Transfer</AlertDialogTitle>
            <AlertDialogDescription>
              Nominal transfer saat ini harus sama dengan nominal pada bukti transfer yang akan Anda upload, dan deklarasi wajib dicentang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Nominal saat ini</p>
            <p className="text-base font-semibold">
              {manualPaidAmountValue > 0 ? formatCurrency(manualPaidAmountValue) : "Rp 0"}
            </p>
            {manualPaidAmountInlineError ? (
              <p className="mt-1 text-xs text-destructive">{manualPaidAmountInlineError}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleBackToNominal}>Kembali Isi Nominal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmChooseProofFile}
              disabled={manualPaidAmountValue <= 0 || Boolean(manualPaidAmountInlineError)}
            >
              Lanjut Pilih File
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isProofPreviewOpen} onOpenChange={setIsProofPreviewOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-base">Pratinjau Bukti Pembayaran</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[82vh] items-center justify-center overflow-auto bg-slate-50 p-3">
            {manualProofPreviewUrl ? (
              <img
                src={manualProofPreviewUrl}
                alt="Pratinjau bukti pembayaran ukuran besar"
                className="max-h-[78vh] w-auto rounded-md border bg-white object-contain shadow-sm"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
