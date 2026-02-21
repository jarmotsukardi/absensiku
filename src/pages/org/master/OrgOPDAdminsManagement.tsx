import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Loader2,
  Users,
  FileText,
  Download,
  UserPlus,
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

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
  employee: {
    name: string;
    email: string;
    nik: string;
  };
  opd: {
    name: string;
    code: string;
  };
}

interface OPD {
  id: string;
  name: string;
  code: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  nik: string;
  opd_id: string | null;
}

const ITEMS_PER_PAGE = 10;

export default function OrgOPDAdminsManagement() {
  const confirmDialog = useConfirmDialog();
  const [admins, setAdmins] = useState<OPDAdmin[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const [formData, setFormData] = useState({
    opd_id: "",
    employee_id: "",
    can_approve_leave: true,
    can_view_reports: true,
    can_export_reports: true,
    can_invite_employees: true,
  });

  const fetchAdmins = useCallback(async (tid: string) => {
    // Count total
    const { count } = await supabase
      .from("opd_admins")
      .select("*, opd!inner(tenant_id)", { count: "exact", head: true })
      .eq("opd.tenant_id", tid);

    setTotalCount(count || 0);

    // Fetch paginated data
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, error } = await supabase
      .from("opd_admins")
      .select(`
        *,
        employee:employees!opd_admins_employee_id_fkey(name, email, nik),
        opd:opd!opd_admins_opd_id_fkey(name, code, tenant_id)
      `)
      .eq("opd.tenant_id", tid)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    setAdmins((data as unknown as OPDAdmin[]) || []);
  }, [currentPage]);

  const fetchOpdList = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from("opd")
      .select("id, name, code")
      .eq("tenant_id", tid)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    setOpdList(data || []);
  }, []);

  const fetchEmployees = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, email, nik, opd_id")
      .eq("tenant_id", tid)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    setEmployees(data || []);
  }, []);

  const fetchTenantAndData = useCallback(async () => {
    try {
      setLoadError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleData?.tenant_id) return;
      setTenantId(roleData.tenant_id);

      await Promise.all([
        fetchAdmins(roleData.tenant_id),
        fetchOpdList(roleData.tenant_id),
        fetchEmployees(roleData.tenant_id),
      ]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.opd_admins.fetch_data");
      const message = appendErrorReference("Gagal memuat data admin OPD", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAdmins, fetchEmployees, fetchOpdList]);

  useEffect(() => {
    void fetchTenantAndData();
  }, [fetchTenantAndData]);

  const handleSubmit = async () => {
    if (!formData.opd_id || !formData.employee_id) {
      toast.error("Pilih OPD dan Pegawai");
      return;
    }

    setIsSaving(true);
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from("opd_admins")
        .select("id")
        .eq("opd_id", formData.opd_id)
        .eq("employee_id", formData.employee_id)
        .maybeSingle();

      if (existing) {
        toast.error("Pegawai ini sudah menjadi admin OPD");
        return;
      }

      const { error } = await supabase.from("opd_admins").insert({
        opd_id: formData.opd_id,
        employee_id: formData.employee_id,
        can_approve_leave: formData.can_approve_leave,
        can_view_reports: formData.can_view_reports,
        can_export_reports: formData.can_export_reports,
        can_invite_employees: formData.can_invite_employees,
        is_active: true,
      });

      if (error) throw error;

      toast.success("Admin OPD berhasil ditambahkan");
      setIsDialogOpen(false);
      setFormData({
        opd_id: "",
        employee_id: "",
        can_approve_leave: true,
        can_view_reports: true,
        can_export_reports: true,
        can_invite_employees: true,
      });
      if (tenantId) fetchAdmins(tenantId);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.opd_admins.add", {
        tenant_id: tenantId,
        opd_id: formData.opd_id,
        employee_id: formData.employee_id,
      });
      toast.error(appendErrorReference("Gagal menambahkan admin OPD", errorRef));
    } finally {
      setIsSaving(false);
    }
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

    try {
      const { error } = await supabase
        .from("opd_admins")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Admin OPD berhasil dihapus");
      if (tenantId) fetchAdmins(tenantId);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.opd_admins.delete", {
        tenant_id: tenantId,
        opd_admin_id: id,
      });
      toast.error(appendErrorReference("Gagal menghapus admin OPD", errorRef));
    }
  };

  const toggleStatus = async (admin: OPDAdmin) => {
    try {
      const { error } = await supabase
        .from("opd_admins")
        .update({ is_active: !admin.is_active })
        .eq("id", admin.id);

      if (error) throw error;
      toast.success(`Admin OPD ${admin.is_active ? "dinonaktifkan" : "diaktifkan"}`);
      if (tenantId) fetchAdmins(tenantId);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.opd_admins.toggle_status", {
        tenant_id: tenantId,
        opd_admin_id: admin.id,
      });
      toast.error(appendErrorReference("Gagal mengubah status", errorRef));
    }
  };

  const filteredEmployees = formData.opd_id
    ? employees.filter(e => e.opd_id === formData.opd_id || !e.opd_id)
    : employees;

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6" />
              Kelola Admin OPD
            </h1>
            <p className="text-muted-foreground">
              Kelola admin untuk setiap OPD/Perangkat Daerah
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Admin OPD
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Admin OPD</DialogTitle>
                <DialogDescription>
                  Pilih pegawai untuk dijadikan admin OPD
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>OPD/Perangkat Daerah</Label>
                  <Select
                    value={formData.opd_id}
                    onValueChange={(value) => setFormData({ ...formData, opd_id: value, employee_id: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      {opdList.map((opd) => (
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
                      <SelectValue placeholder="Pilih Pegawai" />
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

                <div className="space-y-3 pt-4 border-t">
                  <Label className="text-sm font-medium">Kewenangan Admin</Label>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_approve_leave"
                      checked={formData.can_approve_leave}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, can_approve_leave: !!checked })
                      }
                    />
                    <Label htmlFor="can_approve_leave" className="text-sm font-normal flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Persetujuan Cuti/Izin
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_view_reports"
                      checked={formData.can_view_reports}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, can_view_reports: !!checked })
                      }
                    />
                    <Label htmlFor="can_view_reports" className="text-sm font-normal flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Lihat Laporan Absensi
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_export_reports"
                      checked={formData.can_export_reports}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, can_export_reports: !!checked })
                      }
                    />
                    <Label htmlFor="can_export_reports" className="text-sm font-normal flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Ekspor Laporan
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_invite_employees"
                      checked={formData.can_invite_employees}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, can_invite_employees: !!checked })
                      }
                    />
                    <Label htmlFor="can_invite_employees" className="text-sm font-normal flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Undang Pegawai
                    </Label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Batal
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Admin OPD</CardTitle>
            <CardDescription>
              Total {totalCount} admin OPD terdaftar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Kewenangan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Belum ada admin OPD
                      </TableCell>
                    </TableRow>
                  ) : (
                    admins.map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{admin.employee?.name}</p>
                            <p className="text-sm text-muted-foreground">{admin.employee?.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{admin.opd?.name}</p>
                            <p className="text-sm text-muted-foreground">{admin.opd?.code}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {admin.can_approve_leave && (
                              <Badge variant="outline" className="text-xs">Cuti</Badge>
                            )}
                            {admin.can_view_reports && (
                              <Badge variant="outline" className="text-xs">Laporan</Badge>
                            )}
                            {admin.can_export_reports && (
                              <Badge variant="outline" className="text-xs">Ekspor</Badge>
                            )}
                            {admin.can_invite_employees && (
                              <Badge variant="outline" className="text-xs">Undang</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={admin.is_active ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() => toggleStatus(admin)}
                          >
                            {admin.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(admin.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

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
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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

        <PageGlossarySection preset="org_master_data" />
      </div>
    </OrganizationLayout>
  );
}
