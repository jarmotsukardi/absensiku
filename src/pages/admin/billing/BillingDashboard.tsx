import { useState } from "react";
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
  AlertCircle
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
import { GlossaryPanel } from "@/components/common/GlossaryPanel";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

export default function BillingDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const currentMonth = {
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  };
  
  const { summary, isLoading: isLoadingLedger } = useFinancialLedger(currentMonth);
  const { invoices, isLoading: isLoadingInvoices } = useInvoices();

  const pendingCount = invoices.filter(i => i.status === "PENDING" || i.status === "AWAITING_VERIFICATION").length;
  const paidCount = invoices.filter(i => i.status === "PAID").length;
  const expiredCount = invoices.filter(i => i.status === "EXPIRED" || i.status === "CANCELLED").length;

  const tabs = [
    { id: "overview", label: "Ringkasan" },
    { id: "invoices", label: "Semua Tagihan" },
    { id: "manual", label: "Verifikasi Manual" },
    { id: "packages", label: "Paket Langganan" },
    { id: "report", label: "Laporan Keuangan" },
    { id: "marketing", label: "Tim Marketing" },
     { id: "sandbox", label: "Uji Coba Payment" },
    { id: "xendit", label: "Pengaturan Xendit" },
    { id: "settings", label: "Pengaturan Billing" },
    { id: "policy", label: "Kebijakan Billing" },
  ];

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
        </div>

        {/* Tabs */}
        <Card>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="border-b bg-muted/30 px-4 overflow-x-auto">
                <TabsList className="h-auto p-0 bg-transparent flex flex-nowrap gap-1">
                  {tabs.map((tab) => (
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
                  <InvoicesManager />
                </TabsContent>
                <TabsContent value="manual" className="mt-0">
                  <ManualPaymentVerification />
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
  const { invoices, isLoading } = useInvoices({ status: "AWAITING_VERIFICATION" });

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
