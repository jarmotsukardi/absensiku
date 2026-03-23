import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
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
import { fetchTenantHrSkillMatrixItems, saveTenantHrSkillMatrixItems, type HrSkillMatrixItem } from "@/lib/hrTrainingSettings";
import { supabase } from "@/integrations/supabase/client";
import { BrainCircuit, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const INITIAL_FORM: HrSkillMatrixItem = {
  id: "",
  skillName: "",
  targetFunction: "Umum",
  requiredLevel: "Dasar",
  currentCoverage: 0,
  gapCount: 0,
  linkedTraining: "-",
};

const PAGE_SIZE = 10;

export default function OrgHRSkillMatrix() {
  const [rows, setRows] = useState<HrSkillMatrixItem[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<HrSkillMatrixItem>(INITIAL_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/skill-matrix");
  const confirmDialog = useConfirmDialog();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const [items, employeesRes] = await Promise.all([
        fetchTenantHrSkillMatrixItems(tenantId),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
      ]);
      if (employeesRes.error) throw employeesRes.error;
      setRows(items);
      setEmployeeCount(employeesRes.count || 0);
    } catch (error) {
      const ref = reportError(error, "org.hr.skill_matrix.fetch");
      toast.error(appendErrorReference("Gagal memuat matriks keahlian", ref));
      setRows([]);
      setEmployeeCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => ({
    total: rows.length,
    totalGap: rows.reduce((sum, item) => sum + item.gapCount, 0),
    avgCoverage: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.currentCoverage, 0) / rows.length) : 0,
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

  const openDialog = (item?: HrSkillMatrixItem) => {
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
    if (!formState.skillName.trim()) {
      toast.error("Nama skill wajib diisi.");
      return;
    }
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextItem: HrSkillMatrixItem = {
        ...formState,
        id: editingId || crypto.randomUUID(),
        skillName: formState.skillName.trim(),
        targetFunction: formState.targetFunction.trim() || "Umum",
        linkedTraining: formState.linkedTraining.trim() || "-",
      };
      const nextRows = editingId ? rows.map((item) => (item.id === editingId ? nextItem : item)) : [...rows, nextItem];
      await saveTenantHrSkillMatrixItems(tenantId, nextRows);
      setRows(nextRows);
      setIsDialogOpen(false);
      toast.success(`Matriks keahlian berhasil ${editingId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "org.hr.skill_matrix.save");
      toast.error(appendErrorReference("Gagal menyimpan matriks keahlian", ref));
    }
  };

  const handleDelete = async (item: HrSkillMatrixItem) => {
    const confirmed = await confirmDialog({
      title: "Hapus Skill",
      description: `Skill "${item.skillName}" akan dihapus dari matriks kompetensi tenant. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const nextRows = rows.filter((row) => row.id !== item.id);
      await saveTenantHrSkillMatrixItems(tenantId, nextRows);
      setRows(nextRows);
      toast.success("Matriks keahlian berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "org.hr.skill_matrix.delete", { skill_id: item.id });
      toast.error(appendErrorReference("Gagal menghapus matriks keahlian", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pelatihan</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Matriks Kompetensi</h1>
          <p className="text-sm text-muted-foreground">Petakan skill inti tenant untuk melihat coverage, gap, dan kaitan dengan program pelatihan.</p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Skill Dipetakan" value={summary.total} icon={BrainCircuit} />
          <StatCard title="Pegawai Aktif" value={employeeCount} icon={Users} />
          <StatCard title="Coverage Rata-rata" value={summary.avgCoverage} suffix="%" icon={BrainCircuit} />
          <StatCard title="Total Gap" value={summary.totalGap} icon={BrainCircuit} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Matriks Keahlian Tenant</CardTitle>
                <CardDescription>Gunakan data ini untuk menghubungkan gap kompetensi dengan program training.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/hr/training-data">Buka Data Pelatihan</OrgHRContextLink>
                </Button>
                {access.canConfigure ? (
                  <Button size="sm" onClick={() => openDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah Skill
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada matriks keahlian yang disimpan.</div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skill</TableHead>
                    <TableHead>Fungsi</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Gap</TableHead>
                    <TableHead>Pelatihan Terkait</TableHead>
                    {access.canConfigure ? <TableHead className="w-28">Aksi</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((item) => (
                    <TableRow key={item.id} data-testid={`org-hr-skill-row-${item.id}`}>
                      <TableCell className="font-medium">{item.skillName}</TableCell>
                      <TableCell>{item.targetFunction}</TableCell>
                      <TableCell>{item.requiredLevel}</TableCell>
                      <TableCell>{item.currentCoverage}%</TableCell>
                      <TableCell>{item.gapCount}</TableCell>
                      <TableCell>{item.linkedTraining}</TableCell>
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
                  itemLabel="skill"
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
              <DialogTitle>{editingId ? "Edit Skill" : "Tambah Skill"}</DialogTitle>
              <DialogDescription>Atur fungsi target, level minimal, coverage, dan program pelatihan terkait.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="skill-name">Nama Skill</Label>
                <Input id="skill-name" value={formState.skillName} onChange={(event) => setFormState((prev) => ({ ...prev, skillName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-function">Fungsi Target</Label>
                <Input id="skill-function" value={formState.targetFunction} onChange={(event) => setFormState((prev) => ({ ...prev, targetFunction: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Level Minimal</Label>
                <Select value={formState.requiredLevel} onValueChange={(value) => setFormState((prev) => ({ ...prev, requiredLevel: value as HrSkillMatrixItem["requiredLevel"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dasar">Dasar</SelectItem>
                    <SelectItem value="Menengah">Menengah</SelectItem>
                    <SelectItem value="Mahir">Mahir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-coverage">Coverage Saat Ini (%)</Label>
                <Input id="skill-coverage" type="number" min={0} max={100} value={formState.currentCoverage} onChange={(event) => setFormState((prev) => ({ ...prev, currentCoverage: Number(event.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-gap">Gap Pegawai</Label>
                <Input id="skill-gap" type="number" min={0} value={formState.gapCount} onChange={(event) => setFormState((prev) => ({ ...prev, gapCount: Number(event.target.value) || 0 }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="linked-training">Pelatihan Terkait</Label>
                <Input id="linked-training" value={formState.linkedTraining} onChange={(event) => setFormState((prev) => ({ ...prev, linkedTraining: event.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()}>
                <BrainCircuit className="mr-2 h-4 w-4" />
                Simpan Skill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  suffix = "",
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  suffix?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{`${value}${suffix}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <Icon className="h-4 w-4 text-cyan-600" />
      </CardContent>
    </Card>
  );
}
