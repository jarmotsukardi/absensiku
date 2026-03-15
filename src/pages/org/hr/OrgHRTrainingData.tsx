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
import { Textarea } from "@/components/ui/textarea";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { fetchTenantHrTrainingPrograms, saveTenantHrTrainingPrograms, type HrTrainingProgram } from "@/lib/hrTrainingSettings";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const INITIAL_FORM: HrTrainingProgram = {
  id: "",
  name: "",
  category: "Umum",
  provider: "Internal",
  durationHours: 8,
  participantTarget: 10,
  status: "draft",
  notes: "",
};

export default function OrgHRTrainingData() {
  const [rows, setRows] = useState<HrTrainingProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<HrTrainingProgram>(INITIAL_FORM);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/training-data");
  const confirmDialog = useConfirmDialog();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setRows(await fetchTenantHrTrainingPrograms(tenantId));
    } catch (error) {
      const ref = reportError(error, "org.hr.training_data.fetch");
      toast.error(appendErrorReference("Gagal memuat data pelatihan", ref));
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
    running: rows.filter((item) => item.status === "running").length,
    planned: rows.filter((item) => item.status === "planned").length,
    target: rows.reduce((sum, item) => sum + item.participantTarget, 0),
  }), [rows]);

  const openDialog = (item?: HrTrainingProgram) => {
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
      toast.error("Nama pelatihan wajib diisi.");
      return;
    }
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextItem: HrTrainingProgram = {
        ...formState,
        id: editingId || crypto.randomUUID(),
        name: formState.name.trim(),
        category: formState.category.trim() || "Umum",
        provider: formState.provider.trim() || "Internal",
        notes: formState.notes.trim(),
      };
      const nextRows = editingId ? rows.map((item) => (item.id === editingId ? nextItem : item)) : [...rows, nextItem];
      await saveTenantHrTrainingPrograms(tenantId, nextRows);
      setRows(nextRows);
      setIsDialogOpen(false);
      toast.success(`Program pelatihan berhasil ${editingId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "org.hr.training_data.save");
      toast.error(appendErrorReference("Gagal menyimpan data pelatihan", ref));
    }
  };

  const handleDelete = async (item: HrTrainingProgram) => {
    const confirmed = await confirmDialog({
      title: "Hapus Program Pelatihan",
      description: `Program "${item.name}" akan dihapus dari baseline pelatihan tenant. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextRows = rows.filter((row) => row.id !== item.id);
      await saveTenantHrTrainingPrograms(tenantId, nextRows);
      setRows(nextRows);
      toast.success("Program pelatihan berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "org.hr.training_data.delete", { training_id: item.id });
      toast.error(appendErrorReference("Gagal menghapus data pelatihan", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pelatihan</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Data Pelatihan</h1>
          <p className="text-sm text-muted-foreground">Kelola baseline program pelatihan tenant untuk pengembangan kompetensi pegawai.</p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Program" value={summary.total} />
          <StatCard title="Sedang Jalan" value={summary.running} />
          <StatCard title="Terjadwal" value={summary.planned} />
          <StatCard title="Target Peserta" value={summary.target} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Program Pelatihan</CardTitle>
                <CardDescription>Program yang disimpan di sini menjadi baseline tenant untuk roadmap pembelajaran.</CardDescription>
              </div>
              {access.canConfigure ? (
                <Button size="sm" onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Program
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada program pelatihan yang disimpan.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Program</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Penyedia</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    {access.canConfigure ? <TableHead className="w-28">Aksi</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => (
                    <TableRow key={item.id} data-testid={`org-hr-training-row-${item.id}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.notes || "Tanpa catatan"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.provider}</TableCell>
                      <TableCell>{item.durationHours} jam</TableCell>
                      <TableCell>{item.participantTarget} orang</TableCell>
                      <TableCell><Badge variant={item.status === "running" ? "default" : "secondary"}>{formatTrainingStatus(item.status)}</Badge></TableCell>
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
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Program Pelatihan" : "Tambah Program Pelatihan"}</DialogTitle>
              <DialogDescription>Atur kategori, penyedia, target peserta, dan status program tenant.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="training-name">Nama Program</Label>
                <Input id="training-name" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="training-category">Kategori</Label>
                <Input id="training-category" value={formState.category} onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="training-provider">Penyedia</Label>
                <Input id="training-provider" value={formState.provider} onChange={(event) => setFormState((prev) => ({ ...prev, provider: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="training-duration">Durasi (jam)</Label>
                <Input id="training-duration" type="number" min={1} value={formState.durationHours} onChange={(event) => setFormState((prev) => ({ ...prev, durationHours: Number(event.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="training-target">Target Peserta</Label>
                <Input id="training-target" type="number" min={1} value={formState.participantTarget} onChange={(event) => setFormState((prev) => ({ ...prev, participantTarget: Number(event.target.value) || 1 }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Status</Label>
                <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as HrTrainingProgram["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draf</SelectItem>
                    <SelectItem value="planned">Terjadwal</SelectItem>
                    <SelectItem value="running">Berjalan</SelectItem>
                    <SelectItem value="completed">Selesai</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="training-notes">Catatan</Label>
                <Textarea id="training-notes" rows={3} value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()}>
                <BookOpen className="mr-2 h-4 w-4" />
                Simpan Program
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function formatTrainingStatus(value: HrTrainingProgram["status"]) {
  const labels: Record<HrTrainingProgram["status"], string> = {
    draft: "Draf",
    planned: "Terjadwal",
    running: "Berjalan",
    completed: "Selesai",
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
