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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CreditCard,
  CheckCircle2,
  Copy,
  Loader2,
  Receipt,
  AlertTriangle,
  Banknote,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface SubscriptionPackage {
  id: string;
  name: string;
  duration_months: number;
  base_price_per_month: number;
  discount_percentage: number;
  features: any;
}

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

  // Employee count enforcement
  const [showEmployeeMismatchDialog, setShowEmployeeMismatchDialog] = useState(false);
  const [excessEmployees, setExcessEmployees] = useState<{ id: string; name: string; created_at: string }[]>([]);
  const [isDeactivating, setIsDeactivating] = useState(false);

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

  // Check if employee count matches actual active employees
  const validateEmployeeCount = async (): Promise<boolean> => {
    const { count, error } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (error) {
      console.error("Error counting employees:", error);
      return true; // Allow on error
    }

    const activeCount = count || 0;

    if (activeCount > employeeCount) {
      // Fetch the excess employees (newest first) to deactivate
      const excess = activeCount - employeeCount;
      const { data: excessEmps } = await supabase
        .from("employees")
        .select("id, name, created_at")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(excess);

      setExcessEmployees(excessEmps || []);
      setShowEmployeeMismatchDialog(true);
      return false;
    }

    return true;
  };

  const handleDeactivateExcessEmployees = async () => {
    setIsDeactivating(true);
    try {
      const ids = excessEmployees.map((e) => e.id);
      const { error } = await supabase
        .from("employees")
        .update({ is_active: false })
        .in("id", ids);

      if (error) throw error;

      toast.success(`${excessEmployees.length} pegawai berhasil dinonaktifkan`);
      setShowEmployeeMismatchDialog(false);
      setExcessEmployees([]);
      
      // Now proceed with payment
      setShowConfirmDialog(true);
    } catch (error: any) {
      toast.error("Gagal menonaktifkan pegawai: " + error.message);
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleInitiatePayment = async () => {
    // First validate employee count
    const isValid = await validateEmployeeCount();
    if (isValid) {
      setShowConfirmDialog(true);
    }
  };

  const handleSubmitPayment = async () => {
    const pkg = getSelectedPackageData();
    if (!pkg) return;

    setIsSubmitting(true);
    try {
      // Double-check employee count before finalizing
      const { count } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      if ((count || 0) > employeeCount) {
        toast.error(`Masih ada ${(count || 0) - employeeCount} pegawai aktif melebihi kuota. Sesuaikan terlebih dahulu.`);
        setShowConfirmDialog(false);
        setIsSubmitting(false);
        return;
      }

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
        payment_method_type: "manual_transfer",
        due_date: format(addMonths(new Date(), 0), "yyyy-MM-dd"),
        metadata: { unique_code: uniqueCode },
        notes: `Angka unik: ${uniqueCode}`,
      });

      if (invoiceError) throw invoiceError;

      const endDate = format(addMonths(new Date(), pkg.duration_months), "yyyy-MM-dd");

      if (subscriptionId) {
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            max_employees: employeeCount,
            start_date: format(new Date(), "yyyy-MM-dd"),
            end_date: endDate,
          })
          .eq("id", subscriptionId);
      } else {
        await supabase.from("subscriptions").insert({
          tenant_id: tenantId,
          status: "active",
          max_employees: employeeCount,
          start_date: format(new Date(), "yyyy-MM-dd"),
          end_date: endDate,
        });
      }

      const { data: billingSettings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "billing_settings")
        .maybeSingle();

      const bankInfo = billingSettings?.value
        ? {
            bank: (billingSettings.value as any).bank_name || "BCA",
            account: (billingSettings.value as any).bank_account || "1234567890",
            name: (billingSettings.value as any).bank_account_name || "PT AbsensiKu Indonesia",
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

      toast.success("Langganan berhasil diaktifkan! Silakan transfer sesuai nominal.");
    } catch (error: any) {
      console.error("Error creating payment:", error);
      toast.error("Gagal membuat pembayaran: " + error.message);
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
                Langganan Berhasil Diaktifkan!
              </CardTitle>
              <CardDescription>
                Silakan transfer sesuai nominal berikut untuk konfirmasi pembayaran
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
                  <li>Layanan sudah aktif, validasi pembayaran dilakukan admin</li>
                  <li>Jika pembayaran tidak valid, akan ada notifikasi lanjutan</li>
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
          {/* Employee count warning */}
          {currentEmployeeCount > employeeCount && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-destructive text-sm">Peringatan: Kelebihan Pegawai!</p>
                  <p className="text-xs text-destructive/80 mt-1">
                    Anda memiliki <strong>{currentEmployeeCount}</strong> pegawai aktif, tetapi hanya membayar untuk <strong>{employeeCount}</strong>.
                    Saat konfirmasi pembayaran, <strong>{currentEmployeeCount - employeeCount}</strong> pegawai terbaru akan otomatis dinonaktifkan.
                  </p>
                </div>
              </div>
            </div>
          )}

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
              Harga per pegawai: {pkg ? formatCurrency(pkg.base_price_per_month) : "-"}/bulan
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

      {/* Employee Mismatch Dialog */}
      <AlertDialog open={showEmployeeMismatchDialog} onOpenChange={setShowEmployeeMismatchDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <UserMinus className="h-5 w-5" />
              Kelebihan Pegawai Aktif
            </AlertDialogTitle>
            <AlertDialogDescription>
              Anda membayar untuk <strong>{employeeCount}</strong> pegawai, tetapi memiliki <strong>{employeeCount + excessEmployees.length}</strong> pegawai aktif.
              Pegawai berikut (yang paling baru ditambahkan) akan dinonaktifkan:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto space-y-2 my-2">
            {excessEmployees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                <span className="text-sm font-medium">{emp.name}</span>
                <Badge variant="destructive" className="text-xs">Akan Dinonaktifkan</Badge>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivating}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateExcessEmployees}
              disabled={isDeactivating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeactivating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Memproses...</>
              ) : (
                `Nonaktifkan ${excessEmployees.length} Pegawai & Lanjutkan`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <span>Pegawai</span>
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
