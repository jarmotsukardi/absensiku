import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { fetchTenantHrPerformancePeriods, saveTenantHrPerformancePeriods, type HrPerformancePeriod } from "@/lib/hrPerformanceSettings";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const INITIAL_FORM: HrPerformancePeriod = {
  id: "",
  name: "",
  cycle: "quarterly",
  startDate: "",
  endDate: "",
  status: "draft",
};

const PAGE_SIZE = 10;

export default function OrgHRPerformancePeriods() {
  const [rows, setRows] = useState<HrPerformancePeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<HrPerformancePeriod>(INITIAL_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/performance-periods");
  const confirmDialog = useConfirmDialog();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setRows(await fetchTenantHrPerformancePeriods(tenantId));
    } catch (error) {
      const ref = reportError(error, "org.hr.performance_periods.fetch");
      toast.error(appendErrorReference("Gagal memuat periode penilaian", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => ({
    total: rows.length,
    active: rows.filter((item) => item.status === "active").length,
    draft: rows.filter((item) => item.status === "draft").length,
    closed: rows.filter((item) => item.status === "closed").length,
  }), [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return rows.slice(from, from + PAGE_SIZE);
  }, [rows, safePage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const openDialog = (item?: HrPerformancePeriod) => {
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
    if (!formState.name.trim() || !formState.startDate || !formState.endDate) {
      toast.error("Nama dan rentang tanggal wajib diisi.");
      return;
    }

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextItem: HrPerformancePeriod = {
        ...formState,
        id: editingId || crypto.randomUUID(),
        name: formState.name.trim(),
      };
      const nextRows = editingId
        ? rows.map((item) => (item.id === editingId ? nextItem : item))
        : [...rows, nextItem];
      await saveTenantHrPerformancePeriods(tenantId, nextRows);
      setRows(nextRows);
      setIsDialogOpen(false);
      toast.success(`Periode berhasil ${editingId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "org.hr.performance_periods.save");
      toast.error(appendErrorReference("Gagal menyimpan periode penilaian", ref));
    }
  };

  const handleDelete = async (item: HrPerformancePeriod) => {
    const confirmed = await confirmDialog({
      title: "Hapus Periode Penilaian",
      description: `Periode "${item.name}" akan dihapus dari tenant ini. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextRows = rows.filter((row) => row.id !== item.id);
      await saveTenantHrPerformancePeriods(tenantId, nextRows);
      setRows(nextRows);
      toast.success("Periode berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "org.hr.performance_periods.delete", { period_id: item.id });
      toast.error(appendErrorReference("Gagal menghapus periode penilaian", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kinerja</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Periode Penilaian</h1>
          <p className="text-sm text-muted-foreground">
            Atur siklus evaluasi agar pembukaan, penutupan, dan monitoring periode kinerja tetap rapi per tenant.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Periode" value={summary.total} />
          <StatCard title="Aktif" value={summary.active} />
          <StatCard title="Draf" value={summary.draft} />
          <StatCard title="Ditutup" value={summary.closed} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Daftar Periode</CardTitle>
                <CardDescription>Periode aktif akan dipakai sebagai referensi evaluasi tenant.</CardDescription>
              </div>
              {access.canConfigure ? (
                <Button size="sm" onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Periode
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada periode penilaian yang disimpan.</div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead>Siklus</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead>Selesai</TableHead>
                    <TableHead>Status</TableHead>
                    {access.canConfigure ? <TableHead className="w-28">Aksi</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((item) => (
                    <TableRow key={item.id} data-testid={`org-hr-performance-period-row-${item.id}`}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="capitalize">{formatCycle(item.cycle)}</TableCell>
                      <TableCell>{formatDate(item.startDate)}</TableCell>
                      <TableCell>{formatDate(item.endDate)}</TableCell>
                      <TableCell><Badge variant={item.status === "active" ? "default" : "secondary"}>{formatStatus(item.status)}</Badge></TableCell>
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
                  itemLabel="periode"
                  onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Periode Penilaian" : "Tambah Periode Penilaian"}</DialogTitle>
              <DialogDescription>Gunakan status aktif hanya untuk satu periode yang sedang berjalan.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="period-name">Nama Periode</Label>
                <Input id="period-name" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Siklus</Label>
                <Select value={formState.cycle} onValueChange={(value) => setFormState((prev) => ({ ...prev, cycle: value as HrPerformancePeriod["cycle"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Bulanan</SelectItem>
                    <SelectItem value="quarterly">Triwulanan</SelectItem>
                    <SelectItem value="semesterly">Semester</SelectItem>
                    <SelectItem value="yearly">Tahunan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as HrPerformancePeriod["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draf</SelectItem>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="closed">Ditutup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="period-start">Tanggal Mulai</Label>
                <Input id="period-start" type="date" value={formState.startDate} onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period-end">Tanggal Selesai</Label>
                <Input id="period-end" type="date" value={formState.endDate} onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()}>
                <CalendarRange className="mr-2 h-4 w-4" />
                Simpan Periode
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function formatDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("id-ID") : "-";
}

function formatCycle(value: HrPerformancePeriod["cycle"]) {
  const labels: Record<HrPerformancePeriod["cycle"], string> = {
    monthly: "Bulanan",
    quarterly: "Triwulanan",
    semesterly: "Semester",
    yearly: "Tahunan",
  };
  return labels[value];
}

function formatStatus(value: HrPerformancePeriod["status"]) {
  const labels: Record<HrPerformancePeriod["status"], string> = {
    draft: "Draf",
    active: "Aktif",
    closed: "Ditutup",
  };
  return labels[value];
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
