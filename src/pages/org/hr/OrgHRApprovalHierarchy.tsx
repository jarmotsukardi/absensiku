import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Plus, Pencil, Trash2, Users, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { getApprovalRoleLabel, getApprovalTypeLabel } from "@/lib/hrApprovalWorkflow";

type ApprovalLevel = {
  id?: string;
  level_order: number;
  approver_role: string;
  sla_hours: number;
  notes?: string;
};

type ApprovalType = {
  id?: string;
  type_name: string;
  type_code: string;
  is_active: boolean;
  levels: ApprovalLevel[];
};

const APPROVAL_TYPES = [
  { code: "LEAVE", name: "Cuti dan Izin" },
  { code: "WFH", name: "Kerja dari Rumah" },
  { code: "OVERTIME", name: "Lembur" },
  { code: "MUTATION", name: "Mutasi" },
  { code: "OTHER", name: "Lainnya" },
];

const ROLE_OPTIONS = [
  { value: "atasan_langsung", label: "Atasan Langsung" },
  { value: "kepala_bidang", label: "Kepala Bidang" },
  { value: "kepala_dinas", label: "Kepala Dinas" },
  { value: "hr_admin", label: "Admin SDM" },
  { value: "admin_instansi", label: "Admin Instansi" },
];

const initialLevelState: ApprovalLevel = {
  level_order: 1,
  approver_role: "atasan_langsung",
  sla_hours: 24,
  notes: "",
};

const initialTypeState: ApprovalType = {
  type_name: "",
  type_code: "LEAVE",
  is_active: true,
  levels: [{ ...initialLevelState }],
};

const PAGE_SIZE = 8;

export default function OrgHRApprovalHierarchy() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [approvalTypes, setApprovalTypes] = useState<ApprovalType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ApprovalType>(initialTypeState);
  const [selectedType, setSelectedType] = useState<ApprovalType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/approval-hierarchy");
  const confirmDialog = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = await resolveOrgTenantId();
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setTenantId(resolvedTenantId);

      const { data, error } = await supabase
        .from("hr_approval_types")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("type_name", { ascending: true });

      if (error) throw error;

      const types = (data || []).map((t) => ({
        ...t,
        levels: t.levels || [],
      })) as ApprovalType[];

      setApprovalTypes(types);
    } catch (error) {
      const ref = reportError(error, "org.hr.approval-hierarchy.fetch");
      toast.error(appendErrorReference("Gagal memuat hierarki approval", ref));
      setApprovalTypes([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleOpenDialog = (type?: ApprovalType) => {
    if (!access.canConfigure) {
      toast.error("Aksi pengaturan approval hanya tersedia untuk admin organisasi.");
      return;
    }
    if (type) {
      setEditingTypeId(type.id || null);
      setFormState({
        type_name: type.type_name,
        type_code: type.type_code,
        is_active: type.is_active,
        levels: type.levels.length > 0 ? type.levels : [{ ...initialLevelState }],
      });
    } else {
      setEditingTypeId(null);
      setFormState({ ...initialTypeState, levels: [{ ...initialLevelState }] });
    }
    setIsDialogOpen(true);
  };

  const handleAddLevel = () => {
    if (!access.canConfigure) {
      toast.error("Aksi tambah level hanya tersedia untuk admin organisasi.");
      return;
    }
    const nextOrder = formState.levels.length + 1;
    setFormState((prev) => ({
      ...prev,
      levels: [...prev.levels, { ...initialLevelState, level_order: nextOrder }],
    }));
  };

  const handleUpdateLevel = (index: number, field: keyof ApprovalLevel, value: string | number) => {
    if (!access.canConfigure) {
      return;
    }
    setFormState((prev) => ({
      ...prev,
      levels: prev.levels.map((level, i) => (i === index ? { ...level, [field]: value } : level)),
    }));
  };

  const handleRemoveLevel = (index: number) => {
    if (!access.canConfigure) {
      toast.error("Aksi hapus level hanya tersedia untuk admin organisasi.");
      return;
    }
    if (formState.levels.length <= 1) {
      toast.error("Minimal harus ada 1 level approval.");
      return;
    }
    setFormState((prev) => ({
      ...prev,
      levels: prev.levels.filter((_, i) => i !== index).map((level, i) => ({ ...level, level_order: i + 1 })),
    }));
  };

  const handleSave = async () => {
    if (!access.canConfigure) {
      toast.error("Aksi simpan approval hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!formState.type_name.trim()) {
      toast.error("Nama jenis approval wajib diisi.");
      return;
    }
    if (formState.levels.length === 0) {
      toast.error("Minimal harus ada 1 level approval.");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        tenant_id: tenantId,
        type_name: formState.type_name.trim(),
        type_code: formState.type_code,
        is_active: formState.is_active,
        levels: formState.levels.map((l) => ({
          level_order: l.level_order,
          approver_role: l.approver_role,
          sla_hours: Number(l.sla_hours),
          notes: l.notes?.trim() || null,
        })),
      };

      let error: Error | null = null;

      if (editingTypeId) {
        const { error: updateError } = await supabase
          .from("hr_approval_types")
          .update({
            type_name: payload.type_name,
            type_code: payload.type_code,
            is_active: payload.is_active,
            levels: payload.levels,
          })
          .eq("id", editingTypeId)
          .eq("tenant_id", tenantId);
        error = updateError || null;
      } else {
        const { error: insertError } = await supabase.from("hr_approval_types").insert(payload);
        error = insertError || null;
      }

      if (error) throw error;

      toast.success(`Hierarki approval berhasil ${editingTypeId ? "diperbarui" : "ditambahkan"}.`);
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.approval-hierarchy.save");
      toast.error(appendErrorReference(`Gagal menyimpan hierarki approval`, ref));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (typeId: string, typeName: string) => {
    if (!access.canConfigure) {
      toast.error("Aksi hapus approval hanya tersedia untuk admin organisasi.");
      return;
    }
    const confirmed = await confirmDialog({
      title: "Hapus Hierarki Persetujuan",
      description: `Hierarki approval "${typeName}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("hr_approval_types")
        .delete()
        .eq("id", typeId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      toast.success(`Hierarki approval "${typeName}" berhasil dihapus.`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.approval-hierarchy.delete");
      toast.error(appendErrorReference("Gagal menghapus hierarki approval", ref));
    }
  };

  const handleViewDetail = (type: ApprovalType) => {
    setSelectedType(type);
  };

  const typeStats = useMemo(() => {
    const active = approvalTypes.filter((t) => t.is_active).length;
    const totalLevels = approvalTypes.reduce((sum, t) => sum + t.levels.length, 0);
    const avgLevels = approvalTypes.length > 0 ? (totalLevels / approvalTypes.length).toFixed(1) : "0";
    return { active, totalTypes: approvalTypes.length, avgLevels };
  }, [approvalTypes]);
  const totalPages = Math.max(1, Math.ceil(approvalTypes.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedApprovalTypes = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return approvalTypes.slice(from, from + PAGE_SIZE);
  }, [approvalTypes, safePage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Hubungan Kerja</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Hierarki Persetujuan</h1>
          <p className="text-sm text-muted-foreground">
            Kelola hierarki persetujuan untuk cuti, kerja dari rumah, lembur, dan proses HR lainnya.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Jenis Persetujuan Aktif"
            value={typeStats.active}
            icon={Users}
            description="Total jenis approval yang aktif"
          />
          <StatCard
            title="Total Jenis Persetujuan"
            value={typeStats.totalTypes}
            icon={AlertCircle}
            description="Semua jenis approval"
          />
          <StatCard
            title="Rata-rata Level"
            value={typeStats.avgLevels}
            icon={Clock}
            description="Rata-rata level per jenis"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daftar Hierarki Persetujuan</CardTitle>
                <CardDescription>Konfigurasi approval workflow per jenis permohonan.</CardDescription>
              </div>
              {access.canConfigure && (
                <Button onClick={() => handleOpenDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Jenis
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Memuat data...</div>
            ) : approvalTypes.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Belum ada hierarki approval. Klik "Tambah Jenis" untuk membuat.
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Jenis Persetujuan</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead className="text-center">Level</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedApprovalTypes.map((type, index) => (
                    <TableRow key={type.id}>
                      <TableCell>{(safePage - 1) * PAGE_SIZE + index + 1}</TableCell>
                      <TableCell className="font-medium">{type.type_name}</TableCell>
                      <TableCell className="font-mono text-xs">{type.type_code}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{type.levels.length} level</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={type.is_active ? "default" : "secondary"}>
                          {type.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetail(type)}
                          >
                            Lihat
                          </Button>
                          {access.canConfigure && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(type)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(type.id!, type.type_name)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safePage}
                totalPages={totalPages}
                totalItems={approvalTypes.length}
                pageSize={PAGE_SIZE}
                itemLabel="hierarki"
                onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              />
              </>
            )}
          </CardContent>
        </Card>

        {/* Dialog Tambah/Edit */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTypeId ? "Ubah Hierarki Persetujuan" : "Tambah Hierarki Persetujuan"}
              </DialogTitle>
              <DialogDescription>
                Konfigurasi jenis approval dan alur persetujuannya.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="type_name">Nama Jenis Persetujuan</Label>
                  <Input
                    id="type_name"
                    value={formState.type_name}
                    onChange={(e) => setFormState((prev) => ({ ...prev, type_name: e.target.value }))}
                    placeholder="Contoh: Cuti Tahunan"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="type_code">Kode Jenis</Label>
                  <Select
                    value={formState.type_code}
                    onValueChange={(value) => setFormState((prev) => ({ ...prev, type_code: value }))}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPROVAL_TYPES.map((type) => (
                        <SelectItem key={type.code} value={type.code}>
                          {type.code} - {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formState.is_active}
                    onChange={(e) => setFormState((prev) => ({ ...prev, is_active: e.target.checked }))}
                    disabled={isLoading}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="is_active">Aktif</Label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Level Persetujuan</Label>
                  {access.canConfigure && (
                    <Button variant="outline" size="sm" onClick={handleAddLevel} disabled={isLoading}>
                      <Plus className="h-4 w-4 mr-2" />
                      Tambah Level
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  {formState.levels.map((level, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                            {level.level_order}
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="grid gap-2 md:grid-cols-2">
                              <div>
                                <Label>Approver</Label>
                                <Select
                                  value={level.approver_role}
                                  onValueChange={(value) => handleUpdateLevel(index, "approver_role", value)}
                                  disabled={isLoading || !access.canConfigure}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ROLE_OPTIONS.map((role) => (
                                      <SelectItem key={role.value} value={role.value}>
                                        {role.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>SLA (jam)</Label>
                                <Input
                                  type="number"
                                  value={level.sla_hours}
                                  onChange={(e) => handleUpdateLevel(index, "sla_hours", Number(e.target.value))}
                                  disabled={isLoading || !access.canConfigure}
                                  min="1"
                                  max="168"
                                />
                              </div>
                            </div>
                            <div>
                              <Label>Catatan (opsional)</Label>
                              <Textarea
                                value={level.notes || ""}
                                onChange={(e) => handleUpdateLevel(index, "notes", e.target.value)}
                                disabled={isLoading || !access.canConfigure}
                                placeholder="Contoh: Jika tidak ada respon dalam SLA, eskalasi ke level berikutnya"
                                rows={2}
                              />
                            </div>
                          </div>
                          {access.canConfigure && formState.levels.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveLevel(index)}
                              disabled={isLoading}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !access.canConfigure}>
                {isLoading ? "Menyimpan..." : editingTypeId ? "Perbarui" : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Detail */}
        {selectedType && (
          <Dialog open={!!selectedType} onOpenChange={() => setSelectedType(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{selectedType.type_name}</DialogTitle>
                <DialogDescription>
                  Detail hierarki persetujuan untuk jenis: {getApprovalTypeLabel(selectedType.type_code)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={selectedType.is_active ? "default" : "secondary"}>
                    {selectedType.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {selectedType.levels.length} level approval
                  </span>
                </div>
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Alur Persetujuan</Label>
                  {selectedType.levels.map((level, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-semibold">
                            {level.level_order}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">
                              {getApprovalRoleLabel(level.approver_role)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              SLA: {level.sla_hours} jam
                            </p>
                            {level.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{level.notes}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
