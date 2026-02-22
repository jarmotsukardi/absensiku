import { useEffect, useMemo, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFinancialLedger, useInvoices } from "@/hooks/useBilling";
import { 
  DollarSign, 
  Receipt, 
  TrendingUp, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert
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
import { useSearchParams } from "react-router-dom";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const INVOICE_NUMBER_PATTERN = /^INV-\d{6}-\d{4,}$/;

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

export default function BillingDashboard() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("overview");
  const [invoiceFilterMode, setInvoiceFilterMode] = useState<"all" | "invalid_number">("all");
  const currentMonth = {
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  };
  
  const { summary, isLoading: isLoadingLedger } = useFinancialLedger(currentMonth);
  const { invoices, isLoading: isLoadingInvoices } = useInvoices();

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

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && validTabIds.has(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams, validTabIds]);

  const openInvalidInvoiceNumbers = () => {
    setActiveTab("invoices");
    setInvoiceFilterMode(invoiceNumberHealth.invalid > 0 ? "invalid_number" : "all");
  };

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
              <CardTitle className="text-sm font-medium">Gross Revenue (Bulan Ini)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingLedger ? "..." : formatCurrency(summary.total_gross)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.transaction_count} transaksi
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {isLoadingLedger ? "..." : formatCurrency(summary.total_net)}
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
                {isLoadingInvoices ? "..." : pendingCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Invoice perlu diproses
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
                Lunas / Pending / Expired
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
                  {isLoadingInvoices ? "..." : invoiceNumberHealth.invalid > 0 ? "Tidak Sehat" : "Sehat"}
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

        {/* Tabs */}
        <Card>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="border-b bg-muted/30 px-4 overflow-x-auto">
                <TabsList className="h-auto p-0 bg-transparent flex flex-nowrap gap-1">
                  {BILLING_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:shadow-none px-4 py-3 text-sm font-medium whitespace-nowrap"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="p-6">
                <TabsContent value="overview" className="mt-0">
                  <OverviewContent />
                </TabsContent>
                <TabsContent value="invoices" className="mt-0">
                  <InvoicesManager
                    filterMode={invoiceFilterMode}
                    onClearFilterMode={() => setInvoiceFilterMode("all")}
                  />
                </TabsContent>
                <TabsContent value="manual" className="mt-0">
                  <ManualPaymentVerification />
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
    </SuperAdminLayout>
  );
}

function OverviewContent() {
  const { invoices: legacyInvoices, isLoading: isLoadingLegacy } = useInvoices({ status: "AWAITING_VERIFICATION" });
  const { invoices: fullInvoices, isLoading: isLoadingFull } = useInvoices({ status: "AWAITING_VERIFICATION_FULL" });
  const { invoices: partialInvoices, isLoading: isLoadingPartial } = useInvoices({ status: "PENDING_VERIFICATION_PARTIAL" });
  const invoices = [...legacyInvoices, ...fullInvoices, ...partialInvoices];
  const isLoading = isLoadingLegacy || isLoadingFull || isLoadingPartial;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Menunggu Verifikasi Pembayaran</h3>
        {isLoading ? (
          <p className="text-muted-foreground">Memuat...</p>
        ) : invoices.length === 0 ? (
          <p className="text-muted-foreground">Tidak ada pembayaran yang menunggu verifikasi</p>
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
