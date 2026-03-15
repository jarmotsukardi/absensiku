import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Users, UserCheck, UserX, Briefcase, Search, Download, Pencil, RefreshCw, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { fetchSupabaseRpc } from "@/lib/supabaseRestClient";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { validateEmployeeStatusForm } from "@/lib/hrEmploymentLifecycle";
import { toast } from "sonner";

type EmployeeRow = {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  nip: string | null;
  employee_category: string | null;
  golongan: string | null;
  opd_name: string | null;
  position_name: string | null;
  is_active: boolean | null;
  joined_date: string | null;
  last_status_effective_date: string | null;
  last_status_reason: string | null;
  last_status_changed_at: string | null;
};

type EmployeeStatusQueryRow = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  | "id"
  | "tenant_id"
  | "name"
  | "email"
  | "nip"
  | "employee_category"
  | "golongan"
  | "is_active"
> & {
  joined_date: string | null;
  opd: { name: string | null } | null;
  position: { name: string | null } | null;
};

type EmployeeStatus = "all" | "aktif" | "kontrak" | "magang" | "nonaktif";

type StatusAuditRow = Pick<
  Database["public"]["Tables"]["audit_logs"]["Row"],
  "record_id" | "created_at" | "new_values"
>;

type StatusUpdateFormState = {
  id: string;
  name: string;
  employee_category: string;
  is_active: boolean;
  effective_date: string;
  reason: string;
};

const STATUS_OPTIONS: Array<{ value: EmployeeStatus; label: string }> = [
  { value: "all", label: "Semua Status" },
  { value: "aktif", label: "Aktif" },
  { value: "kontrak", label: "Kontrak" },
  { value: "magang", label: "Magang" },
  { value: "nonaktif", label: "Nonaktif" },
];

const PAGE_SIZE = 10;
const initialFormState: StatusUpdateFormState = {
  id: "",
  name: "",
  employee_category: "",
  is_active: true,
  effective_date: new Date().toISOString().slice(0, 10),
  reason: "",
};

const readStatusAuditMeta = (row: StatusAuditRow) => {
  const payload = row.new_values;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { effective_date: null, reason: null };
  }
  const data = payload as Record<string, unknown>;
  return {
    effective_date: typeof data.effective_date === "string" ? data.effective_date : null,
    reason: typeof data.reason === "string" ? data.reason : null,
  };
};

export default function OrgHREmployeeStatus() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<StatusUpdateFormState>(initialFormState);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/employee-status");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data, error } = await supabase
        .from("employees")
        .select(`
          id,
          tenant_id,
          name,
          email,
          nip,
          employee_category,
          golongan,
          is_active,
          joined_date:created_at,
          opd:opd_id (name),
          position:position_id (name)
        `)
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (error) throw error;

      const employeeRows = (data || []) as EmployeeStatusQueryRow[];
      const employeeIds = employeeRows.map((item) => item.id);
      let latestAuditByEmployeeId = new Map<string, StatusAuditRow>();

      if (employeeIds.length > 0) {
        const { data: auditRows, error: auditError } = await supabase
          .from("audit_logs")
          .select("record_id, created_at, new_values")
          .eq("tenant_id", tenantId)
          .eq("table_name", "employees")
          .eq("action", "employee_status_update")
          .in("record_id", employeeIds)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (auditError) throw auditError;

        latestAuditByEmployeeId = new Map(
          ((auditRows || []) as StatusAuditRow[])
            .filter((item) => item.record_id)
            .map((item) => [item.record_id as string, item]),
        );
      }

      const formattedData = employeeRows.map((item) => {
        const latestAudit = latestAuditByEmployeeId.get(item.id) || null;
        const latestMeta = latestAudit ? readStatusAuditMeta(latestAudit) : { effective_date: null, reason: null };
        return {
        id: item.id,
        tenant_id: item.tenant_id,
        name: item.name,
        email: item.email,
        nip: item.nip,
        employee_category: item.employee_category,
        golongan: item.golongan,
        is_active: item.is_active,
        joined_date: item.joined_date,
        opd_name: item.opd?.name || null,
        position_name: item.position?.name || null,
        last_status_effective_date: latestMeta.effective_date,
        last_status_reason: latestMeta.reason,
        last_status_changed_at: latestAudit?.created_at || null,
      };
      });

      setRows(formattedData);
    } catch (error) {
      const ref = reportError(error, "org.hr.employee-status.fetch");
      toast.error(appendErrorReference("Gagal memuat status kepegawaian", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const getEmployeeStatus = (employee: EmployeeRow): string => {
    if (!employee.is_active) return "nonaktif";
    if (employee.employee_category === "PNS" || employee.employee_category === "Tetap") return "aktif";
    if (employee.employee_category === "Kontrak" || employee.employee_category === "PKWT") return "kontrak";
    if (employee.employee_category === "Magang" || employee.employee_category === "Internship") return "magang";
    return "aktif";
  };

  const keyword = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let result = rows;

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((item) => getEmployeeStatus(item) === statusFilter);
    }

    // Filter by category
    if (categoryFilter !== "all") {
      result = result.filter((item) => item.employee_category === categoryFilter);
    }

    // Filter by search
    if (keyword) {
      result = result.filter((item) =>
        [item.name, item.email, item.nip || "", item.employee_category || "", item.golongan || "", item.opd_name || "", item.position_name || ""]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      );
    }

    return result;
  }, [rows, keyword, statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    const statusCount = new Map<string, number>();
    const categoryCount = new Map<string, number>();

    rows.forEach((item) => {
      const status = getEmployeeStatus(item);
      statusCount.set(status, (statusCount.get(status) || 0) + 1);

      if (item.employee_category) {
        categoryCount.set(item.employee_category, (categoryCount.get(item.employee_category) || 0) + 1);
      }
    });

    return {
      total: rows.length,
      aktif: statusCount.get("aktif") || 0,
      kontrak: statusCount.get("kontrak") || 0,
      magang: statusCount.get("magang") || 0,
      nonaktif: statusCount.get("nonaktif") || 0,
      categories: Array.from(categoryCount.entries()),
    };
  }, [rows]);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(rows.map((item) => item.employee_category).filter(Boolean))) as string[];
  }, [rows]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(from, from + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, categoryFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleExport = () => {
    if (!access.canExport) {
      toast.error("Aksi ekspor status kepegawaian hanya tersedia untuk admin organisasi.");
      return;
    }
    const headers = ["No", "Nama", "Email", "NIP", "Status", "Kategori", "Golongan", "Unit Kerja", "Jabatan", "Tanggal Masuk"];
    const csvData = [headers.join(",")];

    filtered.forEach((item, index) => {
      const row = [
        index + 1,
        `"${item.name}"`,
        `"${item.email || ""}"`,
        `"${item.nip || ""}"`,
        getEmployeeStatus(item),
        `"${item.employee_category || ""}"`,
        `"${item.golongan || ""}"`,
        `"${item.opd_name || ""}"`,
        `"${item.position_name || ""}"`,
        `"${item.joined_date || ""}"`,
      ];
      csvData.push(row.join(","));
    });

    const blob = new Blob([csvData.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `status-kepegawaian-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Data berhasil diekspor ke CSV.");
  };

  const openStatusDialog = (employee: EmployeeRow) => {
    if (!access.canEdit) {
      toast.error("Aksi ubah status kepegawaian hanya tersedia untuk admin organisasi.");
      return;
    }
    setFormState({
      id: employee.id,
      name: employee.name,
      employee_category: employee.employee_category || "",
      is_active: employee.is_active !== false,
      effective_date: employee.last_status_effective_date || new Date().toISOString().slice(0, 10),
      reason: employee.last_status_reason || "",
    });
    setIsDialogOpen(true);
  };

  const handleSaveStatus = async () => {
    if (!access.canEdit) {
      toast.error("Aksi ubah status kepegawaian hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!formState.id) {
      toast.error("Pegawai tidak valid.");
      return;
    }

    const targetEmployee = rows.find((item) => item.id === formState.id);
    if (!targetEmployee) {
      toast.error("Data pegawai tidak ditemukan.");
      return;
    }

    const validationError = validateEmployeeStatusForm({
      employeeId: formState.id,
      employeeName: formState.name,
      employeeCategory: formState.employee_category,
      effectiveDate: formState.effective_date,
      reason: formState.reason,
      joinedDate: targetEmployee.joined_date,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      await fetchSupabaseRpc("update_org_hr_employee_status", {
        p_tenant_id: targetEmployee.tenant_id,
        p_employee_id: targetEmployee.id,
        p_payload: {
          employee_category: formState.employee_category.trim() || null,
          is_active: formState.is_active,
          effective_date: formState.effective_date,
          reason: formState.reason.trim(),
        },
      });

      toast.success("Status kepegawaian berhasil diperbarui.");
      setIsDialogOpen(false);
      setFormState(initialFormState);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.employee-status.save", { employee_id: formState.id });
      toast.error(appendErrorReference("Gagal menyimpan status kepegawaian", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pegawai</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Status Kepegawaian</h1>
          <p className="text-sm text-muted-foreground">
            Lihat dan filter pegawai berdasarkan status kepegawaian.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard
            title="Total Pegawai"
            value={stats.total}
            icon={Users}
            description="Semua pegawai"
            color="blue"
          />
          <StatCard
            title="Pegawai Aktif"
            value={stats.aktif}
            icon={UserCheck}
            description="Status: Aktif/PNS"
            color="green"
          />
          <StatCard
            title="Pegawai Kontrak"
            value={stats.kontrak}
            icon={Briefcase}
            description="Status: Kontrak/PKWT"
            color="orange"
          />
          <StatCard
            title="Pegawai Magang"
            value={stats.magang}
            icon={Briefcase}
            description="Status: Magang"
            color="purple"
          />
          <StatCard
            title="Pegawai Nonaktif"
            value={stats.nonaktif}
            icon={UserX}
            description="Status: Nonaktif"
            color="red"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daftar Pegawai Berdasarkan Status</CardTitle>
                <CardDescription>Filter dan cari pegawai berdasarkan status kepegawaian.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={isLoading || isSubmitting}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Muat Ulang
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={filtered.length === 0 || isLoadingAccess || !access.canExport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Ekspor CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, email, NIP, unit kerja..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EmployeeStatus)}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value)}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Semua Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {uniqueCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Memuat data...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Tidak ada pegawai yang sesuai dengan filter.
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Golongan</TableHead>
                    <TableHead>Unit Kerja</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Tanggal Masuk</TableHead>
                    <TableHead>Status Efektif</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((employee, index) => (
                    <TableRow key={employee.id}>
                      <TableCell>{(safePage - 1) * PAGE_SIZE + index + 1}</TableCell>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell className="font-mono text-xs">{employee.nip || "-"}</TableCell>
                      <TableCell>
                        <StatusBadge status={getEmployeeStatus(employee)} />
                      </TableCell>
                      <TableCell>
                        {employee.employee_category ? (
                          <Badge variant="outline">{employee.employee_category}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {employee.golongan ? (
                          <Badge variant="secondary">{employee.golongan}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{employee.opd_name || "-"}</TableCell>
                      <TableCell>{employee.position_name || "-"}</TableCell>
                      <TableCell>
                        {employee.joined_date ? (
                          new Date(employee.joined_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <CalendarClock className="h-3 w-3" />
                            <span>{employee.last_status_effective_date || "-"}</span>
                          </div>
                          <div className="text-muted-foreground">
                            Dicatat: {employee.last_status_changed_at ? new Date(employee.last_status_changed_at).toLocaleDateString("id-ID") : "-"}
                          </div>
                          <div className="max-w-[220px] truncate text-muted-foreground">
                            {employee.last_status_reason || "Belum ada catatan perubahan"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openStatusDialog(employee)} disabled={!access.canEdit}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Ubah Status
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safePage}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                itemLabel="pegawai"
                onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              />
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Perbarui Status Kepegawaian</DialogTitle>
              <DialogDescription>
                Simpan perubahan status dengan tanggal efektif dan alasan agar payroll-impact bisa ditelusuri.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Pegawai</Label>
                <Input value={formState.name} disabled />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-status-category">Kategori Pegawai</Label>
                <Input
                  id="employee-status-category"
                  value={formState.employee_category}
                  onChange={(event) => setFormState((prev) => ({ ...prev, employee_category: event.target.value }))}
                  placeholder="Mis. Tetap, Kontrak, PKWT, Magang"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-status-active">Status Aktif</Label>
                <Button
                  id="employee-status-active"
                  type="button"
                  variant={formState.is_active ? "default" : "secondary"}
                  className="justify-start"
                  onClick={() => setFormState((prev) => ({ ...prev, is_active: !prev.is_active }))}
                >
                  {formState.is_active ? "Aktif" : "Nonaktif"}
                </Button>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-status-effective">Tanggal Efektif</Label>
                <Input
                  id="employee-status-effective"
                  type="date"
                  value={formState.effective_date}
                  onChange={(event) => setFormState((prev) => ({ ...prev, effective_date: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-status-reason">Alasan Perubahan</Label>
                <Textarea
                  id="employee-status-reason"
                  value={formState.reason}
                  onChange={(event) => setFormState((prev) => ({ ...prev, reason: event.target.value }))}
                  placeholder="Mis. Perubahan status kontrak, pengangkatan tetap, offboarding, atau penonaktifan."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Batal
              </Button>
              <Button onClick={() => void handleSaveStatus()} disabled={isSubmitting}>
                Simpan Perubahan
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
    red: "text-red-600",
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

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    aktif: "default",
    kontrak: "outline",
    magang: "secondary",
    nonaktif: "destructive",
  };

  const labels: Record<string, string> = {
    aktif: "Aktif",
    kontrak: "Kontrak",
    magang: "Magang",
    nonaktif: "Nonaktif",
  };

  return (
    <Badge variant={variants[status] || "outline"}>
      {labels[status] || status}
    </Badge>
  );
}
