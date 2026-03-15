import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { fetchTenantHrPerformanceForms, saveTenantHrPerformanceForms, type HrPerformanceForm } from "@/lib/hrPerformanceSettings";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const INITIAL_FORM: HrPerformanceForm = {
  id: "",
  name: "",
  targetLevel: "Semua Level",
  questionCount: 5,
  scoringScale: "1-5",
  requireComment: false,
  isActive: true,
};

const PAGE_SIZE = 10;

export default function OrgHRPerformanceForms() {
  const [rows, setRows] = useState<HrPerformanceForm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<HrPerformanceForm>(INITIAL_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/performance-forms");
  const confirmDialog = useConfirmDialog();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setRows(await fetchTenantHrPerformanceForms(tenantId));
    } catch (error) {
      const ref = reportError(error, "org.hr.performance_forms.fetch");
      toast.error(appendErrorReference("Gagal memuat form penilaian", ref));
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
    active: rows.filter((item) => item.isActive).length,
    withComment: rows.filter((item) => item.requireComment).length,
    questions: rows.reduce((sum, item) => sum + item.questionCount, 0),
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

  const openDialog = (item?: HrPerformanceForm) => {
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
      toast.error("Nama form wajib diisi.");
      return;
    }

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextItem: HrPerformanceForm = {
        ...formState,
        id: editingId || crypto.randomUUID(),
        name: formState.name.trim(),
        targetLevel: formState.targetLevel.trim() || "Semua Level",
      };
      const nextRows = editingId
        ? rows.map((item) => (item.id === editingId ? nextItem : item))
        : [...rows, nextItem];
      await saveTenantHrPerformanceForms(tenantId, nextRows);
      setRows(nextRows);
      setIsDialogOpen(false);
      toast.success(`Form penilaian berhasil ${editingId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "org.hr.performance_forms.save");
      toast.error(appendErrorReference("Gagal menyimpan form penilaian", ref));
    }
  };

  const handleDelete = async (item: HrPerformanceForm) => {
    const confirmed = await confirmDialog({
      title: "Hapus Form Penilaian",
      description: `Form "${item.name}" akan dihapus dari baseline penilaian tenant. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextRows = rows.filter((row) => row.id !== item.id);
      await saveTenantHrPerformanceForms(tenantId, nextRows);
      setRows(nextRows);
      toast.success("Form penilaian berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "org.hr.performance_forms.delete", { form_id: item.id });
      toast.error(appendErrorReference("Gagal menghapus form penilaian", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kinerja</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Form Penilaian</h1>
          <p className="text-sm text-muted-foreground">
            Simpan template form penilaian sebagai baseline tenant agar evaluasi berjalan konsisten lintas unit.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Form" value={summary.total} />
          <StatCard title="Form Aktif" value={summary.active} />
          <StatCard title="Wajib Komentar" value={summary.withComment} />
          <StatCard title="Total Pertanyaan" value={summary.questions} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Templat Form Penilaian</CardTitle>
                <CardDescription>Form aktif dipakai sebagai baseline saat periode evaluasi dibuka.</CardDescription>
              </div>
              {access.canConfigure ? (
                <Button size="sm" onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Form
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada form penilaian yang disimpan.</div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form</TableHead>
                    <TableHead>Target Level</TableHead>
                    <TableHead>Jumlah Pertanyaan</TableHead>
                    <TableHead>Skala</TableHead>
                    <TableHead>Komentar</TableHead>
                    <TableHead>Status</TableHead>
                    {access.canConfigure ? <TableHead className="w-28">Aksi</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((item) => (
                    <TableRow key={item.id} data-testid={`org-hr-performance-form-row-${item.id}`}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.targetLevel}</TableCell>
                      <TableCell>{item.questionCount}</TableCell>
                      <TableCell>{item.scoringScale}</TableCell>
                      <TableCell>{item.requireComment ? "Wajib" : "Opsional"}</TableCell>
                      <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Aktif" : "Nonaktif"}</Badge></TableCell>
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
                  itemLabel="form"
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
              <DialogTitle>{editingId ? "Edit Form Penilaian" : "Tambah Form Penilaian"}</DialogTitle>
              <DialogDescription>Atur level target, skala nilai, dan kebutuhan komentar evaluator.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="form-name">Nama Form</Label>
                <Input id="form-name" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-level">Target Level</Label>
                <Input id="target-level" value={formState.targetLevel} onChange={(event) => setFormState((prev) => ({ ...prev, targetLevel: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="question-count">Jumlah Pertanyaan</Label>
                <Input id="question-count" type="number" min={1} value={formState.questionCount} onChange={(event) => setFormState((prev) => ({ ...prev, questionCount: Number(event.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label>Skala Penilaian</Label>
                <Select value={formState.scoringScale} onValueChange={(value) => setFormState((prev) => ({ ...prev, scoringScale: value as HrPerformanceForm["scoringScale"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-4">1-4</SelectItem>
                    <SelectItem value="1-5">1-5</SelectItem>
                    <SelectItem value="1-10">1-10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Wajib komentar</div>
                  <div className="text-xs text-muted-foreground">Pakai untuk evaluasi yang butuh alasan tertulis.</div>
                </div>
                <Switch checked={formState.requireComment} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, requireComment: checked }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                <div>
                  <div className="text-sm font-medium">Aktifkan form</div>
                  <div className="text-xs text-muted-foreground">Form aktif akan muncul dalam baseline tenant.</div>
                </div>
                <Switch checked={formState.isActive} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, isActive: checked }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Simpan Form
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
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
