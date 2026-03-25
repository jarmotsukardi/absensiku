import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Home, Plus, Pencil, Trash2, Building2, Users, User } from "lucide-react";
import { toast } from "sonner";
import { useEmployee } from "@/hooks/useEmployee";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type WfhSchedule = Tables<"wfh_schedules">;
type OPD = Tables<"opd">;
type WorkUnit = Tables<"work_units">;
type Employee = Tables<"employees">;

const DAYS_OF_WEEK = [
  { value: 0, label: "Minggu" },
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
];

const WFH_READ_TIMEOUT_MS = 12000;
const WFH_WRITE_TIMEOUT_MS = 15000;
const WFH_READ_MAX_RETRIES = 2;

interface ScheduleFormData {
  scope: "organization" | "opd" | "work_unit" | "employee";
  opd_id: string | null;
  work_unit_id: string | null;
  employee_id: string | null;
  schedule_type: "recurring" | "specific" | "range";
  day_of_week: number | null;
  specific_date: string;
  start_date: string;
  end_date: string;
  description: string;
  is_active: boolean;
}

export default function OrgWfhScheduleManagement() {
  const confirmDialog = useConfirmDialog();
  useEmployee(null);
  const [schedules, setSchedules] = useState<WfhSchedule[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WfhSchedule | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const [formData, setFormData] = useState<ScheduleFormData>({
    scope: "organization",
    opd_id: null,
    work_unit_id: null,
    employee_id: null,
    schedule_type: "recurring",
    day_of_week: 5, // Jumat
    specific_date: "",
    start_date: "",
    end_date: "",
    description: "",
    is_active: true,
  });

  const fetchTenantId = useCallback(async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);
      const { data: { user }, error: userError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            WFH_READ_TIMEOUT_MS,
            "Permintaan user auth timeout."
          ),
        {
          maxRetries: WFH_READ_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (userError) throw userError;
      if (!user) {
        setTenantId(null);
        setIsLoading(false);
        setIsRetrying(false);
        return;
      }

      const { data: roleRows, error: roleError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("user_roles")
              .select("role, tenant_id")
              .eq("user_id", user.id)
              .in("role", ["admin_instansi", "super_admin"]),
            WFH_READ_TIMEOUT_MS,
            "Permintaan role user timeout."
          ),
        {
          maxRetries: WFH_READ_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (roleError) throw roleError;

      const adminRole = roleRows?.find((r) => r.role === "admin_instansi" && r.tenant_id);
      if (adminRole?.tenant_id) {
        setTenantId(adminRole.tenant_id);
        return;
      }

      // Fallback for accounts that do not have admin role row but still tied to employee record.
      const { data: emp, error: empError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("tenant_id")
              .eq("user_id", user.id)
              .maybeSingle(),
            WFH_READ_TIMEOUT_MS,
            "Permintaan data pegawai timeout."
          ),
        {
          maxRetries: WFH_READ_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (empError) throw empError;

      if (emp?.tenant_id) {
        setTenantId(emp.tenant_id);
        return;
      }

      setTenantId(null);
      setIsLoading(false);
      toast.error("Tenant organisasi tidak ditemukan untuk akun ini.");
    } catch (error) {
      const errorRef = reportError(error, "org.wfh_schedule.resolve_tenant");
      const message = appendErrorReference("Gagal menentukan tenant organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
      setTenantId(null);
      setIsLoading(false);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const [schedulesRes, opdsRes, workUnitsRes, employeesRes] = await withExponentialBackoff(
        () =>
          withTimeout(
            Promise.all([
              supabase.from("wfh_schedules").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
              supabase.from("opd").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
              supabase.from("work_units").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
              supabase.from("employees").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
            ]),
            WFH_READ_TIMEOUT_MS,
            "Permintaan data jadwal WFH timeout."
          ),
        {
          maxRetries: WFH_READ_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (schedulesRes.error) throw schedulesRes.error;
      if (opdsRes.error) throw opdsRes.error;
      if (workUnitsRes.error) throw workUnitsRes.error;
      if (employeesRes.error) throw employeesRes.error;

      setSchedules(schedulesRes.data || []);
      setOpds(opdsRes.data || []);
      setWorkUnits(workUnitsRes.data || []);
      setEmployees(employeesRes.data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.wfh_schedule.fetch_data", { tenant_id: tenantId });
      const message = appendErrorReference("Gagal memuat data", errorRef);
      setLoadError(message);
      toast.error(message);
      setSchedules([]);
      setOpds([]);
      setWorkUnits([]);
      setEmployees([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchTenantId();
  }, [fetchTenantId]);

  useEffect(() => {
    if (tenantId) {
      void fetchData();
    }
  }, [tenantId, fetchData]);

  const resetForm = () => {
    setFormData({
      scope: "organization",
      opd_id: null,
      work_unit_id: null,
      employee_id: null,
      schedule_type: "recurring",
      day_of_week: 5,
      specific_date: "",
      start_date: "",
      end_date: "",
      description: "",
      is_active: true,
    });
    setEditingSchedule(null);
  };

  const handleEdit = (schedule: WfhSchedule) => {
    let scope: ScheduleFormData["scope"] = "organization";
    if (schedule.employee_id) scope = "employee";
    else if (schedule.work_unit_id) scope = "work_unit";
    else if (schedule.opd_id) scope = "opd";

    let schedule_type: ScheduleFormData["schedule_type"] = "recurring";
    if (schedule.specific_date) schedule_type = "specific";
    else if (schedule.start_date && schedule.end_date) schedule_type = "range";

    setFormData({
      scope,
      opd_id: schedule.opd_id,
      work_unit_id: schedule.work_unit_id,
      employee_id: schedule.employee_id,
      schedule_type,
      day_of_week: schedule.day_of_week,
      specific_date: schedule.specific_date || "",
      start_date: schedule.start_date || "",
      end_date: schedule.end_date || "",
      description: schedule.description || "",
      is_active: schedule.is_active ?? true,
    });
    setEditingSchedule(schedule);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!tenantId) return;

    try {
      const scheduleData: TablesUpdate<"wfh_schedules"> = {
        tenant_id: tenantId,
        is_active: formData.is_active,
        description: formData.description || null,
        is_recurring: formData.schedule_type === "recurring",
        opd_id: formData.scope === "opd" || formData.scope === "work_unit" ? formData.opd_id : null,
        work_unit_id: formData.scope === "work_unit" ? formData.work_unit_id : null,
        employee_id: formData.scope === "employee" ? formData.employee_id : null,
        day_of_week: formData.schedule_type === "recurring" ? formData.day_of_week : null,
        specific_date: formData.schedule_type === "specific" ? formData.specific_date : null,
        start_date: formData.schedule_type === "range" ? formData.start_date : null,
        end_date: formData.schedule_type === "range" ? formData.end_date : null,
      };

      if (editingSchedule) {
        const { error } = await withTimeout(
          supabase
            .from("wfh_schedules")
            .update(scheduleData)
            .eq("id", editingSchedule.id),
          WFH_WRITE_TIMEOUT_MS,
          "Simpan update jadwal WFH timeout."
        );
        if (error) throw error;
        toast.success("Jadwal WFH berhasil diperbarui");
      } else {
        const { error } = await withTimeout(
          supabase
            .from("wfh_schedules")
            .insert(scheduleData as TablesInsert<"wfh_schedules">),
          WFH_WRITE_TIMEOUT_MS,
          "Tambah jadwal WFH timeout."
        );
        if (error) throw error;
        toast.success("Jadwal WFH berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.wfh_schedule.save", {
        tenant_id: tenantId,
        schedule_id: editingSchedule?.id ?? null,
      });
      toast.error(appendErrorReference("Gagal menyimpan jadwal", errorRef));
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Jadwal WFH",
        description: "Yakin ingin menghapus jadwal ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    try {
      if (!tenantId) {
        toast.error("Tenant tidak ditemukan");
        return;
      }
      const { error } = await withTimeout(
        supabase.from("wfh_schedules").delete().eq("id", id).eq("tenant_id", tenantId),
        WFH_WRITE_TIMEOUT_MS,
        "Hapus jadwal WFH timeout."
      );
      if (error) throw error;
      toast.success("Jadwal berhasil dihapus");
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "org.wfh_schedule.delete", {
        tenant_id: tenantId,
        schedule_id: id,
      });
      toast.error(appendErrorReference("Gagal menghapus jadwal", errorRef));
    }
  };

  const getScopeLabel = (schedule: WfhSchedule) => {
    if (schedule.employee_id) {
      const emp = employees.find(e => e.id === schedule.employee_id);
      return { icon: User, label: emp?.name || "Pegawai", color: "bg-purple-500/10 text-purple-700" };
    }
    if (schedule.work_unit_id) {
      const unit = workUnits.find(u => u.id === schedule.work_unit_id);
      return { icon: Users, label: unit?.name || "Satuan Kerja", color: "bg-blue-500/10 text-blue-700" };
    }
    if (schedule.opd_id) {
      const opd = opds.find(o => o.id === schedule.opd_id);
      return { icon: Building2, label: opd?.name || "OPD", color: "bg-green-500/10 text-green-700" };
    }
    return { icon: Home, label: "Semua Organisasi", color: "bg-orange-500/10 text-orange-700" };
  };

  const getScheduleLabel = (schedule: WfhSchedule) => {
    if (schedule.is_recurring && schedule.day_of_week !== null) {
      return `Setiap ${DAYS_OF_WEEK.find(d => d.value === schedule.day_of_week)?.label}`;
    }
    if (schedule.specific_date) {
      return new Date(schedule.specific_date).toLocaleDateString("id-ID", { dateStyle: "long" });
    }
    if (schedule.start_date && schedule.end_date) {
      return `${new Date(schedule.start_date).toLocaleDateString("id-ID")} - ${new Date(schedule.end_date).toLocaleDateString("id-ID")}`;
    }
    return "-";
  };
  const totalPages = Math.max(1, Math.ceil(schedules.length / ITEMS_PER_PAGE));
  const paginatedSchedules = schedules.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [schedules.length]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat data jadwal WFH...
          </div>
        )}

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              Muat Ulang
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Home className="h-6 w-6" />
              Jadwal Work From Home
            </h1>
            <p className="text-muted-foreground">Kelola jadwal WFH untuk organisasi, OPD, satuan kerja, atau pegawai</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Tambah Jadwal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingSchedule ? "Edit Jadwal WFH" : "Tambah Jadwal WFH"}</DialogTitle>
                <DialogDescription>Atur jadwal WFH untuk organisasi atau unit tertentu</DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Berlaku Untuk</Label>
                  <Select
                    value={formData.scope}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        scope: value as ScheduleFormData["scope"],
                        opd_id: null,
                        work_unit_id: null,
                        employee_id: null,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organization">Semua Organisasi</SelectItem>
                      <SelectItem value="opd">Per OPD</SelectItem>
                      <SelectItem value="work_unit">Per Satuan Kerja</SelectItem>
                      <SelectItem value="employee">Per Pegawai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.scope === "opd" && (
                  <div className="grid gap-2">
                    <Label>Pilih OPD</Label>
                    <Select value={formData.opd_id || ""} onValueChange={(v) => setFormData({ ...formData, opd_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Pilih OPD" /></SelectTrigger>
                      <SelectContent>
                        {opds.map(opd => <SelectItem key={opd.id} value={opd.id}>{opd.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.scope === "work_unit" && (
                  <>
                    <div className="grid gap-2">
                      <Label>Pilih OPD</Label>
                      <Select value={formData.opd_id || ""} onValueChange={(v) => setFormData({ ...formData, opd_id: v, work_unit_id: null })}>
                        <SelectTrigger><SelectValue placeholder="Pilih OPD" /></SelectTrigger>
                        <SelectContent>
                          {opds.map(opd => <SelectItem key={opd.id} value={opd.id}>{opd.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Pilih Satuan Kerja</Label>
                      <Select value={formData.work_unit_id || ""} onValueChange={(v) => setFormData({ ...formData, work_unit_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Pilih Satuan Kerja" /></SelectTrigger>
                        <SelectContent>
                          {workUnits.filter(u => !formData.opd_id || u.opd_id === formData.opd_id).map(unit => (
                            <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {formData.scope === "employee" && (
                  <div className="grid gap-2">
                    <Label>Pilih Pegawai</Label>
                    <Select value={formData.employee_id || ""} onValueChange={(v) => setFormData({ ...formData, employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Pilih Pegawai" /></SelectTrigger>
                      <SelectContent>
                        {employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>Tipe Jadwal</Label>
                  <Select
                    value={formData.schedule_type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, schedule_type: value as ScheduleFormData["schedule_type"] })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring">Berulang (Hari Tertentu)</SelectItem>
                      <SelectItem value="specific">Tanggal Spesifik</SelectItem>
                      <SelectItem value="range">Rentang Tanggal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.schedule_type === "recurring" && (
                  <div className="grid gap-2">
                    <Label>Hari</Label>
                    <Select value={String(formData.day_of_week)} onValueChange={(v) => setFormData({ ...formData, day_of_week: parseInt(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map(day => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.schedule_type === "specific" && (
                  <div className="grid gap-2">
                    <Label>Tanggal</Label>
                    <Input type="date" value={formData.specific_date} onChange={(e) => setFormData({ ...formData, specific_date: e.target.value })} />
                  </div>
                )}

                {formData.schedule_type === "range" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Mulai</Label>
                      <Input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Selesai</Label>
                      <Input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
                    </div>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>Keterangan</Label>
                  <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Contoh: WFH setiap Jumat minggu pertama" />
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                  <Label>Aktif</Label>
                </div>
              </div>

              <DialogFooter className={dialogActionBarClassName}>
                <DialogActionHint>Periksa periode dan target jadwal WFH sebelum menyimpan.</DialogActionHint>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Batal</Button>
                  <Button onClick={handleSubmit}>{editingSchedule ? "Simpan" : "Tambah"}</Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Jadwal WFH</CardTitle>
            <CardDescription>Total {schedules.length} jadwal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Berlaku Untuk</TableHead>
                    <TableHead>Jadwal</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : schedules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Belum ada jadwal WFH
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedSchedules.map((schedule) => {
                      const scope = getScopeLabel(schedule);
                      const ScopeIcon = scope.icon;
                      return (
                        <TableRow key={schedule.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded ${scope.color}`}>
                                <ScopeIcon className="h-4 w-4" />
                              </div>
                              <span className="font-medium">{scope.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getScheduleLabel(schedule)}</TableCell>
                          <TableCell className="text-muted-foreground">{schedule.description || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={schedule.is_active ? "default" : "secondary"}>
                              {schedule.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(schedule)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(schedule.id)}>
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
            </div>
            {!isLoading && schedules.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_schedule_wfh" />
      </div>
    </OrganizationLayout>
  );
}
