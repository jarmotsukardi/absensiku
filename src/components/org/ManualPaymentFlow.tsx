import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CreditCard,
  CheckCircle2,
  Copy,
  Loader2,
  Receipt,
  AlertTriangle,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { Json, Tables } from "@/integrations/supabase/types";

type SubscriptionPackage = Tables<"subscription_packages">;

interface BillingSettingsValue {
  bank_name?: string;
  bank_account?: string;
  bank_account_name?: string;
}

const toJsonObject = (value: Json | null | undefined): Record<string, Json> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, Json>;
};

interface ManualPaymentFlowProps {
  tenantId: string;
  tenantName: string;
  currentEmployeeCount: number;
  subscriptionId?: string;
}

export function ManualPaymentFlow({
  tenantId,
  tenantName,
  currentEmployeeCount,
  subscriptionId,
}: ManualPaymentFlowProps) {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [employeeCount, setEmployeeCount] = useState(currentEmployeeCount || 5);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    invoiceNumber: string;
    totalAmount: number;
    uniqueCode: number;
    finalAmount: number;
    bankInfo: { bank: string; account: string; name: string };
  } | null>(null);

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      setPackages(data || []);
      if (data && data.length > 0) {
        setSelectedPackage(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching packages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSelectedPackageData = () => packages.find((p) => p.id === selectedPackage);

  const calculateTotal = () => {
    const pkg = getSelectedPackageData();
    if (!pkg) return { subtotal: 0, discount: 0, total: 0 };

    const subtotal = pkg.base_price_per_month * employeeCount * pkg.duration_months;
    const discount = subtotal * (pkg.discount_percentage / 100);
    const total = subtotal - discount;
    return { subtotal, discount, total };
  };

  const generateUniqueCode = () => {
    return Math.floor(Math.random() * 900) + 100;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);

  const handleInitiatePayment = async () => {
    setShowConfirmDialog(true);
  };

  const handleSubmitPayment = async () => {
    const pkg = getSelectedPackageData();
    if (!pkg) return;

    setIsSubmitting(true);
    try {
      const { total } = calculateTotal();
      const uniqueCode = generateUniqueCode();
      const finalAmount = total + uniqueCode;
      const invoiceNumber = `INV-${format(new Date(), "yyyyMMdd")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const { error: invoiceError } = await supabase.from("invoices").insert({
        tenant_id: tenantId,
        subscription_id: subscriptionId || null,
        package_id: pkg.id,
        package_name: pkg.name,
        package_duration_months: pkg.duration_months,
        package_discount_percentage: pkg.discount_percentage,
        employee_count: employeeCount,
        price_per_employee: pkg.base_price_per_month,
        subtotal: total,
        discount_amount: calculateTotal().discount,
        vat_percentage: 0,
        vat_amount: 0,
        gross_amount: finalAmount,
        xendit_fee: 0,
        net_amount: finalAmount,
        invoice_number: invoiceNumber,
        status: "PENDING",
        payment_method_type: "MANUAL_TRANSFER",
        due_date: format(addMonths(new Date(), 0), "yyyy-MM-dd"),
        metadata: { unique_code: uniqueCode },
        notes: `Angka unik: ${uniqueCode}`,
      });

      if (invoiceError) throw invoiceError;

      const { data: billingSettings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "billing_settings")
        .maybeSingle();

      const billingValue = toJsonObject(billingSettings?.value);
      const settings = billingValue as BillingSettingsValue | null;

      const bankInfo = settings
        ? {
            bank: settings.bank_name || "BCA",
            account: settings.bank_account || "1234567890",
            name: settings.bank_account_name || "PT AbsensiKu Indonesia",
          }
        : {
            bank: "BCA",
            account: "1234567890",
            name: "PT AbsensiKu Indonesia",
          };

      setPaymentResult({
        invoiceNumber,
        totalAmount: total,
        uniqueCode,
        finalAmount,
        bankInfo,
      });

      toast.success("Invoice pembayaran berhasil dibuat. Langganan aktif setelah pembayaran tervalidasi.");
    } catch (error: unknown) {
      console.error("Error creating payment:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal membuat pembayaran: " + errorMessage);
    } finally {
      setIsSubmitting(false);
      setShowConfirmDialog(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Disalin ke clipboard");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show payment result
  if (paymentResult) {
    return (
      <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/10">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-green-700 dark:text-green-400">
                Invoice Pembayaran Berhasil Dibuat!
              </CardTitle>
              <CardDescription>
                Silakan transfer sesuai nominal berikut untuk proses verifikasi pembayaran
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white dark:bg-background rounded-lg p-4 border space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">No. Invoice</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{paymentResult.invoiceNumber}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(paymentResult.invoiceNumber)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(paymentResult.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-primary">
              <span className="text-sm">Angka Unik</span>
              <span className="font-semibold">+ {paymentResult.uniqueCode}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total Transfer</span>
              <div className="flex items-center gap-2">
                <span className="text-primary">{formatCurrency(paymentResult.finalAmount)}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(paymentResult.finalAmount.toString())}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-background rounded-lg p-4 border">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Transfer ke Rekening
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-semibold">{paymentResult.bankInfo.bank}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">No. Rekening</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{paymentResult.bankInfo.account}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(paymentResult.bankInfo.account)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Atas Nama</span>
                <span className="font-semibold">{paymentResult.bankInfo.name}</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Penting:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Transfer harus sesuai nominal <strong>persis</strong> (termasuk angka unik)</li>
                  <li>Langganan akan aktif setelah pembayaran diverifikasi admin</li>
                  <li>Jika pembayaran tidak valid, Anda akan menerima notifikasi lanjutan</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { subtotal, discount, total } = calculateTotal();
  const pkg = getSelectedPackageData();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pembayaran Manual
          </CardTitle>
          <CardDescription>
            Pilih paket langganan dan lakukan transfer bank dengan angka unik
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Package Selection */}
          <div className="space-y-2">
            <Label>Paket Langganan</Label>
            <Select value={selectedPackage} onValueChange={setSelectedPackage}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih paket" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} - {p.duration_months} bulan
                    {p.discount_percentage > 0 && ` (Hemat ${p.discount_percentage}%)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Employee Count */}
          <div className="space-y-2">
            <Label>Jumlah Pegawai</Label>
            <Input
              type="number"
              min={1}
              value={employeeCount}
              onChange={(e) => setEmployeeCount(parseInt(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground">
              Digunakan untuk perhitungan billing invoice. Harga per pegawai: {pkg ? formatCurrency(pkg.base_price_per_month) : "-"}/bulan
              {currentEmployeeCount > 0 && ` • Pegawai aktif saat ini: ${currentEmployeeCount}`}
            </p>
          </div>

          {/* Summary */}
          {pkg && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {employeeCount} pegawai × {formatCurrency(pkg.base_price_per_month)} × {pkg.duration_months} bulan
                </span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Diskon ({pkg.discount_percentage}%)</span>
                  <span>- {formatCurrency(discount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                + angka unik 3 digit akan ditambahkan saat konfirmasi
              </p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!selectedPackage || employeeCount < 1}
            onClick={handleInitiatePayment}
          >
            <Receipt className="h-4 w-4 mr-2" />
            Konfirmasi & Buat Invoice
          </Button>
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Pembayaran</DialogTitle>
            <DialogDescription>
              Langganan akan langsung aktif setelah konfirmasi. Validasi transfer dilakukan
              kemudian oleh admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex justify-between text-sm">
              <span>Paket</span>
              <span className="font-semibold">{pkg?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Durasi</span>
              <span className="font-semibold">{pkg?.duration_months} bulan</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Pegawai (Billing)</span>
              <span className="font-semibold">{employeeCount}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total (+ angka unik)</span>
              <span className="text-primary">{formatCurrency(total)} + xxx</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Batal
            </Button>
            <Button onClick={handleSubmitPayment} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Konfirmasi & Aktifkan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
