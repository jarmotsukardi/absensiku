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
import { Plus, Pencil, Trash2, Calendar, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type LeaveQuota = {
  id?: string;
  employee_id: string;
  employee_name?: string;
  employee_nip?: string | null;
  leave_type_id: string;
  leave_type_name?: string;
  quota_year: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
  carry_over_days: number;
  expired_days: number;
  valid_from?: string;
  valid_until?: string;
  notes?: string;
};

type LeaveTypeOption = {
  id: string;
  leave_name: string;
  leave_code: string;
  max_days_per_year: number;
};

type EmployeeOption = {
  id: string;
  name: string;
  nip: string | null;
};

type LeaveQuotaRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  quota_year: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
  carry_over_days: number;
  expired_days: number;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  employee?: {
    name: string | null;
    nip: string | null;
  } | null;
  leave_type?: {
    leave_name: string | null;
  } | null;
};

const initialQuotaState: LeaveQuota = {
  employee_id: "",
  leave_type_id: "",
  quota_year: new Date().getFullYear(),
  total_days: 0,
  used_days: 0,
  remaining_days: 0,
  carry_over_days: 0,
  expired_days: 0,
  notes: "",
};

const PAGE_SIZE = 10;

export default function OrgHRLeaveQuota() {
  const [quotas, setQuotas] = useState<LeaveQuota[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
  const [formState, setFormState] = useState<LeaveQuota>(initialQuotaState);
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/leave-quota");
  const confirmDialog = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [leaveTypesRes, employeesRes, quotasRes] = await Promise.all([
        supabase
          .from("leave_types")
          .select("id, leave_name, leave_code, max_days_per_year")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("leave_name", { ascending: true }),
        supabase
          .from("employees")
          .select("id, name, nip")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(500),
        supabase
          .from("leave_quotas")
          .select(`
            id,
            employee_id,
            leave_type_id,
            quota_year,
            total_days,
            used_days,
            remaining_days,
            carry_over_days,
            expired_days,
            valid_from,
            valid_until,
            notes,
            employee:employee_id (name, nip),
            leave_type:leave_type_id (leave_name)
          `, { count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("quota_year", yearFilter)
          .order("employee_id", { ascending: true })
          .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
      ]);

      if (leaveTypesRes.error) throw leaveTypesRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (quotasRes.error) throw quotasRes.error;

      setLeaveTypes((leaveTypesRes.data || []) as LeaveTypeOption[]);
      setEmployees((employeesRes.data || []) as EmployeeOption[]);
      setTotalItems(quotasRes.count || 0);
      
      const formattedQuotas = ((quotasRes.data || []) as LeaveQuotaRow[]).map((q) => ({
        id: q.id,
        employee_id: q.employee_id,
        employee_name: q.employee?.name || "Unknown",
        employee_nip: q.employee?.nip || null,
        leave_type_id: q.leave_type_id,
        leave_type_name: q.leave_type?.leave_name || "Unknown",
        quota_year: q.quota_year,
        total_days: q.total_days,
        used_days: q.used_days,
        remaining_days: q.remaining_days,
        carry_over_days: q.carry_over_days,
        expired_days: q.expired_days,
        valid_from: q.valid_from,
        valid_until: q.valid_until,
        notes: q.notes,
      })) as LeaveQuota[];

      formattedQuotas.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || "", "id"));

      setQuotas(formattedQuotas);
    } catch (error) {
      const ref = reportError(error, "org.hr.leave-quota.fetch");
      toast.error(appendErrorReference("Gagal memuat kuota cuti", ref));
      setQuotas([]);
      setTotalItems(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, yearFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [yearFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleOpenDialog = (quota?: LeaveQuota) => {
    if (!access.canConfigure) {
      toast.error(`Aksi ${quota ? "edit" : "tambah"} kuota cuti hanya tersedia untuk admin organisasi.`);
      return;
    }
    if (quota) {
      setEditingQuotaId(quota.id || null);
      setFormState({
        employee_id: quota.employee_id,
        leave_type_id: quota.leave_type_id,
        quota_year: quota.quota_year,
        total_days: quota.total_days,
        used_days: quota.used_days,
        remaining_days: quota.remaining_days,
        carry_over_days: quota.carry_over_days,
        expired_days: quota.expired_days,
        notes: quota.notes || "",
      });
    } else {
      setEditingQuotaId(null);
      setFormState(initialQuotaState);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!access.canConfigure) {
      toast.error("Aksi simpan kuota cuti hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!formState.employee_id || !formState.leave_type_id) {
      toast.error("Pilih pegawai dan jenis cuti.");
      return;
    }

    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant tidak ditemukan.");

      const payload = {
        tenant_id: tenantId,
        employee_id: formState.employee_id,
        leave_type_id: formState.leave_type_id,
        quota_year: formState.quota_year,
        total_days: Number(formState.total_days),
        used_days: Number(formState.used_days),
        carry_over_days: Number(formState.carry_over_days),
        expired_days: Number(formState.expired_days),
        notes: formState.notes?.trim() || null,
        valid_from: `${formState.quota_year}-01-01`,
        valid_until: `${formState.quota_year}-12-31`,
      };

      let error: Error | null = null;

      if (editingQuotaId) {
        const { error: updateError } = await supabase
          .from("leave_quotas")
          .update(payload)
          .eq("id", editingQuotaId)
          .eq("tenant_id", tenantId);
        error = updateError || null;
      } else {
        const { error: insertError } = await supabase.from("leave_quotas").insert(payload);
        error = insertError || null;
      }

      if (error) throw error;

      toast.success(`Kuota cuti berhasil ${editingQuotaId ? "diperbarui" : "ditambahkan"}.`);
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.leave-quota.save");
      toast.error(appendErrorReference(`Gagal menyimpan kuota cuti`, ref));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (quotaId: string, employeeName: string, leaveTypeName: string) => {
    if (!access.canConfigure) {
      toast.error("Aksi hapus kuota cuti hanya tersedia untuk admin organisasi.");
      return;
    }
    const confirmed = await confirmDialog({
      title: "Hapus Kuota Cuti",
      description: `Kuota cuti "${employeeName} - ${leaveTypeName}" akan dihapus permanen.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const { error } = await supabase.from("leave_quotas").delete().eq("id", quotaId).eq("tenant_id", tenantId);
      if (error) throw error;

      toast.success("Kuota cuti berhasil dihapus.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.leave-quota.delete");
      toast.error(appendErrorReference("Gagal menghapus kuota cuti", ref));
    }
  };

  const stats = useMemo(() => {
    const totalQuotas = quotas.length;
    const totalDays = quotas.reduce((sum, q) => sum + q.total_days, 0);
    const usedDays = quotas.reduce((sum, q) => sum + q.used_days, 0);
    const remainingDays = quotas.reduce((sum, q) => sum + q.remaining_days, 0);
    const utilization = totalDays > 0 ? Math.round((usedDays / totalDays) * 100) : 0;

    return { totalQuotas, totalDays, usedDays, remainingDays, utilization };
  }, [quotas]);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kebijakan HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Kuota Cuti</h1>
          <p className="text-sm text-muted-foreground">
            Kelola kuota cuti pegawai per tahun dengan tracking penggunaan.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard
            title="Total Kuota"
            value={stats.totalQuotas}
            icon={Calendar}
            description="Kuota terdaftar"
            color="blue"
          />
          <StatCard
            title="Total Hari"
            value={stats.totalDays}
            icon={Calendar}
            description="Semua hari cuti"
            color="blue"
          />
          <StatCard
            title="Hari Dipakai"
            value={stats.usedDays}
            icon={TrendingUp}
            description="Sudah digunakan"
            color="green"
          />
          <StatCard
            title="Sisa Hari"
            value={stats.remainingDays}
            icon={Calendar}
            description="Belum digunakan"
            color="orange"
          />
          <StatCard
            title="Utilisasi"
            value={`${stats.utilization}%`}
            icon={TrendingUp}
            description="Tingkat penggunaan"
            color={stats.utilization > 70 ? "green" : "orange"}
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <CardTitle>Daftar Kuota Cuti</CardTitle>
                  <CardDescription>Kuota cuti pegawai per tahun.</CardDescription>
                </div>
                <Select value={String(yearFilter)} onValueChange={(value) => setYearFilter(Number(value))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {access.canConfigure && (
                <Button onClick={() => handleOpenDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Kuota
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Memuat data...</div>
            ) : totalItems === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Belum ada kuota cuti untuk tahun {yearFilter}.
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Jenis Cuti</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Dipakai</TableHead>
                    <TableHead className="text-center">Sisa</TableHead>
                    <TableHead className="text-center">Carry Over</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotas.map((quota, index) => (
                    <TableRow key={quota.id}>
                      <TableCell>{(safePage - 1) * PAGE_SIZE + index + 1}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{quota.employee_name}</div>
                          {quota.employee_nip && (
                            <div className="text-xs text-muted-foreground font-mono">{quota.employee_nip}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{quota.leave_type_name}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{quota.total_days} hari</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default">{quota.used_days} hari</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={quota.remaining_days > 0 ? "default" : "secondary"}>
                          {quota.remaining_days} hari
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">{quota.carry_over_days} hari</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {access.canConfigure && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(quota)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(quota.id!, quota.employee_name || "", quota.leave_type_name || "")}
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
                totalItems={totalItems}
                pageSize={PAGE_SIZE}
                itemLabel="kuota"
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
                {editingQuotaId ? "Edit Kuota Cuti" : "Tambah Kuota Cuti"}
              </DialogTitle>
              <DialogDescription>
                Kelola kuota cuti pegawai per tahun.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="employee_id">Pegawai</Label>
                <select
                  id="employee_id"
                  value={formState.employee_id}
                  onChange={(e) => setFormState((prev) => ({ ...prev, employee_id: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isLoading}
                >
                  <option value="">Pilih pegawai...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.nip && `(${emp.nip})`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="leave_type_id">Jenis Cuti</Label>
                <select
                  id="leave_type_id"
                  value={formState.leave_type_id}
                  onChange={(e) => setFormState((prev) => ({ ...prev, leave_type_id: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isLoading}
                >
                  <option value="">Pilih jenis cuti...</option>
                  {leaveTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.leave_name} (Max: {type.max_days_per_year} hari)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="quota_year">Tahun</Label>
                <Input
                  id="quota_year"
                  type="number"
                  value={formState.quota_year}
                  onChange={(e) => setFormState((prev) => ({ ...prev, quota_year: Number(e.target.value) }))}
                  min={currentYear - 5}
                  max={currentYear + 5}
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="total_days">Total Hari</Label>
                  <Input
                    id="total_days"
                    type="number"
                    value={formState.total_days}
                    onChange={(e) => setFormState((prev) => ({ ...prev, total_days: Number(e.target.value) }))}
                    min="0"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="used_days">Dipakai</Label>
                  <Input
                    id="used_days"
                    type="number"
                    value={formState.used_days}
                    onChange={(e) => setFormState((prev) => ({ ...prev, used_days: Number(e.target.value) }))}
                    min="0"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="carry_over">Carry Over</Label>
                  <Input
                    id="carry_over"
                    type="number"
                    value={formState.carry_over_days}
                    onChange={(e) => setFormState((prev) => ({ ...prev, carry_over_days: Number(e.target.value) }))}
                    min="0"
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Catatan</Label>
                <Textarea
                  id="notes"
                  value={formState.notes}
                  onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Catatan kuota (opsional)"
                  disabled={isLoading}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !access.canConfigure}>
                {isLoading ? "Menyimpan..." : editingQuotaId ? "Perbarui" : "Simpan"}
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
