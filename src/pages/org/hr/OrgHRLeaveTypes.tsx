import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { ensureTenantHrLeaveTypesSeeded, HR_LEAVE_REQUEST_TYPE_LABELS, type HrLeaveRequestType } from "@/lib/hrLeaveTypes";

type LeaveType = {
  id?: string;
  leave_name: string;
  leave_code: string;
  description?: string;
  is_paid: boolean;
  requires_document: boolean;
  max_days_per_year: number;
  is_active: boolean;
  request_type: HrLeaveRequestType;
  approval_type_code: string;
  document_template_id?: string | null;
  document_template?: {
    template_name: string;
    template_type: string;
  } | null;
};

type DocumentTemplateOption = {
  id: string;
  template_name: string;
  template_type: string;
};

const initialLeaveTypeState: LeaveType = {
  leave_name: "",
  leave_code: "LEAVE",
  description: "",
  is_paid: true,
  requires_document: false,
  max_days_per_year: 12,
  is_active: true,
  request_type: "cuti_tahunan",
  approval_type_code: "LEAVE",
  document_template_id: null,
  document_template: null,
};

const PAGE_SIZE = 10;

export default function OrgHRLeaveTypes() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [formState, setFormState] = useState<LeaveType>(initialLeaveTypeState);
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplateOption[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/leave-types");
  const confirmDialog = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      await ensureTenantHrLeaveTypesSeeded(tenantId);

      const [{ data, error }, { data: templateRows, error: templateError }] = await Promise.all([
        supabase
          .from("leave_types")
          .select("*, document_template:document_template_id(template_name, template_type)")
          .eq("tenant_id", tenantId)
          .order("leave_name", { ascending: true }),
        supabase
          .from("hr_document_templates")
          .select("id, template_name, template_type")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("template_name", { ascending: true }),
      ]);

      if (error) throw error;
      if (templateError) throw templateError;
      setLeaveTypes((data || []) as LeaveType[]);
      setDocumentTemplates((templateRows || []) as DocumentTemplateOption[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.leave-types.fetch");
      toast.error(appendErrorReference("Gagal memuat jenis cuti", ref));
      setLeaveTypes([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleOpenDialog = (leaveType?: LeaveType) => {
    if (!access.canConfigure) {
      toast.error("Aksi pengaturan jenis cuti hanya tersedia untuk admin organisasi.");
      return;
    }
    if (leaveType) {
      setEditingLeaveId(leaveType.id || null);
      setFormState({
        leave_name: leaveType.leave_name,
        leave_code: leaveType.leave_code,
        description: leaveType.description || "",
        is_paid: leaveType.is_paid,
        requires_document: leaveType.requires_document,
        max_days_per_year: leaveType.max_days_per_year,
        is_active: leaveType.is_active,
        request_type: leaveType.request_type,
        approval_type_code: leaveType.approval_type_code || "LEAVE",
        document_template_id: leaveType.document_template_id || null,
        document_template: leaveType.document_template || null,
      });
    } else {
      setEditingLeaveId(null);
      setFormState(initialLeaveTypeState);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!access.canConfigure) {
      toast.error("Aksi simpan jenis cuti hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!formState.leave_name.trim()) {
      toast.error("Nama jenis cuti wajib diisi.");
      return;
    }

    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant tidak ditemukan.");

      const payload = {
        tenant_id: tenantId,
        leave_name: formState.leave_name.trim(),
        leave_code: formState.leave_code,
        description: formState.description?.trim() || null,
        is_paid: formState.is_paid,
        requires_document: formState.requires_document,
        max_days_per_year: Number(formState.max_days_per_year),
        is_active: formState.is_active,
        request_type: formState.request_type,
        approval_type_code: formState.approval_type_code,
        document_template_id: formState.requires_document ? formState.document_template_id || null : null,
      };

      let error: Error | null = null;

      if (editingLeaveId) {
        const { error: updateError } = await supabase
          .from("leave_types")
          .update(payload as never)
          .eq("id", editingLeaveId)
          .eq("tenant_id", tenantId);
        error = updateError || null;
      } else {
        const { error: insertError } = await supabase.from("leave_types").insert(payload as never);
        error = insertError || null;
      }

      if (error) throw error;

      toast.success(`Jenis cuti berhasil ${editingLeaveId ? "diperbarui" : "ditambahkan"}.`);
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.leave-types.save");
      toast.error(appendErrorReference(`Gagal menyimpan jenis cuti`, ref));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (leaveId: string, leaveName: string) => {
    if (!access.canConfigure) {
      toast.error("Aksi hapus jenis cuti hanya tersedia untuk admin organisasi.");
      return;
    }
    const confirmed = await confirmDialog({
      title: "Hapus Jenis Cuti",
      description: `Jenis cuti "${leaveName}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("leave_types")
        .delete()
        .eq("id", leaveId)
        .eq("tenant_id", await resolveOrgTenantId());
      if (error) throw error;

      toast.success(`Jenis cuti "${leaveName}" berhasil dihapus.`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.leave-types.delete");
      toast.error(appendErrorReference("Gagal menghapus jenis cuti", ref));
    }
  };

  const stats = useMemo(() => {
    const active = leaveTypes.filter((l) => l.is_active).length;
    const paidLeave = leaveTypes.filter((l) => l.is_paid).length;
    const unpaidLeave = leaveTypes.filter((l) => !l.is_paid).length;
    const requiresDoc = leaveTypes.filter((l) => l.requires_document).length;

    return { active, paidLeave, unpaidLeave, requiresDoc, total: leaveTypes.length };
  }, [leaveTypes]);
  const totalPages = Math.max(1, Math.ceil(leaveTypes.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedLeaveTypes = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return leaveTypes.slice(from, from + PAGE_SIZE);
  }, [leaveTypes, safePage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kebijakan HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Jenis Cuti</h1>
          <p className="text-sm text-muted-foreground">
            Kelola jenis cuti dan izin untuk standar operasional HR.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard
            title="Total Jenis Cuti"
            value={stats.total}
            icon={Calendar}
            description="Semua jenis cuti"
            color="blue"
          />
          <StatCard
            title="Cuti Aktif"
            value={stats.active}
            icon={Calendar}
            description="Jenis cuti aktif"
            color="green"
          />
          <StatCard
            title="Cuti Berbayar"
            value={stats.paidLeave}
            icon={Calendar}
            description="Cuti dengan gaji"
            color="emerald"
          />
          <StatCard
            title="Cuti Tanpa Gaji"
            value={stats.unpaidLeave}
            icon={Calendar}
            description="Cuti tanpa gaji"
            color="orange"
          />
          <StatCard
            title="Butuh Dokumen"
            value={stats.requiresDoc}
            icon={Calendar}
            description="Memerlukan dokumen"
            color="purple"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daftar Jenis Cuti</CardTitle>
                <CardDescription>Kategori cuti dan izin yang tersedia di organisasi.</CardDescription>
              </div>
              {access.canConfigure && (
                <Button onClick={() => handleOpenDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Jenis Cuti
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Memuat data...</div>
            ) : leaveTypes.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Belum ada jenis cuti. Klik "Tambah Jenis Cuti" untuk membuat.
              </div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Nama Cuti</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead className="text-center">Berbayar</TableHead>
                    <TableHead className="text-center">Referensi</TableHead>
                    <TableHead>Kategori Absensi</TableHead>
                    <TableHead>Templat Dokumen</TableHead>
                    <TableHead className="text-center">Max Hari/Tahun</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedLeaveTypes.map((leaveType, index) => (
                    <TableRow key={leaveType.id}>
                      <TableCell>{(safePage - 1) * PAGE_SIZE + index + 1}</TableCell>
                      <TableCell className="font-medium">{leaveType.leave_name}</TableCell>
                      <TableCell className="font-mono text-xs">{leaveType.leave_code}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={leaveType.is_paid ? "default" : "secondary"}>
                          {leaveType.is_paid ? "Ya" : "Tidak"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={leaveType.requires_document ? "default" : "outline"}>
                          {leaveType.requires_document ? "Ya" : "Tidak"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{HR_LEAVE_REQUEST_TYPE_LABELS[leaveType.request_type] || leaveType.request_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {leaveType.document_template?.template_name ? (
                          <span className="text-sm">{leaveType.document_template.template_name}</span>
                        ) : leaveType.requires_document ? (
                          <span className="text-xs text-amber-700">Belum dipilih</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Tidak perlu</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">{leaveType.max_days_per_year} hari</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={leaveType.is_active ? "default" : "secondary"}>
                          {leaveType.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {access.canConfigure && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(leaveType)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(leaveType.id!, leaveType.leave_name)}
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
                  totalItems={leaveTypes.length}
                  pageSize={PAGE_SIZE}
                  itemLabel="jenis cuti"
                  onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Dialog Tambah/Edit */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingLeaveId ? "Edit Jenis Cuti" : "Tambah Jenis Cuti"}
              </DialogTitle>
              <DialogDescription>
                Konfigurasi jenis cuti dan persyaratan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="leave_name">Nama Jenis Cuti</Label>
                <Input
                  id="leave_name"
                  value={formState.leave_name}
                  onChange={(e) => setFormState((prev) => ({ ...prev, leave_name: e.target.value }))}
                  placeholder="Contoh: Cuti Tahunan"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="leave_code">Kode</Label>
                <Input
                  id="leave_code"
                  value={formState.leave_code}
                  onChange={(e) => setFormState((prev) => ({ ...prev, leave_code: e.target.value.toUpperCase() }))}
                  placeholder="Contoh: ANNUAL"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>Kategori Absensi</Label>
                <Select
                  value={formState.request_type}
                  onValueChange={(value) =>
                    setFormState((prev) => ({
                      ...prev,
                      request_type: value as HrLeaveRequestType,
                    }))
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori absensi" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(HR_LEAVE_REQUEST_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Templat Dokumen Rujukan</Label>
                <Select
                  value={formState.document_template_id || "__none__"}
                  onValueChange={(value) =>
                    setFormState((prev) => ({
                      ...prev,
                      document_template_id: value === "__none__" ? null : value,
                    }))
                  }
                  disabled={isLoading || !formState.requires_document}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formState.requires_document ? "Pilih template dokumen" : "Aktifkan butuh dokumen terlebih dulu"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Tanpa template khusus</SelectItem>
                    {documentTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.template_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dipakai sebagai acuan format dan penomoran dokumen saat pegawai mengajukan cuti atau izin.
                </p>
              </div>
              <div>
                <Label htmlFor="description">Deskripsi</Label>
                <Textarea
                  id="description"
                  value={formState.description}
                  onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Deskripsi singkat jenis cuti"
                  disabled={isLoading}
                  rows={2}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_paid"
                    checked={formState.is_paid}
                    onChange={(e) => setFormState((prev) => ({ ...prev, is_paid: e.target.checked }))}
                    disabled={isLoading}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="is_paid">Cuti Berbayar</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requires_document"
                    checked={formState.requires_document}
                    onChange={(e) => setFormState((prev) => ({ ...prev, requires_document: e.target.checked }))}
                    disabled={isLoading}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="requires_document">Wajib Referensi Dokumen</Label>
                </div>
              </div>
              <div>
                <Label htmlFor="max_days">Max Hari per Tahun</Label>
                <Input
                  id="max_days"
                  type="number"
                  value={formState.max_days_per_year}
                  onChange={(e) => setFormState((prev) => ({ ...prev, max_days_per_year: Number(e.target.value) }))}
                  min="0"
                  max="365"
                  disabled={isLoading}
                />
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !access.canConfigure}>
                {isLoading ? "Menyimpan..." : editingLeaveId ? "Perbarui" : "Simpan"}
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
  description,
  color = "blue",
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description: string;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    orange: "text-orange-600",
    purple: "text-purple-600",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className={`h-4 w-4 ${colorClasses[color]}`} />
        </div>
      </CardContent>
    </Card>
  );
}
