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
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgActivationTab } from "@/components/org/OrgActivationTab";
import { GlossaryPanel } from "@/components/common/GlossaryPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

const formatInvoiceDate = (value: string | null) => {
  if (!value) return "-";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "-";
  return format(parsedDate, "dd-MM-yyyy", { locale: idLocale });
};

const isInvoicePaid = (status: string | null | undefined) => status === "PAID";
const isInvoiceAwaitingVerification = (status: string | null | undefined) => status === "AWAITING_VERIFICATION";
const isInvoicePending = (status: string | null | undefined) => status === "PENDING";
const isInvoiceExpired = (status: string | null | undefined) => status === "EXPIRED";
const isInvoiceCancelled = (status: string | null | undefined) => status === "CANCELLED";
const isInvoicePayable = (status: string | null | undefined) =>
  isInvoicePending(status) || isInvoiceAwaitingVerification(status);

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
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantProfile, setTenantProfile] = useState<TenantBillingProfile | null>(null);
  const [subscriptionSnapshot, setSubscriptionSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [bankInfo, setBankInfo] = useState<BillingBankInfo>(DEFAULT_BANK_INFO);
  const [invoiceTemplateHtml, setInvoiceTemplateHtml] = useState(DEFAULT_BILLING_INVOICE_TEMPLATE);
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
  const [issueDateFrom, setIssueDateFrom] = useState("");
  const [issueDateTo, setIssueDateTo] = useState("");
  const [manualProofUrlInput, setManualProofUrlInput] = useState("");
  const [manualProofFile, setManualProofFile] = useState<File | null>(null);
  const [isSubmittingPaymentProof, setIsSubmittingPaymentProof] = useState(false);
  const proofFileInputRef = useRef<HTMLInputElement | null>(null);

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
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInvoices, tenantId]);

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
      setManualProofUrlInput("");
      setManualProofFile(null);
      if (proofFileInputRef.current) {
        proofFileInputRef.current.value = "";
      }
      return;
    }
    setManualProofUrlInput(selectedInvoice.payment_proof_url || "");
    setManualProofFile(null);
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

    const urlInput = manualProofUrlInput.trim();
    if (!urlInput && !manualProofFile) {
      toast.error("Masukkan URL bukti bayar atau unggah file bukti");
      return;
    }
    if (urlInput && !/^https?:\/\//i.test(urlInput)) {
      toast.error("URL bukti bayar harus diawali http:// atau https://");
      return;
    }

    setIsSubmittingPaymentProof(true);
    try {
      let paymentProofUrl = urlInput;
      if (manualProofFile) {
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
      }

      if (!paymentProofUrl) {
        throw new Error("URL bukti bayar tidak tersedia");
      }

      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          payment_proof_url: paymentProofUrl,
          status: "AWAITING_VERIFICATION",
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedInvoice.id)
        .eq("tenant_id", tenantId);

      if (updateError) throw updateError;

      toast.success("Bukti pembayaran berhasil dikirim. Menunggu verifikasi admin.");
      setManualProofUrlInput(paymentProofUrl);
      setManualProofFile(null);
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
      const subtotal = formatCurrency(invoice.subtotal || invoice.gross_amount || 0);
      const discount = formatCurrency(invoice.discount_amount || 0);
      const vatAmount = formatCurrency(invoice.vat_amount || 0);
      const serviceFee = formatCurrency(invoice.xendit_fee || 0);
      const total = formatCurrency(invoice.gross_amount || 0);
      const net = formatCurrency(invoice.net_amount || invoice.gross_amount || 0);
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

      const printableHtml = renderBillingInvoiceTemplate(invoiceTemplateHtml, {
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
        vat_percentage: escapeHtml(String(invoice.vat_percentage || 0)),
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
    } catch {
      toast.error("Gagal menyiapkan dokumen PDF");
    }
  };

  useEffect(() => {
    if (!isDetailOpen || !selectedInvoice) {
      setDetailTransactions([]);
      setDetailTransactionError(null);
      return;
    }

    let isMounted = true;

    const fetchInvoiceTransactions = async () => {
      setIsTransactionLoading(true);
      setDetailTransactionError(null);

      try {
        const { data, error } = await supabase
          .from("financial_ledger")
          .select("id, transaction_date, payment_source, gross_amount")
          .eq("invoice_id", selectedInvoice.id)
          .order("transaction_date", { ascending: false })
          .limit(20);

        if (error) throw error;

        if (isMounted) {
          setDetailTransactions((data as FinancialLedgerRow[]) || []);
        }
      } catch (error) {
        const errorRef = reportError(error, "org.billing.fetch_invoice_transactions", {
          invoice_id: selectedInvoice.id,
        });
        if (isMounted) {
          setDetailTransactions([]);
          setDetailTransactionError(
            appendErrorReference("Gagal memuat transaksi faktur", errorRef),
          );
        }
      } finally {
        if (isMounted) {
          setIsTransactionLoading(false);
        }
      }
    };

    void fetchInvoiceTransactions();

    return () => {
      isMounted = false;
    };
  }, [isDetailOpen, selectedInvoice]);

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
                    Tambah Saldo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    Topup saldo belum digunakan pada skema billing saat ini. Semua penagihan diproses berbasis faktur
                    dan status langganan.
                  </p>
                  <div className="flex flex-wrap gap-2">
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Detail Faktur</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-6 p-6 md:p-8">
              <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
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

              {selectedInvoice.rejection_reason ? (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Bukti bayar ditolak</p>
                    <p>{selectedInvoice.rejection_reason}</p>
                  </div>
                </div>
              ) : null}

              {isInvoicePayable(selectedInvoice.status) ? (
                <div className="rounded-md border">
                  <div className="border-b px-4 py-3 font-semibold">Aksi Pembayaran</div>
                  <div className="space-y-4 px-4 py-3">
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

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="payment-proof-url">URL Bukti Bayar</Label>
                        <Input
                          id="payment-proof-url"
                          placeholder="https://..."
                          value={manualProofUrlInput}
                          onChange={(event) => setManualProofUrlInput(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="payment-proof-file">Upload Bukti (opsional)</Label>
                        <Input
                          id="payment-proof-file"
                          ref={proofFileInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(event) => {
                            const nextFile = event.target.files?.[0] || null;
                            setManualProofFile(nextFile);
                          }}
                        />
                        {manualProofFile ? (
                          <p className="text-xs text-muted-foreground">
                            <FileUp className="mr-1 inline h-3.5 w-3.5" />
                            {manualProofFile.name}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Button onClick={() => void submitPaymentProof()} disabled={isSubmittingPaymentProof}>
                      {isSubmittingPaymentProof ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Kirim Bukti Pembayaran
                    </Button>
                  </div>
                </div>
              ) : null}

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
                    <span className="text-right">{formatCurrency(selectedInvoice.subtotal || selectedInvoice.gross_amount || 0)}</span>
                  </div>
                  <div className="space-y-1 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sub Total</span>
                      <span>{formatCurrency(selectedInvoice.subtotal || selectedInvoice.gross_amount || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Diskon</span>
                      <span>-{formatCurrency(selectedInvoice.discount_amount || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">PPN ({selectedInvoice.vat_percentage || 0}%)</span>
                      <span>{formatCurrency(selectedInvoice.vat_amount || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Biaya Layanan</span>
                      <span>{formatCurrency(selectedInvoice.xendit_fee || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(selectedInvoice.gross_amount || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>Net</span>
                      <span>{formatCurrency(selectedInvoice.net_amount || selectedInvoice.gross_amount || 0)}</span>
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
                    {formatCurrency(
                      isInvoicePaid(selectedInvoice.status)
                        ? 0
                        : Math.max(
                            0,
                            (selectedInvoice.gross_amount || 0) -
                              detailTransactions.reduce(
                                (sum, tx) => sum + (tx.gross_amount || 0),
                                0,
                              ),
                          ),
                    )}
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
    </OrganizationLayout>
  );
}
