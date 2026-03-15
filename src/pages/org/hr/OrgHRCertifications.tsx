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
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { fetchTenantHrCertificationRules, saveTenantHrCertificationRules, type HrCertificationRule } from "@/lib/hrTrainingSettings";
import { Award, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const INITIAL_FORM: HrCertificationRule = {
  id: "",
  name: "",
  targetRole: "Semua Role",
  validityMonths: 12,
  reminderDays: 30,
  mandatory: false,
  issuer: "Lembaga Internal",
};

const PAGE_SIZE = 10;

export default function OrgHRCertifications() {
  const [rows, setRows] = useState<HrCertificationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<HrCertificationRule>(INITIAL_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/certifications");
  const confirmDialog = useConfirmDialog();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setRows(await fetchTenantHrCertificationRules(tenantId));
    } catch (error) {
      const ref = reportError(error, "org.hr.certifications.fetch");
      toast.error(appendErrorReference("Gagal memuat sertifikasi", ref));
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
    mandatory: rows.filter((item) => item.mandatory).length,
    avgValidity: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.validityMonths, 0) / rows.length) : 0,
    nearestReminder: rows.length ? Math.min(...rows.map((item) => item.reminderDays)) : 0,
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

  const openDialog = (item?: HrCertificationRule) => {
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
      toast.error("Nama sertifikasi wajib diisi.");
      return;
    }
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextItem: HrCertificationRule = {
        ...formState,
        id: editingId || crypto.randomUUID(),
        name: formState.name.trim(),
        targetRole: formState.targetRole.trim() || "Semua Role",
        issuer: formState.issuer.trim() || "Lembaga Internal",
      };
      const nextRows = editingId ? rows.map((item) => (item.id === editingId ? nextItem : item)) : [...rows, nextItem];
      await saveTenantHrCertificationRules(tenantId, nextRows);
      setRows(nextRows);
      setIsDialogOpen(false);
      toast.success(`Aturan sertifikasi berhasil ${editingId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "org.hr.certifications.save");
      toast.error(appendErrorReference("Gagal menyimpan sertifikasi", ref));
    }
  };

  const handleDelete = async (item: HrCertificationRule) => {
    const confirmed = await confirmDialog({
      title: "Hapus Sertifikasi",
      description: `Aturan sertifikasi "${item.name}" akan dihapus dari baseline tenant. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextRows = rows.filter((row) => row.id !== item.id);
      await saveTenantHrCertificationRules(tenantId, nextRows);
      setRows(nextRows);
      toast.success("Aturan sertifikasi berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "org.hr.certifications.delete", { certification_id: item.id });
      toast.error(appendErrorReference("Gagal menghapus sertifikasi", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pelatihan</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Sertifikasi</h1>
          <p className="text-sm text-muted-foreground">Tetapkan baseline sertifikasi tenant untuk peran yang butuh validitas, reminder, dan kepatuhan.</p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Rule" value={summary.total} />
          <StatCard title="Wajib" value={summary.mandatory} />
          <StatCard title="Rata Validitas" value={summary.avgValidity} suffix="bln" />
          <StatCard title="Reminder Terdekat" value={summary.nearestReminder} suffix="hari" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Aturan Sertifikasi Tenant</CardTitle>
                <CardDescription>Sertifikasi di sini menjadi baseline kebutuhan kompetensi formal tenant.</CardDescription>
              </div>
              {access.canConfigure ? (
                <Button size="sm" onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Sertifikasi
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada aturan sertifikasi yang disimpan.</div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sertifikasi</TableHead>
                    <TableHead>Role Target</TableHead>
                    <TableHead>Penerbit</TableHead>
                    <TableHead>Validitas</TableHead>
                    <TableHead>Reminder</TableHead>
                    <TableHead>Status</TableHead>
                    {access.canConfigure ? <TableHead className="w-28">Aksi</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((item) => (
                    <TableRow key={item.id} data-testid={`org-hr-certification-row-${item.id}`}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.targetRole}</TableCell>
                      <TableCell>{item.issuer}</TableCell>
                      <TableCell>{item.validityMonths} bulan</TableCell>
                      <TableCell>{item.reminderDays} hari</TableCell>
                      <TableCell><Badge variant={item.mandatory ? "default" : "secondary"}>{item.mandatory ? "Wajib" : "Opsional"}</Badge></TableCell>
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
                  itemLabel="rule sertifikasi"
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
              <DialogTitle>{editingId ? "Edit Sertifikasi" : "Tambah Sertifikasi"}</DialogTitle>
              <DialogDescription>Atur role target, masa berlaku, reminder, dan status wajib sertifikasi.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="cert-name">Nama Sertifikasi</Label>
                <Input id="cert-name" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-role">Role Target</Label>
                <Input id="cert-role" value={formState.targetRole} onChange={(event) => setFormState((prev) => ({ ...prev, targetRole: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-issuer">Penerbit</Label>
                <Input id="cert-issuer" value={formState.issuer} onChange={(event) => setFormState((prev) => ({ ...prev, issuer: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-validity">Validitas (bulan)</Label>
                <Input id="cert-validity" type="number" min={1} value={formState.validityMonths} onChange={(event) => setFormState((prev) => ({ ...prev, validityMonths: Number(event.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-reminder">Reminder (hari)</Label>
                <Input id="cert-reminder" type="number" min={1} value={formState.reminderDays} onChange={(event) => setFormState((prev) => ({ ...prev, reminderDays: Number(event.target.value) || 1 }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                <div>
                  <div className="text-sm font-medium">Wajib untuk role target</div>
                  <div className="text-xs text-muted-foreground">Gunakan untuk sertifikasi yang wajib dipenuhi tenant.</div>
                </div>
                <Switch checked={formState.mandatory} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, mandatory: checked }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()}>
                <Award className="mr-2 h-4 w-4" />
                Simpan Sertifikasi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value, suffix = "" }: { title: string; value: number; suffix?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{`${value}${suffix ? ` ${suffix}` : ""}`}</CardTitle>
      </CardHeader>
    </Card>
  );
}
