import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
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
  error?: string;
  invoice?: {
    invoice_url?: string | null;
  };
}

type PaymentMethod = "manual" | "xendit";

export function OrgActivationTab({ tenantId, tenantName }: OrgActivationTabProps) {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [memberSlider, setMemberSlider] = useState([10]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual");
  const [isCreatingXenditInvoice, setIsCreatingXenditInvoice] = useState(false);
  const [xenditEnabled, setXenditEnabled] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [pkgRes, subRes, invRes, empRes, xenditRes] = await Promise.all([
        supabase.from("subscription_packages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("subscriptions").select("*").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("system_settings").select("value").eq("key", "xendit_enabled").maybeSingle(),
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
      if (pkgRes.data && pkgRes.data.length > 0) {
        setSelectedPkgId(pkgRes.data[0].id);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const selectedPkg = packages.find((p) => p.id === selectedPkgId);

  const calculateTotal = () => {
    if (!selectedPkg) return { subtotal: 0, discount: 0, total: 0 };
    const subtotal = selectedPkg.base_price_per_month * memberSlider[0] * selectedPkg.duration_months;
    const discount = subtotal * (selectedPkg.discount_percentage / 100);
    return { subtotal, discount, total: subtotal - discount };
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Lunas</Badge>;
      case "PENDING": return <Badge variant="secondary">Menunggu</Badge>;
      case "CANCELLED": return <Badge variant="destructive">Batal</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleXenditCheckout = async () => {
    if (!selectedPkg) return;
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
      if (!data?.success) throw new Error(data?.error || "Gagal membuat invoice");

      toast.success("Invoice berhasil dibuat! Anda akan diarahkan ke halaman pembayaran.");
      
      // Open Xendit checkout URL
      if (data.invoice?.invoice_url) {
        window.open(data.invoice.invoice_url, "_blank");
      }

      // Refresh invoices
      void fetchAll();
    } catch (error: unknown) {
      console.error("Xendit error:", error);
      const errorMessage = error instanceof Error ? error.message : "Gagal membuat invoice Xendit";
      toast.error(errorMessage);
    } finally {
      setIsCreatingXenditInvoice(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { subtotal, discount, total } = calculateTotal();

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Status Langganan
          </CardTitle>
          <CardDescription>Informasi langganan saat ini untuk {tenantName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
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

      {/* Subscription Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Kalkulator Langganan
          </CardTitle>
          <CardDescription>Geser slider untuk menghitung estimasi biaya berdasarkan jumlah member</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Package Selection */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                <p className="text-sm font-medium mt-1">{formatCurrency(pkg.base_price_per_month)}/org/bln</p>
                {pkg.discount_percentage > 0 && (
                  <Badge variant="secondary" className="mt-2 text-xs">Hemat {pkg.discount_percentage}%</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Member Slider */}
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

          {/* Price Breakdown */}
          {selectedPkg && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {memberSlider[0]} member × {formatCurrency(selectedPkg.base_price_per_month)} × {selectedPkg.duration_months} bln
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
              onClick={() => xenditEnabled && setPaymentMethod("xendit")}
              disabled={!xenditEnabled}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                !xenditEnabled ? "opacity-50 cursor-not-allowed border-border" :
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
                    {xenditEnabled ? "QRIS, Virtual Account, E-Wallet, Kartu" : "Belum dikonfigurasi admin"}
                  </p>
                </div>
              </div>
              {xenditEnabled && (
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
              {!xenditEnabled && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Hubungi admin untuk mengaktifkan pembayaran online
                </p>
              )}
            </button>
          </div>

          {/* Xendit Checkout Button */}
          {paymentMethod === "xendit" && selectedPkg && (
            <div className="pt-2">
              <Button
                onClick={handleXenditCheckout}
                disabled={isCreatingXenditInvoice || !selectedPkg}
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
                Anda akan diarahkan ke halaman pembayaran Xendit
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Payment Flow - only show when manual selected */}
      {paymentMethod === "manual" && (
        <ManualPaymentFlow
          tenantId={tenantId}
          tenantName={tenantName}
          currentEmployeeCount={employeeCount}
          subscriptionId={subscription?.id}
        />
      )}

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Daftar Invoice
          </CardTitle>
          <CardDescription>Invoice jatuh tempo dan riwayat pembayaran</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Belum ada invoice</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Invoice</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                    <TableCell>{format(new Date(inv.created_at), "d MMM yyyy", { locale: idLocale })}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {inv.payment_method_type === "XENDIT" ? "Online" : "Transfer"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{formatCurrency(inv.gross_amount)}</TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell>
                      {inv.invoice_url && inv.status === "PENDING" && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={inv.invoice_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Bayar
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
