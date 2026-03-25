import { useCallback, useEffect, useMemo, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Invoice, useFinancialLedger, useInvoices, useManualVerificationInvoices } from "@/hooks/useBilling";
import { 
  DollarSign, 
  Receipt, 
  TrendingUp, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  FolderClock,
  Trash2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { id } from "date-fns/locale";
import { BillingSettings } from "@/components/admin/billing/BillingSettings";
import { SubscriptionPackagesManager } from "@/components/admin/billing/SubscriptionPackagesManager";
import { InvoicesManager } from "@/components/admin/billing/InvoicesManager";
import { FinancialReport } from "@/components/admin/billing/FinancialReport";
import { MarketingStaffManager } from "@/components/admin/billing/MarketingStaffManager";
import { XenditSettings } from "@/components/admin/billing/XenditSettings";
import { ManualPaymentVerification } from "@/components/admin/billing/ManualPaymentVerification";
import { XenditSandboxTester } from "@/components/admin/billing/XenditSandboxTester";
import { BillingPolicySettings } from "@/components/admin/billing/BillingPolicySettings";
import { ManualPaymentArchive } from "@/components/admin/billing/ManualPaymentArchive";
import { WalletTopupVerification } from "@/components/admin/billing/WalletTopupVerification";
import { GlossaryPanel } from "@/components/common/GlossaryPanel";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const INVOICE_NUMBER_PATTERN = /^INV-\d{6}-\d{4,}$/;
const DUMMY_INVOICE_FILTER = "invoice_number.ilike.INV-IND-DUMMY-%,invoice_number.ilike.INV-DUMMY-%";

const isInvoiceNumberValid = (invoiceNumber: string | null | undefined): boolean => {
  if (!invoiceNumber) return false;
  return INVOICE_NUMBER_PATTERN.test(invoiceNumber.trim());
};

const BILLING_TABS = [
  { id: "overview", label: "Ringkasan" },
  { id: "invoices", label: "Semua Tagihan" },
  { id: "manual", label: "Verifikasi Manual" },
  { id: "manual_archive", label: "Arsip Validasi" },
  { id: "wallet_topup", label: "Topup Saldo" },
  { id: "packages", label: "Paket Langganan" },
  { id: "report", label: "Laporan Keuangan" },
  { id: "marketing", label: "Tim Marketing" },
  { id: "sandbox", label: "Uji Coba Payment" },
  { id: "xendit", label: "Pengaturan Xendit" },
  { id: "settings", label: "Pengaturan Billing" },
  { id: "policy", label: "Kebijakan Billing" },
] as const;

type BillingTabId = (typeof BILLING_TABS)[number]["id"];
type BillingTabGroupId = "operasional" | "produk" | "integrasi" | "kebijakan";

interface DummyInvoiceRow {
  id: string;
  invoice_number: string | null;
}

const BILLING_TAB_GROUPS: Array<{ id: BillingTabGroupId; label: string; tabs: BillingTabId[] }> = [
  { id: "operasional", label: "Operasional", tabs: ["overview", "invoices", "manual", "manual_archive", "wallet_topup"] },
  { id: "produk", label: "Produk & Laporan", tabs: ["packages", "report", "marketing"] },
  { id: "integrasi", label: "Integrasi Payment", tabs: ["sandbox", "xendit"] },
  { id: "kebijakan", label: "Kebijakan", tabs: ["settings", "policy"] },
];

const resolveGroupForTab = (tabId: string): BillingTabGroupId => {
  const matched = BILLING_TAB_GROUPS.find((group) => group.tabs.includes(tabId as BillingTabId));
  return matched?.id || "operasional";
};

export default function BillingDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("overview");
  const [activeGroup, setActiveGroup] = useState<BillingTabGroupId>("operasional");
  const [invoiceFilterMode, setInvoiceFilterMode] = useState<"all" | "invalid_number">("all");
  const [manualArchiveCount, setManualArchiveCount] = useState(0);
  const [walletTopupPendingCount, setWalletTopupPendingCount] = useState(0);
  const [dummyInvoiceCount, setDummyInvoiceCount] = useState(0);
  const [showDummyCleanupDialog, setShowDummyCleanupDialog] = useState(false);
  const [isCleaningDummyInvoices, setIsCleaningDummyInvoices] = useState(false);
  const currentMonth = {
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  };
  
  const { summary, isLoading: isLoadingLedger } = useFinancialLedger(currentMonth);
  const { invoices, isLoading: isLoadingInvoices, refetch: refetchInvoices } = useInvoices();
  const {
    invoices: manualVerificationInvoices,
    isLoading: isLoadingManualVerification,
    refetch: refetchManualVerification,
  } = useManualVerificationInvoices();

  const manualVerificationCount = manualVerificationInvoices.length;
  const pendingStatuses = new Set([
    "PENDING",
    "AWAITING_VERIFICATION",
    "AWAITING_VERIFICATION_FULL",
    "PENDING_VERIFICATION_PARTIAL",
    "PARTIALLY_PAID",
    "REJECTED_NEEDS_REVISION",
  ]);
  const pendingCount = invoices.filter((i) => pendingStatuses.has((i.status || "").toUpperCase())).length;
  const paidCount = invoices.filter(i => i.status === "PAID").length;
  const expiredCount = invoices.filter(i => i.status === "EXPIRED" || i.status === "CANCELLED").length;
  const invoiceNumberHealth = useMemo(() => {
    const invalidRows = invoices.filter((invoice) => !isInvoiceNumberValid(invoice.invoice_number));
    const invalidSamples = invalidRows
      .slice(0, 3)
      .map((invoice) => (invoice.invoice_number || "(kosong)").trim());

    return {
      total: invoices.length,
      invalid: invalidRows.length,
      valid: Math.max(invoices.length - invalidRows.length, 0),
      invalidSamples,
    };
  }, [invoices]);

  const validTabIds = useMemo(() => new Set(BILLING_TABS.map((tab) => tab.id)), []);
  const focusTopupRequestId = searchParams.get("topupRequestId");
  const sourceErrorRef = searchParams.get("errorRef");
  const focusedTenantId = searchParams.get("tenantId") || searchParams.get("tenant_id");

  const fetchOperationalTabCounts = useCallback(async () => {
    const [archiveRes, topupRes] = await Promise.all([
      supabase
        .from("manual_payments")
        .select("id", { count: "exact", head: true })
        .eq("is_archived", true),
      supabase
        .from("wallet_topup_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["PENDING", "pending"]),
    ]);

    if (!archiveRes.error) {
      setManualArchiveCount(Number(archiveRes.count || 0));
    }
    if (!topupRes.error) {
      setWalletTopupPendingCount(Number(topupRes.count || 0));
    }
  }, []);

  const fetchDummyInvoiceCount = useCallback(async () => {
    const { count, error } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .or(DUMMY_INVOICE_FILTER);

    if (error) {
      reportError(error, "admin.billing.dummy_invoices.count_failed");
      return;
    }
    setDummyInvoiceCount(Number(count || 0));
  }, []);

  const cleanupDummyInvoices = useCallback(async () => {
    setIsCleaningDummyInvoices(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .or(DUMMY_INVOICE_FILTER)
        .limit(1000);

      if (error) throw error;
      const rows = (data || []) as DummyInvoiceRow[];
      if (rows.length === 0) {
        toast.info("Tidak ada invoice dummy yang perlu dibersihkan.");
        setShowDummyCleanupDialog(false);
        return;
      }

      const invoiceIds = rows.map((row) => row.id);
      const invoiceNumbers = Array.from(new Set(rows.map((row) => row.invoice_number).filter(Boolean))) as string[];
      const nowIso = new Date().toISOString();

      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ last_invoice_id: null, updated_at: nowIso })
        .in("last_invoice_id", invoiceIds);
      if (subError) throw subError;

      const { error: billingLogError } = await supabase
        .from("billing_notification_logs")
        .delete()
        .in("invoice_id", invoiceIds);
      if (billingLogError) throw billingLogError;

      const { error: paymentLogError } = await supabase
        .from("payment_logs")
        .delete()
        .in("invoice_id", invoiceIds);
      if (paymentLogError) throw paymentLogError;

      const { error: ledgerError } = await supabase
        .from("financial_ledger")
        .delete()
        .in("invoice_id", invoiceIds);
      if (ledgerError) throw ledgerError;

      if (invoiceNumbers.length > 0) {
        const { error: manualPaymentError } = await supabase
          .from("manual_payments")
          .delete()
          .in("invoice_number", invoiceNumbers);
        if (manualPaymentError) throw manualPaymentError;
      }

      const { error: invoiceDeleteError } = await supabase
        .from("invoices")
        .delete()
        .in("id", invoiceIds);
      if (invoiceDeleteError) throw invoiceDeleteError;

      toast.success(`Cleanup dummy billing selesai. ${invoiceIds.length} invoice dihapus.`);
      setShowDummyCleanupDialog(false);
      await Promise.all([
        refetchInvoices(),
        refetchManualVerification(),
        fetchOperationalTabCounts(),
        fetchDummyInvoiceCount(),
      ]);
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.cleanup_dummy_invoices.failed");
      toast.error(appendErrorReference("Gagal cleanup data dummy billing.", errorRef));
    } finally {
      setIsCleaningDummyInvoices(false);
    }
  }, [fetchDummyInvoiceCount, fetchOperationalTabCounts, refetchInvoices, refetchManualVerification]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && validTabIds.has(tab)) {
      setActiveTab(tab);
      setActiveGroup(resolveGroupForTab(tab));
    }
  }, [searchParams, validTabIds]);

  useEffect(() => {
    setActiveGroup(resolveGroupForTab(activeTab));
  }, [activeTab]);

  useEffect(() => {
    void fetchOperationalTabCounts();
    void fetchDummyInvoiceCount();
    const channel = supabase
      .channel(`admin-billing-tab-counts-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manual_payments" },
        () => {
          void fetchOperationalTabCounts();
          void refetchManualVerification();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_topup_requests" },
        () => void fetchOperationalTabCounts(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => {
          void fetchDummyInvoiceCount();
          void refetchInvoices();
          void refetchManualVerification();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDummyInvoiceCount, fetchOperationalTabCounts, refetchInvoices, refetchManualVerification]);

  const visibleTabs = useMemo(() => {
    const group = BILLING_TAB_GROUPS.find((item) => item.id === activeGroup) || BILLING_TAB_GROUPS[0];
    const tabSet = new Set(group.tabs);
    return BILLING_TABS.filter((tab) => tabSet.has(tab.id));
  }, [activeGroup]);

  const openInvalidInvoiceNumbers = () => {
    setActiveTab("invoices");
    setInvoiceFilterMode(invoiceNumberHealth.invalid > 0 ? "invalid_number" : "all");
  };

  const clearFocusedTenant = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("tenantId");
    nextParams.delete("tenant_id");
    nextParams.set("tab", "invoices");
    const query = nextParams.toString();
    navigate(query ? `/admin/billing?${query}` : "/admin/billing", { replace: true });
  }, [navigate, searchParams]);

  return (
    <SuperAdminLayout
      title="Billing & Payment"
      subtitle="Kelola tagihan, pembayaran, dan langganan"
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <GlossaryPanel defaultCategory="billing" />
        </div>
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendapatan Kotor (Bulan Ini)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingLedger ? <Skeleton className="h-8 w-28" /> : formatCurrency(summary.total_gross)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.transaction_count} transaksi
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendapatan Bersih</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {isLoadingLedger ? <Skeleton className="h-8 w-28" /> : formatCurrency(summary.total_net)}
              </div>
              <p className="text-xs text-muted-foreground">
                Setelah fee & PPN
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Menunggu Verifikasi</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {isLoadingManualVerification ? <Skeleton className="h-8 w-12" /> : manualVerificationCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Antrean tab Verifikasi Manual
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status Invoice</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">{paidCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium">{pendingCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium">{expiredCount}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Lunas / Menunggu / Berakhir
              </p>
            </CardContent>
          </Card>

          <button type="button" className="text-left" onClick={openInvalidInvoiceNumbers}>
            <Card className={invoiceNumberHealth.invalid > 0 ? "border-red-300" : "border-green-300"}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Kesehatan Nomor Faktur</CardTitle>
                {invoiceNumberHealth.invalid > 0 ? (
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${invoiceNumberHealth.invalid > 0 ? "text-red-600" : "text-green-600"}`}>
                  {isLoadingInvoices ? (
                    <Skeleton className="h-8 w-24" />
                  ) : invoiceNumberHealth.invalid > 0 ? (
                    "Tidak Sehat"
                  ) : (
                    "Sehat"
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Valid {invoiceNumberHealth.valid}/{invoiceNumberHealth.total} • Invalid {invoiceNumberHealth.invalid}
                </p>
                {invoiceNumberHealth.invalidSamples.length > 0 && (
                  <p className="mt-1 text-[11px] text-red-700">
                    Contoh: {invoiceNumberHealth.invalidSamples.join(", ")}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">Klik untuk melihat daftar invoice.</p>
              </CardContent>
            </Card>
          </button>
        </div>

        <Card className="border-dashed border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilitas Data Dummy Billing</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bersihkan invoice dummy test dengan pola nomor <code>INV-IND-DUMMY-*</code> atau <code>INV-DUMMY-*</code>.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Terdeteksi: <strong>{dummyInvoiceCount}</strong> invoice dummy
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={dummyInvoiceCount === 0 || isCleaningDummyInvoices}
                onClick={() => setShowDummyCleanupDialog(true)}
              >
                {isCleaningDummyInvoices ? "Memproses..." : "Cleanup Data Dummy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Card>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-3 py-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {BILLING_TAB_GROUPS.map((group) => (
                    <Button
                      key={group.id}
                      type="button"
                      size="sm"
                      variant={activeGroup === group.id ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => {
                        setActiveGroup(group.id);
                        if (!group.tabs.includes(activeTab as BillingTabId)) {
                          setActiveTab(group.tabs[0]);
                        }
                      }}
                    >
                      {group.label}
                    </Button>
                  ))}
                </div>
                <div className="overflow-x-auto pb-1">
                  <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.10)] backdrop-blur supports-[backdrop-filter]:bg-white/70">
                    {visibleTabs.map((tab) => (
                      <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        className="rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 shadow-none transition-all duration-200 hover:-translate-y-px hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900 data-[state=active]:border-slate-800/70 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-[0_10px_24px_rgba(15,23,42,0.30)]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>{tab.label}</span>
                          {tab.id === "manual" && manualVerificationCount > 0 ? (
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700">
                              {manualVerificationCount}
                            </span>
                          ) : null}
                          {tab.id === "manual_archive" && manualArchiveCount > 0 ? (
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold text-slate-700">
                              {manualArchiveCount}
                            </span>
                          ) : null}
                          {tab.id === "wallet_topup" && walletTopupPendingCount > 0 ? (
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-700">
                              {walletTopupPendingCount}
                            </span>
                          ) : null}
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </div>

              <div className="p-6">
                <TabsContent value="overview" className="mt-0">
                  <OverviewContent
                    invoices={manualVerificationInvoices}
                    isLoading={isLoadingManualVerification}
                    onOpenManualTab={() => setActiveTab("manual")}
                  />
                </TabsContent>
                <TabsContent value="invoices" className="mt-0">
                  <InvoicesManager
                    filterMode={invoiceFilterMode}
                    onClearFilterMode={() => setInvoiceFilterMode("all")}
                    focusedTenantId={focusedTenantId}
                    onClearFocusedTenant={clearFocusedTenant}
                  />
                </TabsContent>
                <TabsContent value="manual" className="mt-0">
                  <ManualPaymentVerification
                    invoices={manualVerificationInvoices}
                    isLoading={isLoadingManualVerification}
                    onRefetch={refetchManualVerification}
                  />
                </TabsContent>
                <TabsContent value="manual_archive" className="mt-0">
                  <ManualPaymentArchive />
                </TabsContent>
                <TabsContent value="wallet_topup" className="mt-0">
                  <WalletTopupVerification focusRequestId={focusTopupRequestId} sourceErrorRef={sourceErrorRef} />
                </TabsContent>
                <TabsContent value="packages" className="mt-0">
                  <SubscriptionPackagesManager />
                </TabsContent>
                <TabsContent value="report" className="mt-0">
                  <FinancialReport />
                </TabsContent>
                <TabsContent value="marketing" className="mt-0">
                  <MarketingStaffManager />
                </TabsContent>
                <TabsContent value="xendit" className="mt-0">
                  <XenditSettings />
                </TabsContent>
               <TabsContent value="sandbox" className="mt-0">
                 <XenditSandboxTester />
               </TabsContent>
                <TabsContent value="settings" className="mt-0">
                  <BillingSettings />
                </TabsContent>
                <TabsContent value="policy" className="mt-0">
                  <BillingPolicySettings tenantId="" />
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDummyCleanupDialog} onOpenChange={setShowDummyCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cleanup Dummy Billing</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus data dummy billing (invoice + relasi log/manual payment) untuk pola nomor
              dummy test. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaningDummyInvoices}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void cleanupDummyInvoices();
              }}
              disabled={isCleaningDummyInvoices}
            >
              {isCleaningDummyInvoices ? "Memproses..." : "Ya, Cleanup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
}

interface OverviewContentProps {
  invoices: Invoice[];
  isLoading: boolean;
  onOpenManualTab: () => void;
}

function OverviewContent({ invoices, isLoading, onOpenManualTab }: OverviewContentProps) {

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Menunggu Verifikasi Pembayaran</h3>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-[76px] w-full rounded-lg" />
            <Skeleton className="h-[76px] w-full rounded-lg" />
            <Skeleton className="h-[76px] w-full rounded-lg" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <FolderClock className="h-5 w-5 text-slate-500" />
            </div>
            <p className="text-base font-medium text-slate-900">Tidak ada pembayaran yang menunggu verifikasi</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Item verifikasi baru akan muncul otomatis saat organisasi mengirim konfirmasi pembayaran manual.
            </p>
            <Button className="mt-4" variant="outline" size="sm" onClick={onOpenManualTab}>
              Buka Tab Verifikasi Manual
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.slice(0, 5).map((invoice) => (
              <Card key={invoice.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{invoice.tenant?.name || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.invoice_number} • {format(new Date(invoice.issue_date), "dd MMM yyyy", { locale: id })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(invoice.gross_amount)}</p>
                    <p className="text-xs text-muted-foreground">{invoice.package_name || "Custom"}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
