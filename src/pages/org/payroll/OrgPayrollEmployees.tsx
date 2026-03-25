import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { buildOrgPayrollOverlayHref } from "@/lib/orgPayrollOverlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

type EmployeeRow = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  "id" | "name" | "email" | "nik" | "position" | "employee_category" | "is_active" | "tenant_id"
>;

type CompensationRow = Database["public"]["Tables"]["payroll_employee_compensations"]["Row"];

type CompensationFormState = {
  base_salary: string;
  ter_category: "A" | "B" | "C";
  jkk_risk_level: string;
  region_level: "UMP" | "UMK";
  region_code: string;
  region_name: string;
  effective_from: string;
  effective_to: string;
  is_active: boolean;
  notes: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const todayIso = () => new Date().toISOString().slice(0, 10);

const buildInitialFormState = (): CompensationFormState => ({
  base_salary: "0",
  ter_category: "A",
  jkk_risk_level: "",
  region_level: "UMP",
  region_code: "",
  region_name: "",
  effective_from: todayIso(),
  effective_to: "",
  is_active: true,
  notes: "",
});

export default function OrgPayrollEmployees() {
  const navigate = useNavigate();
  const location = useLocation();
  const confirmDialog = useConfirmDialog();
  const navigateWithOverlay = (target: string) =>
    navigate(buildOrgPayrollOverlayHref(location.pathname, location.search, target));

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [compensations, setCompensations] = useState<CompensationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(null);
  const [editingCompensation, setEditingCompensation] = useState<CompensationRow | null>(null);
  const [formState, setFormState] = useState<CompensationFormState>(buildInitialFormState());

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [employeeRes, compensationRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, email, nik, position, employee_category, is_active, tenant_id")
          .eq("tenant_id", resolvedTenantId)
          .order("name", { ascending: true }),
        supabase
          .from("payroll_employee_compensations")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("effective_from", { ascending: false }),
      ]);

      if (employeeRes.error) {
        reportError(employeeRes.error, "org.payroll.employees.fetch_employees", { tenant_id: resolvedTenantId });
        setEmployees([]);
      } else {
        setEmployees((employeeRes.data || []) as EmployeeRow[]);
      }

      if (compensationRes.error) {
        reportError(compensationRes.error, "org.payroll.employees.fetch_compensation", { tenant_id: resolvedTenantId });
        setCompensations([]);
      } else {
        setCompensations((compensationRes.data || []) as CompensationRow[]);
      }
    } catch (error) {
      const ref = reportError(error, "org.payroll.employees.fetch");
      const message = appendErrorReference("Gagal memuat kompensasi pegawai", ref);
      setLoadError(message);
      toast.error(message);
      setEmployees([]);
      setCompensations([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const compensationByEmployee = useMemo(() => {
    const map = new Map<string, CompensationRow>();
    compensations.forEach((row) => {
      if (!map.has(row.employee_id)) map.set(row.employee_id, row);
    });
    return map;
  }, [compensations]);

  const filteredEmployees = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return employees;
    return employees.filter((emp) => {
      const haystack = `${emp.name} ${emp.email || ""} ${emp.nik || ""} ${emp.position || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [employees, searchTerm]);

  const stats = useMemo(() => {
    const total = employees.length;
    const withComp = employees.filter((emp) => compensationByEmployee.has(emp.id)).length;
    return {
      total,
      withComp,
      missing: Math.max(0, total - withComp),
    };
  }, [employees, compensationByEmployee]);

  const openDialog = (employee: EmployeeRow) => {
    const existing = compensationByEmployee.get(employee.id) || null;
    setEditingEmployee(employee);
    setEditingCompensation(existing);
    setFormState(
      existing
        ? {
            base_salary: String(existing.base_salary ?? 0),
            ter_category: (existing.ter_category as "A" | "B" | "C") || "A",
            jkk_risk_level: existing.jkk_risk_level || "",
            region_level: (existing.region_level as "UMP" | "UMK") || "UMP",
            region_code: existing.region_code || "",
            region_name: existing.region_name || "",
            effective_from: existing.effective_from,
            effective_to: existing.effective_to || "",
            is_active: existing.is_active,
            notes: existing.notes || "",
          }
        : buildInitialFormState(),
    );
    setIsDialogOpen(true);
  };

  const validateDateRange = (from: string, to: string) => {
    if (to && new Date(to) < new Date(from)) {
      toast.error("Tanggal berakhir harus setelah tanggal mulai.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!editingEmployee) return;
    const baseSalary = Number(formState.base_salary);
    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      toast.error("Gaji pokok wajib angka >= 0.");
      return;
    }
    if (!validateDateRange(formState.effective_from, formState.effective_to)) return;

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        tenant_id: resolvedTenantId,
        employee_id: editingEmployee.id,
        base_salary: baseSalary,
        ter_category: formState.ter_category,
        jkk_risk_level: formState.jkk_risk_level.trim() || null,
        region_level: formState.region_level,
        region_code: formState.region_code.trim() || null,
        region_name: formState.region_name.trim() || null,
        effective_from: formState.effective_from,
        effective_to: formState.effective_to || null,
        is_active: formState.is_active,
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingCompensation) {
        const { error } = await supabase
          .from("payroll_employee_compensations")
          .update({ ...payload, created_by: undefined })
          .eq("id", editingCompensation.id)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        toast.success("Kompensasi pegawai berhasil diperbarui");
      } else {
        const { error } = await supabase.from("payroll_employee_compensations").insert(payload);
        if (error) throw error;
        toast.success("Kompensasi pegawai berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      setEditingEmployee(null);
      setEditingCompensation(null);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.employees.save");
      toast.error(appendErrorReference("Gagal menyimpan kompensasi pegawai", ref));
    }
  };

  const handleDelete = async () => {
    if (!editingCompensation || !editingEmployee) return;
    if (!(await confirmDialog({
      title: "Hapus Kompensasi",
      description: `Yakin ingin menghapus kompensasi ${editingEmployee.name}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) return;

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const { error } = await supabase
        .from("payroll_employee_compensations")
        .delete()
        .eq("id", editingCompensation.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success("Kompensasi pegawai berhasil dihapus");
      setIsDialogOpen(false);
      setEditingEmployee(null);
      setEditingCompensation(null);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.employees.delete");
      toast.error(appendErrorReference("Gagal menghapus kompensasi pegawai", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Kompensasi Pegawai Payroll</h1>
            <p className="text-sm text-muted-foreground">
              Lengkapi gaji pokok, kategori TER, dan parameter BPJS agar payroll otomatis bisa dihitung.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigateWithOverlay("/org/payroll")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Beranda
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Pegawai</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sudah Diisi</CardDescription>
              <CardTitle className="text-2xl text-emerald-600">{stats.withComp}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Belum Diisi</CardDescription>
              <CardTitle className="text-2xl text-amber-600">{stats.missing}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Pegawai</CardTitle>
            <CardDescription>
              Isi kompensasi per pegawai. Data ini menjadi dasar perhitungan payroll otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Cari pegawai..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat data pegawai...</p>
            ) : filteredEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada pegawai.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>NIK</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Gaji Pokok</TableHead>
                    <TableHead>TER</TableHead>
                    <TableHead>JKK</TableHead>
                    <TableHead>UMP/UMK</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp) => {
                    const compensation = compensationByEmployee.get(emp.id) || null;
                    return (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.email || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>{emp.nik}</TableCell>
                        <TableCell>{emp.employee_category || "-"}</TableCell>
                        <TableCell>{compensation ? formatCurrency(compensation.base_salary || 0) : "-"}</TableCell>
                        <TableCell>{compensation?.ter_category || "-"}</TableCell>
                        <TableCell>{compensation?.jkk_risk_level || "-"}</TableCell>
                        <TableCell>
                          {compensation?.region_level && compensation?.region_code
                            ? `${compensation.region_level} ${compensation.region_code}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={compensation ? "default" : "secondary"}>
                            {compensation ? "Lengkap" : "Belum"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => openDialog(emp)}>
                            {compensation ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <OrgPayrollPageGuide pathname="/org/payroll/employees" />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? `Kompensasi ${editingEmployee.name}` : "Kompensasi Pegawai"}</DialogTitle>
            <DialogDescription>Isi data gaji pokok dan parameter kepatuhan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Gaji Pokok</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={formState.base_salary}
                onChange={(event) => setFormState((prev) => ({ ...prev, base_salary: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Kategori TER</Label>
              <Select
                value={formState.ter_category}
                onValueChange={(value) => setFormState((prev) => ({ ...prev, ter_category: value as CompensationFormState["ter_category"] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Risk Level JKK</Label>
              <Input
                placeholder="Contoh: rendah/sedang/tinggi"
                value={formState.jkk_risk_level}
                onChange={(event) => setFormState((prev) => ({ ...prev, jkk_risk_level: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Level UMP/UMK</Label>
              <Select
                value={formState.region_level}
                onValueChange={(value) => setFormState((prev) => ({ ...prev, region_level: value as CompensationFormState["region_level"] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UMP">UMP</SelectItem>
                  <SelectItem value="UMK">UMK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kode Wilayah</Label>
              <Input
                value={formState.region_code}
                onChange={(event) => setFormState((prev) => ({ ...prev, region_code: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nama Wilayah</Label>
              <Input
                value={formState.region_name}
                onChange={(event) => setFormState((prev) => ({ ...prev, region_name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Efektif</Label>
              <Input
                type="date"
                value={formState.effective_from}
                onChange={(event) => setFormState((prev) => ({ ...prev, effective_from: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Berakhir (opsional)</Label>
              <Input
                type="date"
                value={formState.effective_to}
                onChange={(event) => setFormState((prev) => ({ ...prev, effective_to: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Aktif</Label>
              <Switch checked={formState.is_active} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, is_active: checked }))} />
            </div>
            <Textarea
              rows={3}
              placeholder="Catatan (opsional)"
              value={formState.notes}
              onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            {editingCompensation ? (
              <Button variant="destructive" onClick={() => void handleDelete()}>
                Hapus
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()}>Simpan</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
