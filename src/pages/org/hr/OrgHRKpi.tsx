import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { fetchTenantHrPerformanceKpis, saveTenantHrPerformanceKpis, type HrKpiItem } from "@/lib/hrPerformanceSettings";
import { Gauge, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type KpiFormState = HrKpiItem;

const INITIAL_FORM: KpiFormState = {
  id: "",
  name: "",
  dimension: "Operasional",
  weight: 20,
  targetValue: "",
  ownerRole: "Admin Instansi",
  isActive: true,
  notes: "",
};

const PAGE_SIZE = 10;

export default function OrgHRKpi() {
  const [rows, setRows] = useState<HrKpiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<KpiFormState>(INITIAL_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/kpi");
  const confirmDialog = useConfirmDialog();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setRows(await fetchTenantHrPerformanceKpis(tenantId));
    } catch (error) {
      const ref = reportError(error, "org.hr.kpi.fetch");
      toast.error(appendErrorReference("Gagal memuat KPI", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const active = rows.filter((item) => item.isActive).length;
    const totalWeight = rows.filter((item) => item.isActive).reduce((sum, item) => sum + item.weight, 0);
    const dimensions = new Set(rows.map((item) => item.dimension)).size;
    return { total: rows.length, active, totalWeight, dimensions };
  }, [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return rows.slice(from, from + PAGE_SIZE);
  }, [rows, safePage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const openDialog = (item?: HrKpiItem) => {
    if (item) {
      setEditingId(item.id);
      setFormState(item);
    } else {
      setEditingId(null);
      setFormState(INITIAL_FORM);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formState.name.trim()) {
      toast.error("Nama KPI wajib diisi.");
      return;
    }

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const nextItem: HrKpiItem = {
        ...formState,
        id: editingId || crypto.randomUUID(),
        name: formState.name.trim(),
        dimension: formState.dimension.trim() || "Operasional",
        targetValue: formState.targetValue.trim() || "-",
        ownerRole: formState.ownerRole.trim() || "Admin Instansi",
        notes: formState.notes.trim(),
      };

      const nextRows = editingId
        ? rows.map((item) => (item.id === editingId ? nextItem : item))
        : [...rows, nextItem];

      await saveTenantHrPerformanceKpis(tenantId, nextRows);
      setRows(nextRows);
      setIsDialogOpen(false);
      toast.success(`KPI berhasil ${editingId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "org.hr.kpi.save");
      toast.error(appendErrorReference("Gagal menyimpan KPI", ref));
    }
  };

  const handleDelete = async (item: HrKpiItem) => {
    const confirmed = await confirmDialog({
      title: "Hapus KPI",
      description: `KPI "${item.name}" akan dihapus dari baseline evaluasi tenant. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextRows = rows.filter((row) => row.id !== item.id);
      await saveTenantHrPerformanceKpis(tenantId, nextRows);
      setRows(nextRows);
      toast.success("KPI berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "org.hr.kpi.delete", { kpi_id: item.id });
      toast.error(appendErrorReference("Gagal menghapus KPI", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kinerja</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">KPI</h1>
          <p className="text-sm text-muted-foreground">
            Tetapkan baseline KPI tenant agar evaluasi kinerja punya bobot, target, dan penanggung jawab yang jelas.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total KPI" value={summary.total} description="Semua KPI tenant" />
          <StatCard title="KPI Aktif" value={summary.active} description="Dipakai pada evaluasi aktif" />
          <StatCard title="Total Bobot" value={summary.totalWeight} description="Idealnya mendekati 100" />
          <StatCard title="Dimensi" value={summary.dimensions} description="Sebaran domain KPI" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Daftar KPI Tenant</CardTitle>
                <CardDescription>Gunakan daftar ini sebagai baseline sebelum periode penilaian dibuka.</CardDescription>
              </div>
              {access.canConfigure ? (
                <Button size="sm" onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah KPI
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada baseline KPI yang disimpan.</div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead>Dimensi</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Bobot</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    {access.canConfigure ? <TableHead className="w-28">Aksi</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((item) => (
                    <TableRow key={item.id} data-testid={`org-hr-kpi-row-${item.id}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.notes || "Tanpa catatan"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{item.dimension}</TableCell>
                      <TableCell>{item.targetValue}</TableCell>
                      <TableCell>{item.weight}%</TableCell>
                      <TableCell>{item.ownerRole}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Aktif" : "Nonaktif"}</Badge>
                      </TableCell>
                      {access.canConfigure ? (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openDialog(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => void handleDelete(item)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
                <TablePaginationFooter
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalItems={rows.length}
                  pageSize={PAGE_SIZE}
                  itemLabel="KPI"
                  onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit KPI" : "Tambah KPI"}</DialogTitle>
              <DialogDescription>Pastikan bobot KPI selaras dengan struktur evaluasi tenant.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="kpi-name">Nama KPI</Label>
                <Input id="kpi-name" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kpi-dimension">Dimensi</Label>
                <Input id="kpi-dimension" value={formState.dimension} onChange={(event) => setFormState((prev) => ({ ...prev, dimension: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kpi-owner">Owner</Label>
                <Input id="kpi-owner" value={formState.ownerRole} onChange={(event) => setFormState((prev) => ({ ...prev, ownerRole: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kpi-target">Target</Label>
                <Input id="kpi-target" value={formState.targetValue} onChange={(event) => setFormState((prev) => ({ ...prev, targetValue: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kpi-weight">Bobot (%)</Label>
                <Input id="kpi-weight" type="number" min={0} max={100} value={formState.weight} onChange={(event) => setFormState((prev) => ({ ...prev, weight: Number(event.target.value) || 0 }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="kpi-notes">Catatan</Label>
                <Textarea id="kpi-notes" rows={3} value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                <div>
                  <div className="text-sm font-medium">Aktifkan KPI</div>
                  <div className="text-xs text-muted-foreground">KPI aktif dipakai sebagai baseline evaluasi tenant.</div>
                </div>
                <Switch checked={formState.isActive} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, isActive: checked }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()}>
                <Gauge className="mr-2 h-4 w-4" />
                Simpan KPI
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value, description }: { title: string; value: number; description: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
