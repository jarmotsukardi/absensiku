import { useState, useEffect, useCallback } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Shield, Loader2 } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface OPDAdmin {
  id: string;
  opd_id: string;
  employee_id: string;
  is_active: boolean;
  can_approve_leave: boolean;
  can_view_reports: boolean;
  can_export_reports: boolean;
  can_invite_employees: boolean;
  created_at: string;
  opd?: { name: string; code: string };
  employee?: { name: string; email: string; nik: string };
}

interface OPD {
  id: string;
  name: string;
  code: string;
  tenant_id: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  nik: string;
  opd_id: string | null;
}

const ITEMS_PER_PAGE = 10;
const ADMIN_OPD_ADMINS_READ_TIMEOUT_MS = 12000;
const ADMIN_OPD_ADMINS_WRITE_TIMEOUT_MS = 15000;
const ADMIN_OPD_ADMINS_MAX_RETRIES = 2;

export default function OPDAdminsManagement() {
  const confirmDialog = useConfirmDialog();
  const [admins, setAdmins] = useState<OPDAdmin[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Terjadi kesalahan";
  
  const [formData, setFormData] = useState({
    id: "",
    opd_id: "",
    employee_id: "",
    is_active: true,
    can_approve_leave: true,
    can_view_reports: true,
    can_export_reports: true,
    can_invite_employees: true,
  });

  useEffect(() => {
    if (formData.opd_id) {
      const filtered = employees.filter(e => e.opd_id === formData.opd_id);
      setFilteredEmployees(filtered);
    } else {
      setFilteredEmployees([]);
    }
  }, [formData.opd_id, employees]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setIsRetrying(false);
    setLoadError(null);
    try {
      // Fetch OPD Admins with relations
      const { data: adminsData, error: adminsError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd_admins")
              .select(`
                *,
                opd:opd_id(name, code)
              `)
              .order("created_at", { ascending: false }),
            ADMIN_OPD_ADMINS_READ_TIMEOUT_MS,
            "Permintaan data admin OPD timeout."
          ),
        {
          maxRetries: ADMIN_OPD_ADMINS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (adminsError) throw adminsError;
      
      // Fetch employee data separately to avoid multiple relationship error
      const adminIds = adminsData?.map(a => a.employee_id) || [];
      const { data: adminEmployeesData } = adminIds.length
        ? await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("employees")
                  .select("id, name, email, nik")
                  .in("id", adminIds),
                ADMIN_OPD_ADMINS_READ_TIMEOUT_MS,
                "Permintaan pegawai admin OPD timeout."
              ),
            {
              maxRetries: ADMIN_OPD_ADMINS_MAX_RETRIES,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          )
        : { data: [] as Employee[] };

      const employeeMap = new Map(adminEmployeesData?.map(e => [e.id, e]) || []);
      
      const adminsWithEmployee = adminsData?.map(admin => ({
        ...admin,
        employee: employeeMap.get(admin.employee_id) || { name: "", email: "", nik: "" }
      })) || [];
      
      setAdmins(adminsWithEmployee as OPDAdmin[]);

      // Fetch all OPDs
      const { data: opdsData, error: opdsError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd")
              .select("id, name, code, tenant_id")
              .eq("is_active", true)
              .order("name"),
            ADMIN_OPD_ADMINS_READ_TIMEOUT_MS,
            "Permintaan daftar OPD timeout."
          ),
        {
          maxRetries: ADMIN_OPD_ADMINS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (opdsError) throw opdsError;
      setOpds(opdsData || []);

      // Fetch all employees
      const { data: employeesData, error: employeesError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("id, name, email, nik, opd_id")
              .eq("is_active", true)
              .order("name"),
            ADMIN_OPD_ADMINS_READ_TIMEOUT_MS,
            "Permintaan daftar pegawai timeout."
          ),
        {
          maxRetries: ADMIN_OPD_ADMINS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (employeesError) throw employeesError;
      setEmployees(employeesData || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.master.opd_admins.fetch");
      const message = appendErrorReference("Gagal memuat data admin OPD", errorRef);
      toast.error(message);
      setLoadError(message);
      setAdmins([]);
      setOpds([]);
      setEmployees([]);
      setFilteredEmployees([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.opd_id || !formData.employee_id) {
      toast.error("Pilih OPD dan Pegawai");
      return;
    }

    setLoadError(null);
    try {
      if (isEditing) {
        const { error } = await withTimeout(
          supabase
            .from("opd_admins")
            .update({
              opd_id: formData.opd_id,
              employee_id: formData.employee_id,
              is_active: formData.is_active,
              can_approve_leave: formData.can_approve_leave,
              can_view_reports: formData.can_view_reports,
              can_export_reports: formData.can_export_reports,
              can_invite_employees: formData.can_invite_employees,
            })
            .eq("id", formData.id),
          ADMIN_OPD_ADMINS_WRITE_TIMEOUT_MS,
          "Perbarui admin OPD timeout."
        );

        if (error) throw error;
        toast.success("Admin OPD berhasil diperbarui");
      } else {
        // Check if admin already exists
        const { data: existing } = await withTimeout(
          supabase
            .from("opd_admins")
            .select("id")
            .eq("opd_id", formData.opd_id)
            .eq("employee_id", formData.employee_id)
            .maybeSingle(),
          ADMIN_OPD_ADMINS_WRITE_TIMEOUT_MS,
          "Cek duplikasi admin OPD timeout."
        );

        if (existing) {
          toast.error("Pegawai sudah menjadi admin OPD ini");
          return;
        }

        const { error } = await withTimeout(
          supabase.from("opd_admins").insert({
            opd_id: formData.opd_id,
            employee_id: formData.employee_id,
            is_active: formData.is_active,
            can_approve_leave: formData.can_approve_leave,
            can_view_reports: formData.can_view_reports,
            can_export_reports: formData.can_export_reports,
            can_invite_employees: formData.can_invite_employees,
          }),
          ADMIN_OPD_ADMINS_WRITE_TIMEOUT_MS,
          "Tambah admin OPD timeout."
        );

        if (error) throw error;
        toast.success("Admin OPD berhasil ditambahkan");
      }

      resetForm();
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "admin.master.opd_admins.save", {
        mode: isEditing ? "update" : "insert",
        opd_id: formData.opd_id,
        employee_id: formData.employee_id,
      });
      const message = appendErrorReference(`Gagal menyimpan: ${getErrorMessage(error)}`, errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const handleEdit = (admin: OPDAdmin) => {
    setFormData({
      id: admin.id,
      opd_id: admin.opd_id,
      employee_id: admin.employee_id,
      is_active: admin.is_active,
      can_approve_leave: admin.can_approve_leave,
      can_view_reports: admin.can_view_reports,
      can_export_reports: admin.can_export_reports,
      can_invite_employees: admin.can_invite_employees,
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Admin OPD",
        description: "Yakin ingin menghapus admin OPD ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    setLoadError(null);
    try {
      const { error } = await withTimeout(
        supabase.from("opd_admins").delete().eq("id", id),
        ADMIN_OPD_ADMINS_WRITE_TIMEOUT_MS,
        "Hapus admin OPD timeout."
      );
      if (error) throw error;
      toast.success("Admin OPD berhasil dihapus");
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "admin.master.opd_admins.delete", { opd_admin_id: id });
      const message = appendErrorReference(`Gagal menghapus: ${getErrorMessage(error)}`, errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const resetForm = () => {
    setFormData({
      id: "",
      opd_id: "",
      employee_id: "",
      is_active: true,
      can_approve_leave: true,
      can_view_reports: true,
      can_export_reports: true,
      can_invite_employees: true,
    });
    setIsEditing(false);
    setIsDialogOpen(false);
  };

  const filteredAdmins = admins.filter(admin => 
    admin.employee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.opd?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.employee?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredAdmins.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedAdmins = filteredAdmins.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const visiblePages =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : currentPage <= 3
        ? [1, 2, 3, 4, 5]
        : currentPage >= totalPages - 2
          ? [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <SuperAdminLayout title="Admin OPD" subtitle="Kelola admin untuk setiap OPD">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm sm:flex-1">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari admin OPD..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setIsDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Admin OPD
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Admin OPD" : "Tambah Admin OPD"}</DialogTitle>
                <DialogDescription>
                  Pilih pegawai yang akan menjadi admin OPD
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>OPD</Label>
                  <Select
                    value={formData.opd_id}
                    onValueChange={(value) => setFormData({ ...formData, opd_id: value, employee_id: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      {opds.map((opd) => (
                        <SelectItem key={opd.id} value={opd.id}>
                          {opd.name} ({opd.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Pegawai</Label>
                  <Select
                    value={formData.employee_id}
                    onValueChange={(value) => setFormData({ ...formData, employee_id: value })}
                    disabled={!formData.opd_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.opd_id ? "Pilih Pegawai" : "Pilih OPD terlebih dahulu"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name} - {emp.nik}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 border rounded-lg p-4">
                  <Label className="text-sm font-medium">Kewenangan</Label>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="can_approve_leave" className="text-sm font-normal">Persetujuan Cuti/Izin</Label>
                    <Switch
                      id="can_approve_leave"
                      checked={formData.can_approve_leave}
                      onCheckedChange={(checked) => setFormData({ ...formData, can_approve_leave: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="can_view_reports" className="text-sm font-normal">Lihat Laporan</Label>
                    <Switch
                      id="can_view_reports"
                      checked={formData.can_view_reports}
                      onCheckedChange={(checked) => setFormData({ ...formData, can_view_reports: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="can_export_reports" className="text-sm font-normal">Ekspor Laporan</Label>
                    <Switch
                      id="can_export_reports"
                      checked={formData.can_export_reports}
                      onCheckedChange={(checked) => setFormData({ ...formData, can_export_reports: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="can_invite_employees" className="text-sm font-normal">Undang Pegawai</Label>
                    <Switch
                      id="can_invite_employees"
                      checked={formData.can_invite_employees}
                      onCheckedChange={(checked) => setFormData({ ...formData, can_invite_employees: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <Label htmlFor="is_active" className="text-sm font-normal">Status Aktif</Label>
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>
                </div>

                <DialogFooter className={dialogActionBarClassName}>
                  <DialogActionHint>Hak akses admin OPD akan aktif segera setelah disimpan.</DialogActionHint>
                  <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Batal
                    </Button>
                    <Button type="submit">
                      {isEditing ? "Simpan Perubahan" : "Tambah Admin"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Daftar Admin OPD
            </CardTitle>
            <CardDescription>
              Total {filteredAdmins.length} admin OPD
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isRetrying && (
              <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                Sedang mencoba ulang memuat data admin OPD...
              </div>
            )}
            {loadError && (
              <div className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                <span>{loadError}</span>
                <Button variant="outline" size="sm" onClick={() => void fetchData()}>
                  Coba Lagi
                </Button>
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : paginatedAdmins.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                Belum ada admin OPD
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Nama Admin</TableHead>
                    <TableHead>Kewenangan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAdmins.map((admin, index) => (
                    <TableRow key={admin.id}>
                      <TableCell>{startIndex + index + 1}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{admin.opd?.name}</div>
                          <div className="text-xs text-muted-foreground">{admin.opd?.code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{admin.employee?.name}</div>
                          <div className="text-xs text-muted-foreground">{admin.employee?.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {admin.can_approve_leave && <Badge variant="outline" className="text-xs">Cuti</Badge>}
                          {admin.can_view_reports && <Badge variant="outline" className="text-xs">Laporan</Badge>}
                          {admin.can_export_reports && <Badge variant="outline" className="text-xs">Ekspor</Badge>}
                          {admin.can_invite_employees && <Badge variant="outline" className="text-xs">Undang</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={admin.is_active ? "default" : "secondary"}>
                          {admin.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(admin)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(admin.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {visiblePages.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
