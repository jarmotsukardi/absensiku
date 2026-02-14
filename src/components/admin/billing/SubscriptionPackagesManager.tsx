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

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

export function SubscriptionPackagesManager() {
  const { packages, isLoading, createPackage, updatePackage, deletePackage } = useSubscriptionPackages();
  const { settings, isLoading: isLoadingSettings, getSetting } = useBillingSettings();
  const [showDialog, setShowDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Partial<SubscriptionPackage> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Global billing settings
  const globalPrice = getSetting("price_per_employee")?.amount || 15000;
  const globalVat = getSetting("vat_percentage")?.value || 11;

  const getEmptyPackage = (): Partial<SubscriptionPackage> => ({
    name: "",
    duration_months: 1,
    base_price_per_month: globalPrice,
    discount_percentage: 0,
    is_active: true,
    applies_to: "ALL",
    description: "",
  });

  const handleCreate = () => {
    setEditingPackage(getEmptyPackage());
    setShowDialog(true);
  };

  const handleEdit = (pkg: SubscriptionPackage) => {
    setEditingPackage({ ...pkg });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!editingPackage?.name) return;

    setIsSaving(true);
    try {
      if (editingPackage.id) {
        await updatePackage(editingPackage.id, editingPackage);
      } else {
        await createPackage(editingPackage);
      }
      setShowDialog(false);
      setEditingPackage(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Hapus paket ini?")) {
      await deletePackage(id);
    }
  };

  // Sync all packages to use the current global price
  const handleSyncAllPrices = async () => {
    const outOfSync = packages.filter(p => p.base_price_per_month !== globalPrice);
    if (outOfSync.length === 0) {
      toast.info("Semua paket sudah sinkron dengan harga dasar global");
      return;
    }

    if (!confirm(`${outOfSync.length} paket memiliki harga berbeda dari pengaturan global (${formatCurrency(globalPrice)}/bulan). Sinkronkan semua?`)) {
      return;
    }

    setIsSyncing(true);
    try {
      await Promise.all(
        outOfSync.map(pkg => updatePackage(pkg.id, { base_price_per_month: globalPrice }))
      );
      toast.success(`${outOfSync.length} paket berhasil disinkronkan`);
    } catch {
      toast.error("Gagal menyinkronkan paket");
    } finally {
      setIsSyncing(false);
    }
  };

  const calculateSubtotal = (pkg: Partial<SubscriptionPackage>) => {
    const base = (pkg.base_price_per_month || 0) * (pkg.duration_months || 1);
    const discount = base * ((pkg.discount_percentage || 0) / 100);
    return base - discount;
  };

  const calculateWithVat = (subtotal: number) => {
    const vatAmount = subtotal * (globalVat / 100);
    return { vatAmount, total: subtotal + vatAmount };
  };

  // Check if any package is out of sync
  const outOfSyncCount = packages.filter(p => p.base_price_per_month !== globalPrice).length;

  if (isLoading || isLoadingSettings) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
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
                <p className="text-xs text-muted-foreground">Harga Dasar Global</p>
                <p className="text-lg font-bold">{formatCurrency(globalPrice)}<span className="text-xs font-normal text-muted-foreground">/pegawai/bulan</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PPN</p>
                <p className="text-lg font-bold">{globalVat}%</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Dari tab "Pengaturan Billing"
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sync Warning */}
      {outOfSyncCount > 0 && (
        <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100">
          <AlertDescription className="flex items-center justify-between">
            <span>⚠️ {outOfSyncCount} paket memiliki harga dasar berbeda dari pengaturan global ({formatCurrency(globalPrice)}/bulan)</span>
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
              <TableHead>Durasi</TableHead>
              <TableHead>Harga/Bulan</TableHead>
              <TableHead>Diskon</TableHead>
              <TableHead>Subtotal/Pegawai</TableHead>
              <TableHead>+ PPN ({globalVat}%)</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Belum ada paket langganan
                </TableCell>
              </TableRow>
            ) : (
              packages.map((pkg) => {
                const subtotal = calculateSubtotal(pkg);
                const { total } = calculateWithVat(subtotal);
                const isOutOfSync = pkg.base_price_per_month !== globalPrice;

                return (
                  <TableRow key={pkg.id} className={isOutOfSync ? "bg-yellow-50/50 dark:bg-yellow-950/20" : ""}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    <TableCell>{pkg.duration_months} Bulan</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {formatCurrency(pkg.base_price_per_month)}
                        {isOutOfSync && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-yellow-500 text-yellow-700">
                            ≠ global
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {pkg.discount_percentage > 0 ? (
                        <Badge variant="secondary">{pkg.discount_percentage}%</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(subtotal)}
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
                  <Label>Harga per Pegawai/Bulan</Label>
                  {editingPackage.base_price_per_month !== globalPrice && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setEditingPackage({ ...editingPackage, base_price_per_month: globalPrice })}
                    >
                      Gunakan harga global ({formatCurrency(globalPrice)})
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                  <Input
                    type="number"
                    value={editingPackage.base_price_per_month || 0}
                    onChange={(e) => setEditingPackage({ ...editingPackage, base_price_per_month: Number(e.target.value) })}
                    className="pl-10"
                  />
                </div>
              </div>

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
                    <span className="text-muted-foreground">Harga dasar</span>
                    <span>{formatCurrency((editingPackage.base_price_per_month || 0) * (editingPackage.duration_months || 1))}</span>
                  </div>
                  {(editingPackage.discount_percentage || 0) > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Diskon {editingPackage.discount_percentage}%</span>
                      <span>-{formatCurrency(
                        (editingPackage.base_price_per_month || 0) * (editingPackage.duration_months || 1) * ((editingPackage.discount_percentage || 0) / 100)
                      )}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal/pegawai</span>
                    <span className="font-medium">{formatCurrency(calculateSubtotal(editingPackage))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-blue-600">
                    <span>PPN {globalVat}%</span>
                    <span>+{formatCurrency(calculateWithVat(calculateSubtotal(editingPackage)).vatAmount)}</span>
                  </div>
                  <div className="border-t pt-1 flex justify-between">
                    <span className="font-semibold">Total/pegawai</span>
                    <span className="text-lg font-bold">{formatCurrency(calculateWithVat(calculateSubtotal(editingPackage)).total)}</span>
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
