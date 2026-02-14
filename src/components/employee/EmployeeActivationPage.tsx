import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CreditCard,
  Calculator,
  Receipt,
  HelpCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Calendar,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface EmployeeActivationPageProps {
  tenantId: string;
  employeeId: string;
  onBack: () => void;
}

interface SubscriptionPackage {
  id: string;
  name: string;
  duration_months: number;
  base_price_per_month: number;
  discount_percentage: number;
  features: any;
  description: string | null;
}

export function EmployeeActivationPage({ tenantId, employeeId, onBack }: EmployeeActivationPageProps) {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [memberCount, setMemberCount] = useState([1]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [pkgRes, invRes, subRes] = await Promise.all([
        supabase.from("subscription_packages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
        supabase.from("subscriptions").select("*").eq("tenant_id", tenantId).maybeSingle(),
      ]);

      setPackages(pkgRes.data || []);
      setInvoices(invRes.data || []);
      setSubscription(subRes.data);
      if (pkgRes.data && pkgRes.data.length > 0) {
        setSelectedPkgId(pkgRes.data[0].id);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPkg = packages.find((p) => p.id === selectedPkgId);

  const calculateTotal = () => {
    if (!selectedPkg) return { subtotal: 0, discount: 0, total: 0 };
    const subtotal = selectedPkg.base_price_per_month * memberCount[0] * selectedPkg.duration_months;
    const discount = subtotal * (selectedPkg.discount_percentage / 100);
    return { subtotal, discount, total: subtotal - discount };
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Lunas</Badge>;
      case "PENDING": return <Badge variant="secondary">Menunggu</Badge>;
      case "CANCELLED": return <Badge variant="destructive">Dibatalkan</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
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
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Aktivasi Langganan</h2>
          <p className="text-sm text-muted-foreground">Kelola langganan dan pembayaran Anda</p>
        </div>
      </div>

      {/* Current Status */}
      {subscription && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Status Langganan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {subscription.status === "active" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="font-semibold text-sm capitalize">{subscription.status}</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Berlaku Hingga</p>
                <p className="font-semibold text-sm mt-1">
                  {subscription.end_date
                    ? format(new Date(subscription.end_date), "d MMM yyyy", { locale: idLocale })
                    : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Kalkulator Langganan
          </CardTitle>
          <CardDescription>Geser slider untuk menghitung estimasi biaya</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Package Selection */}
          <div className="grid grid-cols-2 gap-2">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => setSelectedPkgId(pkg.id)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  selectedPkgId === pkg.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <p className="font-semibold text-sm">{pkg.name}</p>
                <p className="text-xs text-muted-foreground">{pkg.duration_months} bulan</p>
                {pkg.discount_percentage > 0 && (
                  <Badge variant="secondary" className="mt-1 text-xs">
                    Hemat {pkg.discount_percentage}%
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Member Slider */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Jumlah Member</span>
              <span className="text-2xl font-bold text-primary">{memberCount[0]}</span>
            </div>
            <Slider
              value={memberCount}
              onValueChange={setMemberCount}
              min={1}
              max={500}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>500</span>
            </div>
          </div>

          {/* Price Breakdown */}
          {selectedPkg && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {memberCount[0]} member × {formatCurrency(selectedPkg.base_price_per_month)} × {selectedPkg.duration_months} bln
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
              <p className="text-xs text-muted-foreground">
                = {formatCurrency(total / selectedPkg.duration_months)} / bulan
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Riwayat Pembayaran
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Belum ada riwayat pembayaran</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(inv.created_at), "d MMM yyyy", { locale: idLocale })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(inv.gross_amount)}</p>
                    {getStatusBadge(inv.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            FAQ Pembayaran
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="1">
              <AccordionTrigger className="text-sm">Apa itu Billing Mandiri?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Billing Mandiri berarti setiap pegawai bertanggung jawab atas biaya langganan masing-masing.
                Admin organisasi tidak menanggung biaya.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="2">
              <AccordionTrigger className="text-sm">Bagaimana cara membayar?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Anda dapat melakukan transfer bank sesuai nominal yang tertera pada invoice.
                Pastikan transfer persis sesuai nominal (termasuk angka unik) agar sistem dapat mendeteksi pembayaran otomatis.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="3">
              <AccordionTrigger className="text-sm">Apa yang terjadi jika tidak bayar?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Jika pembayaran tidak diselesaikan dalam masa tenggang, akses ke fitur absensi dan pengajuan akan dikunci.
                Data Anda tetap tersimpan dan dapat diakses kembali setelah melakukan pembayaran.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="4">
              <AccordionTrigger className="text-sm">Berapa lama aktivasi berlaku?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Masa aktif tergantung pada paket yang dipilih (1, 3, 6, atau 12 bulan).
                Anda akan mendapat notifikasi sebelum masa aktif berakhir.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
