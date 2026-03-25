import { useState, useEffect } from "react";
import { useSubscriptionPackages, useBillingSettings, SubscriptionPackage } from "@/hooks/useBilling";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Package, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  BILLING_PACKAGE_MODULE_SCOPE_OPTIONS,
  getBillingPackageModuleScopeLabel,
  isAttendanceOnlyBillingPackage,
  normalizeBillingPackageModuleScope,
} from "@/lib/billingPackageScope";
import {
  applyBillingPackageScopePricingDefaults,
  getBillingPackageEffectiveDiscountPercentage,
  getBillingPackageEffectivePricePerMonth,
  getDefaultHrAddonPrice,
  getBillingPackagePromoLabel,
  getBillingPackagePromoSavingsPercentage,
  getDefaultPayrollAddonPrice,
  isBillingPackagePromoActive,
  sanitizeBillingPackagePricing,
} from "@/lib/billingPackagePricing";
import {
  getAttendanceIntroPromoCampaignText,
  normalizeAttendanceIntroPromoConfig,
} from "@/lib/attendanceOnboardingPromo";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const getNumericSettingValue = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    if ("value" in objectValue) return getNumericSettingValue(objectValue.value, fallback);
    if ("amount" in objectValue) return getNumericSettingValue(objectValue.amount, fallback);
  }
  return fallback;
};

export function SubscriptionPackagesManager() {
  const OP_TIMEOUT_MS = 12000;
  const OP_RETRY_MAX = 2;
  const confirmDialog = useConfirmDialog();
  const ITEMS_PER_PAGE = 10;
  const { packages, isLoading, createPackage, updatePackage, deletePackage } = useSubscriptionPackages();
  const { isLoading: isLoadingSettings, getSetting } = useBillingSettings();
  const [showDialog, setShowDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Partial<SubscriptionPackage> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Global billing settings
  const globalPrice = getNumericSettingValue(getSetting("price_per_employee"), 15000);
  const globalVat = getNumericSettingValue(getSetting("vat_percentage"), 11);
  const globalPph = getNumericSettingValue(getSetting("pph_percentage"), 2);
  const attendanceIntroPromoCampaignText = getAttendanceIntroPromoCampaignText(
    normalizeAttendanceIntroPromoConfig(getSetting("attendance_intro_promo")),
  );

  const getEmptyPackage = (): Partial<SubscriptionPackage> => ({
    name: "",
    duration_months: 1,
    base_price_per_month: globalPrice,
    attendance_base_price: globalPrice,
    hr_addon_price: 0,
    payroll_addon_price: 0,
    promo_active: false,
    promo_price_per_month: null,
    promo_label: null,
    discount_percentage: 0,
    is_active: true,
    applies_to: "ALL",
    description: "",
    module_scope: "attendance",
  });

  const handleCreate = () => {
    setEditingPackage(getEmptyPackage());
    setShowDialog(true);
  };

  const handleEdit = (pkg: SubscriptionPackage) => {
    const moduleScope = normalizeBillingPackageModuleScope(pkg.module_scope);
    setEditingPackage({
      ...pkg,
      module_scope: moduleScope,
      ...sanitizeBillingPackagePricing(pkg, globalPrice),
      ...(moduleScope === "attendance"
        ? {
            promo_active: false,
            promo_price_per_month: null,
            promo_label: null,
          }
        : {}),
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!editingPackage?.name) return;

    setIsSaving(true);
    try {
      const payload =
        normalizeBillingPackageModuleScope(editingPackage.module_scope) === "attendance"
          ? {
              ...editingPackage,
              promo_active: false,
              promo_price_per_month: null,
              promo_label: null,
            }
          : editingPackage;
      if (editingPackage.id) {
        await withTimeout(
          updatePackage(editingPackage.id, payload),
          OP_TIMEOUT_MS,
          "Menyimpan perubahan paket terlalu lama",
        );
      } else {
        await withTimeout(
          createPackage(payload),
          OP_TIMEOUT_MS,
          "Membuat paket baru terlalu lama",
        );
      }
      setShowDialog(false);
      setEditingPackage(null);
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.packages.save");
      toast.error(appendErrorReference("Gagal menyimpan paket", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Hapus Paket",
      description: "Hapus paket ini?",
      confirmText: "Ya, hapus",
      variant: "destructive",
    });
    if (!confirmed) return;
    await deletePackage(id);
  };

  // Sync all packages to use the current global price
  const handleSyncAllPrices = async () => {
    const outOfSync = packages.filter(
      (p) => isAttendanceOnlyBillingPackage(p) && p.attendance_base_price !== globalPrice,
    );
    if (outOfSync.length === 0) {
      toast.info("Semua paket Absensi sudah sinkron dengan harga dasar global");
      return;
    }

    if (
      !(await confirmDialog({
        title: "Sinkronkan Harga Paket",
        description: `${outOfSync.length} paket Absensi memiliki harga berbeda dari pengaturan global (${formatCurrency(globalPrice)}/bulan). Sinkronkan semua?`,
        confirmText: "Ya, sinkronkan",
      }))
    ) {
      return;
    }

    setIsSyncing(true);
    try {
      await withExponentialBackoff(
        async () =>
          withTimeout(
            Promise.all(
              outOfSync.map(pkg => updatePackage(pkg.id, { attendance_base_price: globalPrice, module_scope: "attendance" }))
            ),
            OP_TIMEOUT_MS,
            "Sinkronisasi harga paket terlalu lama",
          ),
        {
          maxRetries: OP_RETRY_MAX,
          baseDelay: 500,
          shouldRetry: (err) => isRetryableError(err),
        },
      );
      toast.success(`${outOfSync.length} paket Absensi berhasil disinkronkan`);
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.packages.sync_all_prices");
      toast.error(appendErrorReference("Gagal menyinkronkan paket", errorRef));
    } finally {
      setIsSyncing(false);
    }
  };

  const calculateSubtotal = (pkg: Partial<SubscriptionPackage>) => {
    const unitPrice = getEffectiveMonthlyPrice(pkg);
    const effectiveDiscountPercentage = getEffectiveDiscountPercentage(pkg);
    const base = unitPrice * (pkg.duration_months || 1);
    const discount = base * (effectiveDiscountPercentage / 100);
    return base - discount;
  };

  const getEffectiveMonthlyPrice = (pkg: Partial<SubscriptionPackage>) => {
    const pricing = sanitizeBillingPackagePricing(pkg, globalPrice);
    return normalizeBillingPackageModuleScope(pkg.module_scope) === "attendance"
      ? pricing.base_price_per_month
      : getBillingPackageEffectivePricePerMonth(pkg, globalPrice);
  };

  const getEffectiveDiscountPercentage = (pkg: Partial<SubscriptionPackage>) => {
    if (normalizeBillingPackageModuleScope(pkg.module_scope) === "attendance") {
      return Math.max(0, Math.min(100, Math.round(Number(pkg.discount_percentage || 0))));
    }
    return getBillingPackageEffectiveDiscountPercentage(pkg);
  };

  const calculateWithTax = (subtotal: number) => {
    const ppnAmount = subtotal * (globalVat / 100);
    const pphAmount = subtotal * (globalPph / 100);
    return { ppnAmount, pphAmount, total: subtotal + ppnAmount + pphAmount };
  };

  const editingPricing = editingPackage
    ? sanitizeBillingPackagePricing(editingPackage, globalPrice)
    : null;

  // Check if any package is out of sync
  const outOfSyncCount = packages.filter(
    (p) => isAttendanceOnlyBillingPackage(p) && p.attendance_base_price !== globalPrice,
  ).length;
  const totalPages = Math.max(1, Math.ceil(packages.length / ITEMS_PER_PAGE));
  const paginatedPackages = packages.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [packages.length]);

  if (isLoading || isLoadingSettings) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
        </div>
        <p className="text-base font-medium text-slate-900">Memuat paket langganan</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Data paket dan konfigurasi billing global sedang disiapkan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Global Settings Info */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Harga Dasar Global Absensi</p>
                <p className="text-lg font-bold">{formatCurrency(globalPrice)}<span className="text-xs font-normal text-muted-foreground">/pegawai/bulan</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PPN</p>
                <p className="text-lg font-bold">{globalVat}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PPH</p>
                <p className="text-lg font-bold">{globalPph}%</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Dari tab "Pengaturan Billing"
            </p>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>
          Harga paket yang sudah berjalan saat ini dibaca sebagai <strong>Absensi</strong>. Paket
          <strong> Absensi + HR</strong> dan <strong>Absensi + HR + Payroll</strong> tetap diatur
          sebagai harga final bundle terpisah. Promo onboarding Absensi dipusatkan di
          <strong> Billing Settings</strong>, sedangkan editor promo package-level hanya berlaku
          untuk bundle non-Absensi.
        </AlertDescription>
      </Alert>

      {/* Sync Warning */}
      {outOfSyncCount > 0 && (
        <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100">
          <AlertDescription className="flex items-center justify-between">
            <span>⚠️ {outOfSyncCount} paket Absensi memiliki harga dasar berbeda dari pengaturan global ({formatCurrency(globalPrice)}/bulan)</span>
            <Button size="sm" variant="outline" onClick={handleSyncAllPrices} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
              Sinkronkan Semua
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Paket Langganan</h3>
          <p className="text-sm text-muted-foreground">Kelola paket dan diskon berlangganan</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Tambah Paket
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Paket</TableHead>
              <TableHead>Cakupan Modul</TableHead>
              <TableHead>Durasi</TableHead>
              <TableHead>Harga/Bulan</TableHead>
              <TableHead>Diskon</TableHead>
              <TableHead>Subtotal/Pegawai</TableHead>
              <TableHead>PPN ({globalVat}%)</TableHead>
              <TableHead>PPH ({globalPph}%)</TableHead>
              <TableHead>Total/Pegawai</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-10">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
                    <div className="rounded-full bg-slate-100 p-3">
                      <Package className="h-5 w-5 text-slate-500" />
                    </div>
                    <p className="text-base font-medium text-slate-800">Belum ada paket langganan</p>
                    <p className="text-sm text-muted-foreground">
                      Tambahkan paket baru agar organisasi bisa membuat invoice dari penawaran.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedPackages.map((pkg) => {
                const subtotal = calculateSubtotal(pkg);
                const { ppnAmount, pphAmount, total } = calculateWithTax(subtotal);
                const isAttendanceScope = isAttendanceOnlyBillingPackage(pkg);
                const isOutOfSync = isAttendanceScope && pkg.attendance_base_price !== globalPrice;
                const promoActive = !isAttendanceScope && isBillingPackagePromoActive(pkg, globalPrice);
                const effectiveMonthlyPrice = getEffectiveMonthlyPrice(pkg);
                const effectiveDiscountPercentage = getEffectiveDiscountPercentage(pkg);
                const promoLabel = getBillingPackagePromoLabel(pkg, globalPrice);
                const promoSavings = getBillingPackagePromoSavingsPercentage(pkg, globalPrice);

                return (
                  <TableRow key={pkg.id} className={isOutOfSync ? "bg-yellow-50/50 dark:bg-yellow-950/20" : ""}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getBillingPackageModuleScopeLabel(pkg.module_scope)}
                      </Badge>
                    </TableCell>
                    <TableCell>{pkg.duration_months} Bulan</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span>{formatCurrency(effectiveMonthlyPrice)}</span>
                          {promoActive && pkg.base_price_per_month > effectiveMonthlyPrice ? (
                            <span className="text-xs text-muted-foreground line-through">
                              {formatCurrency(pkg.base_price_per_month)}
                            </span>
                          ) : null}
                          {isOutOfSync && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-yellow-500 text-yellow-700">
                              ≠ global
                            </Badge>
                          )}
                          {promoActive ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {promoLabel || "Promo"}
                            </Badge>
                          ) : null}
                        </div>
                        {promoActive && promoSavings ? (
                          <p className="text-[11px] text-emerald-600">
                            Harga efektif saat ini • hemat {promoSavings}%
                          </p>
                        ) : null}
                        {pkg.module_scope !== "attendance" ? (
                          <p className="text-[11px] text-muted-foreground">
                            Absensi {formatCurrency(pkg.attendance_base_price)}
                            {pkg.hr_addon_price > 0 ? ` + HR ${formatCurrency(pkg.hr_addon_price)}` : ""}
                            {pkg.payroll_addon_price > 0 ? ` + Payroll ${formatCurrency(pkg.payroll_addon_price)}` : ""}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Harga onboarding Absensi dikelola di Billing Settings.
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {effectiveDiscountPercentage > 0 ? (
                        <Badge variant="secondary">{effectiveDiscountPercentage}%</Badge>
                      ) : promoActive ? (
                        <span className="text-xs text-muted-foreground">Promo override</span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(subtotal)}
                    </TableCell>
                    <TableCell className="font-medium text-blue-600">
                      {formatCurrency(ppnAmount)}
                    </TableCell>
                    <TableCell className="font-medium text-indigo-600">
                      {formatCurrency(pphAmount)}
                    </TableCell>
                    <TableCell className="font-bold text-primary">
                      {formatCurrency(total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {pkg.applies_to === "ALL" ? "Semua" :
                         pkg.applies_to === "INSTITUTION" ? "Institusi" : "Perorangan"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={pkg.is_active ? "default" : "secondary"}>
                        {pkg.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(pkg)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(pkg.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {packages.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Sebelumnya
            </Button>
            <span className="text-sm text-muted-foreground">
              Halaman {currentPage} dari {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Berikutnya
            </Button>
          </div>
        )}
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editingPackage?.id ? "Edit Paket" : "Tambah Paket"}
            </DialogTitle>
          </DialogHeader>

          {editingPackage && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Paket</Label>
                <Input
                  value={editingPackage.name || ""}
                  onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })}
                  placeholder="Contoh: Tahunan"
                />
              </div>

              <div className="space-y-2">
                <Label>Cakupan Modul</Label>
                <Select
                  value={normalizeBillingPackageModuleScope(editingPackage.module_scope)}
                  onValueChange={(value) =>
                    {
                      const nextScope = normalizeBillingPackageModuleScope(value);
                      setEditingPackage({
                        ...editingPackage,
                        ...applyBillingPackageScopePricingDefaults(
                          editingPackage,
                          nextScope,
                          globalPrice,
                        ),
                        ...(nextScope === "attendance"
                          ? {
                              promo_active: false,
                              promo_price_per_month: null,
                              promo_label: null,
                            }
                          : {}),
                      });
                    }
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_PACKAGE_MODULE_SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {normalizeBillingPackageModuleScope(editingPackage.module_scope) === "attendance" ? (
                <Alert className="border-dashed bg-muted/40">
                  <AlertDescription className="text-xs">
                    Promo onboarding Absensi diatur dari Billing Settings, bukan dari editor promo
                    paket. Field promo package-level untuk cakupan Absensi dinonaktifkan.
                    {attendanceIntroPromoCampaignText ? ` ${attendanceIntroPromoCampaignText}` : ""}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Durasi (Bulan)</Label>
                  <Select
                    value={String(editingPackage.duration_months || 1)}
                    onValueChange={(v) => setEditingPackage({ ...editingPackage, duration_months: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Bulan</SelectItem>
                      <SelectItem value="3">3 Bulan</SelectItem>
                      <SelectItem value="6">6 Bulan</SelectItem>
                      <SelectItem value="12">12 Bulan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Diskon (%)</Label>
                  <Input
                    type="number"
                    value={editingPackage.discount_percentage || 0}
                    onChange={(e) => setEditingPackage({ ...editingPackage, discount_percentage: Number(e.target.value) })}
                    min={0}
                    max={100}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Harga Dasar Absensi</Label>
                  {normalizeBillingPackageModuleScope(editingPackage.module_scope) === "attendance" &&
                    editingPricing?.attendance_base_price !== globalPrice && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() =>
                          setEditingPackage({
                            ...editingPackage,
                            attendance_base_price: globalPrice,
                            hr_addon_price: 0,
                            payroll_addon_price: 0,
                          })
                        }
                      >
                        Gunakan harga dasar global ({formatCurrency(globalPrice)})
                      </Button>
                    )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                  <Input
                    type="number"
                    value={editingPricing?.attendance_base_price || 0}
                    onChange={(e) =>
                      setEditingPackage({
                        ...editingPackage,
                        attendance_base_price: Number(e.target.value),
                      })
                    }
                    className="pl-10"
                  />
                </div>
                {normalizeBillingPackageModuleScope(editingPackage.module_scope) === "attendance_hr" ||
                normalizeBillingPackageModuleScope(editingPackage.module_scope) === "attendance_hr_payroll" ? (
                  <div className="space-y-2">
                    <Label>Tambahan HR</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                      <Input
                        type="number"
                        value={editingPricing?.hr_addon_price || 0}
                        onChange={(e) =>
                          setEditingPackage({
                            ...editingPackage,
                            hr_addon_price: Number(e.target.value),
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                    {editingPricing?.hr_addon_price === 0 ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() =>
                          setEditingPackage({
                            ...editingPackage,
                            hr_addon_price: getDefaultHrAddonPrice(editingPricing.attendance_base_price),
                          })
                        }
                      >
                        Isi default HR ({formatCurrency(getDefaultHrAddonPrice(editingPricing.attendance_base_price))})
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {normalizeBillingPackageModuleScope(editingPackage.module_scope) === "attendance_hr_payroll" ? (
                  <div className="space-y-2">
                    <Label>Tambahan Payroll</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                      <Input
                        type="number"
                        value={editingPricing?.payroll_addon_price || 0}
                        onChange={(e) =>
                          setEditingPackage({
                            ...editingPackage,
                            payroll_addon_price: Number(e.target.value),
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                    {editingPricing?.payroll_addon_price === 0 ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() =>
                          setEditingPackage({
                            ...editingPackage,
                            payroll_addon_price: getDefaultPayrollAddonPrice(
                              editingPricing.attendance_base_price,
                            ),
                          })
                        }
                      >
                        Isi default Payroll ({formatCurrency(getDefaultPayrollAddonPrice(editingPricing.attendance_base_price))})
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {normalizeBillingPackageModuleScope(editingPackage.module_scope) !== "attendance" ? (
                  <p className="text-xs text-muted-foreground">
                    Isi harga final bundle sesuai cakupan modul yang dipilih.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Harga Normal per Pegawai/Bulan</Label>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold">
                  {formatCurrency(editingPricing?.base_price_per_month || 0)}
                </div>
              </div>

              {normalizeBillingPackageModuleScope(editingPackage.module_scope) !== "attendance" ? (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-sm">Aktifkan Promo Harga</Label>
                      <p className="text-xs text-muted-foreground">
                        Saat promo aktif, harga efektif invoice dan pricing publik memakai harga promo,
                        lalu diskon paket normal tidak diterapkan.
                      </p>
                    </div>
                    <Switch
                      checked={editingPricing?.promo_active === true}
                      onCheckedChange={(checked) =>
                        setEditingPackage({
                          ...editingPackage,
                          promo_active: checked,
                          promo_price_per_month: checked
                            ? editingPricing?.promo_price_per_month ?? Math.max(0, Math.round((editingPricing?.base_price_per_month || 0) * (2 / 3)))
                            : null,
                        })
                      }
                    />
                  </div>

                  {editingPricing?.promo_active ? (
                    <>
                      <div className="space-y-2">
                        <Label>Harga Promo/Bulan</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                          <Input
                            type="number"
                            value={editingPricing.promo_price_per_month || 0}
                            onChange={(e) =>
                              setEditingPackage({
                                ...editingPackage,
                                promo_price_per_month: Number(e.target.value),
                                promo_active: true,
                              })
                            }
                            className="pl-10"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Harga promo harus lebih rendah dari harga normal paket.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Label Promo</Label>
                        <Input
                          value={editingPricing.promo_label || ""}
                          onChange={(e) =>
                            setEditingPackage({
                              ...editingPackage,
                              promo_label: e.target.value,
                              promo_active: true,
                            })
                          }
                          placeholder="Contoh: Promo Absensi 1-3 Bulan"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Harga Efektif Saat Promo</Label>
                        <div className="rounded-md border bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                          {formatCurrency(getEffectiveMonthlyPrice(editingPackage))}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Target Pelanggan</Label>
                <Select
                  value={editingPackage.applies_to || "ALL"}
                  onValueChange={(v) => setEditingPackage({ ...editingPackage, applies_to: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua</SelectItem>
                    <SelectItem value="INSTITUTION">Institusi Saja</SelectItem>
                    <SelectItem value="INDIVIDUAL">Perorangan Saja</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deskripsi</Label>
                <Textarea
                  value={editingPackage.description || ""}
                  onChange={(e) => setEditingPackage({ ...editingPackage, description: e.target.value })}
                  placeholder="Deskripsi singkat paket"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Aktif</Label>
                <Switch
                  checked={editingPackage.is_active !== false}
                  onCheckedChange={(checked) => setEditingPackage({ ...editingPackage, is_active: checked })}
                />
              </div>

              {/* Pricing Preview */}
              <Card className="bg-muted/50">
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Absensi</span>
                    <span>{formatCurrency((editingPricing?.attendance_base_price || 0) * (editingPackage.duration_months || 1))}</span>
                  </div>
                  {(editingPricing?.hr_addon_price || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tambahan HR</span>
                      <span>{formatCurrency((editingPricing?.hr_addon_price || 0) * (editingPackage.duration_months || 1))}</span>
                    </div>
                  )}
                  {(editingPricing?.payroll_addon_price || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tambahan Payroll</span>
                      <span>{formatCurrency((editingPricing?.payroll_addon_price || 0) * (editingPackage.duration_months || 1))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Harga normal dasar</span>
                    <span>{formatCurrency((editingPricing?.base_price_per_month || 0) * (editingPackage.duration_months || 1))}</span>
                  </div>
                  {editingPricing?.promo_active ? (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>{editingPricing.promo_label || "Promo aktif"}</span>
                      <span>
                        {formatCurrency(getEffectiveMonthlyPrice(editingPackage) * (editingPackage.duration_months || 1))}
                      </span>
                    </div>
                  ) : null}
                  {getEffectiveDiscountPercentage(editingPackage) > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Diskon {getEffectiveDiscountPercentage(editingPackage)}%</span>
                      <span>-{formatCurrency(
                        getEffectiveMonthlyPrice(editingPackage) *
                          (editingPackage.duration_months || 1) *
                          (getEffectiveDiscountPercentage(editingPackage) / 100)
                      )}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal/pegawai</span>
                    <span className="font-medium">{formatCurrency(calculateSubtotal(editingPackage))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-blue-600">
                    <span>PPN {globalVat}%</span>
                    <span>+{formatCurrency(calculateWithTax(calculateSubtotal(editingPackage)).ppnAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-indigo-600">
                    <span>PPH {globalPph}%</span>
                    <span>+{formatCurrency(calculateWithTax(calculateSubtotal(editingPackage)).pphAmount)}</span>
                  </div>
                  <div className="border-t pt-1 flex justify-between">
                    <span className="font-semibold">Total/pegawai</span>
                    <span className="text-lg font-bold">{formatCurrency(calculateWithTax(calculateSubtotal(editingPackage)).total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    untuk {editingPackage.duration_months || 1} bulan
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !editingPackage?.name}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
