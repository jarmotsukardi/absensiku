import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { buildPostgrestOrClause, sanitizeOrKeyword } from "@/lib/postgrestSearch";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type PayrollVariableInput = Database["public"]["Tables"]["payroll_variable_inputs"]["Row"];
type PayrollVariableInputInsert = Database["public"]["Tables"]["payroll_variable_inputs"]["Insert"];
type PayrollVariableInputUpdate = Database["public"]["Tables"]["payroll_variable_inputs"]["Update"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];
type Employee = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  "id" | "name" | "email" | "nik" | "tenant_id" | "is_active"
>;

type VariableInputSortKey = "created_at" | "amount" | "input_type" | "component_scope";

type VariableInputFormState = {
  period_id: string;
  employee_id: string;
  component_scope: "income" | "deduction";
  component_code: string;
  component_name: string;
  input_type: string;
  amount: string;
  source: string;
  trace_id: string;
  notes: string;
};

const ITEMS_PER_PAGE = 10;

const INPUT_TYPE_OPTIONS = [
  { value: "bonus", label: "Bonus" },
  { value: "overtime", label: "Lembur" },
  { value: "correction", label: "Koreksi" },
  { value: "allowance", label: "Tunjangan" },
  { value: "deduction_adjustment", label: "Penyesuaian Potongan" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Lainnya" },
];

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "import", label: "Import" },
  { value: "integration", label: "Integrasi" },
  { value: "system", label: "Sistem" },
];

const initialFormState: VariableInputFormState = {
  period_id: "",
  employee_id: "all",
  component_scope: "income",
  component_code: "",
  component_name: "",
  input_type: "adjustment",
  amount: "0",
  source: "manual",
  trace_id: "",
  notes: "",
};

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const SCOPE_LABELS: Record<"income" | "deduction", string> = {
  income: "Penghasilan",
  deduction: "Potongan",
};

const INPUT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  INPUT_TYPE_OPTIONS.map((item) => [item.value, item.label]),
);

export default function OrgPayrollVariableInput() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<PayrollVariableInput[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<VariableInputFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodFilter, setPeriodFilter] = useState<"all" | string>("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "income" | "deduction">("all");
  const [sortBy, setSortBy] = useState<VariableInputSortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);
  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [periodRes, variableInputRes, employeeRes] = await Promise.all([
        supabase
          .from("payroll_periods")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("period_start", { ascending: false }),
        (() => {
          let query = supabase
            .from("payroll_variable_inputs")
            .select("*", { count: "exact" })
            .eq("tenant_id", resolvedTenantId);

          if (periodFilter !== "all") query = query.eq("period_id", periodFilter);
          if (scopeFilter !== "all") query = query.eq("component_scope", scopeFilter);

          const keyword = sanitizeOrKeyword(searchTerm);
          if (keyword.length > 0) {
            const orClause = buildPostgrestOrClause({
              keyword,
              ilikeFields: ["component_code", "component_name", "trace_id", "notes", "input_type", "source"],
            });
            if (orClause) query = query.or(orClause);
          }

          const from = (currentPage - 1) * ITEMS_PER_PAGE;
          const to = from + ITEMS_PER_PAGE - 1;
          return query
            .order(sortBy, { ascending: sortDir === "asc" })
            .order("created_at", { ascending: false })
            .range(from, to);
        })(),
        supabase
          .from("employees")
          .select("id, name, email, nik, tenant_id, is_active")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(100),
      ]);

      if (periodRes.error) throw periodRes.error;
      if (variableInputRes.error) throw variableInputRes.error;

      setPeriods(periodRes.data || []);
      setRows(variableInputRes.data || []);
      setTotalRows(variableInputRes.count || 0);

      if (employeeRes.error) {
        reportError(employeeRes.error, "org.payroll.variable_input.fetch_employees", { tenant_id: resolvedTenantId });
        setEmployees([]);
      } else {
        setEmployees((employeeRes.data || []) as Employee[]);
      }
    } catch (error) {
      const ref = reportError(error, "org.payroll.variable_input.fetch");
      const message = appendErrorReference("Gagal memuat input variabel payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setEmployees([]);
      setRows([]);
      setTotalRows(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, periodFilter, scopeFilter, searchTerm, sortBy, sortDir, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, periodFilter, scopeFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState((prev) => ({
      ...initialFormState,
      period_id: periods[0]?.id || "",
      employee_id: "all",
      component_scope: prev.component_scope,
    }));
    setEditingId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: PayrollVariableInput) => {
    setEditingId(row.id);
    setFormState({
      period_id: row.period_id,
      employee_id: row.employee_id || "all",
      component_scope: row.component_scope as "income" | "deduction",
      component_code: row.component_code,
      component_name: row.component_name,
      input_type: row.input_type,
      amount: String(row.amount),
      source: row.source,
      trace_id: row.trace_id || "",
      notes: row.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const amount = Number(formState.amount);
      if (!Number.isFinite(amount)) {
        toast.error("Nominal harus angka yang valid");
        return;
      }
      if (!formState.period_id || !formState.component_code.trim() || !formState.component_name.trim()) {
        toast.error("Periode, kode komponen, dan nama komponen wajib diisi");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollVariableInputInsert = {
        tenant_id: resolvedTenantId,
        period_id: formState.period_id,
        employee_id: formState.employee_id === "all" ? null : formState.employee_id,
        component_scope: formState.component_scope,
        component_code: formState.component_code.trim().toUpperCase(),
        component_name: formState.component_name.trim(),
        input_type: formState.input_type,
        amount,
        source: formState.source,
        trace_id: (formState.trace_id.trim() || `PVI-${Date.now()}`).slice(0, 120),
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingId) {
        const updatePayload: PayrollVariableInputUpdate = {
          ...payload,
          tenant_id: undefined,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        const { error } = await supabase
          .from("payroll_variable_inputs")
          .update(updatePayload)
          .eq("id", editingId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_variable_inputs").insert(payload);
        if (error) throw error;
      }

      toast.success(`Input variabel payroll berhasil ${editingId ? "diperbarui" : "ditambahkan"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.variable_input.save");
      toast.error(appendErrorReference("Gagal menyimpan input variabel payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: PayrollVariableInput) => {
    if (!(await confirmDialog({
      title: "Hapus Input Variabel",
      description: `Yakin ingin menghapus ${row.component_code} (${row.component_name})?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) {
      return;
    }

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { error } = await supabase
        .from("payroll_variable_inputs")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success("Input variabel payroll berhasil dihapus");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.variable_input.delete");
      toast.error(appendErrorReference("Gagal menghapus input variabel payroll", ref));
    }
  };

  const exportCsv = () => {
    const csv = [
      ["period_key", "employee", "scope", "component_code", "component_name", "input_type", "amount", "source", "trace_id", "notes"],
      ...rows.map((row) => [
        periodMap.get(row.period_id)?.period_key || "-",
        row.employee_id ? employeeMap.get(row.employee_id)?.name || row.employee_id : "Semua Pegawai",
        row.component_scope,
        row.component_code,
        row.component_name,
        row.input_type,
        row.amount,
        row.source,
        row.trace_id || "",
        row.notes || "",
      ]),
    ]
      .map((line) => line.map((value) => toCsvSafe(value)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-variable-input-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV input variabel berhasil");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Inti</Badge>
            <Badge variant="outline">Input Variabel</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Input Variabel Bulanan</h1>
          <p className="text-sm text-muted-foreground">
            Masukkan komponen non-rutin seperti bonus, lembur, koreksi, dan penyesuaian sebelum validasi payroll.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total input variabel</CardDescription>
              <CardTitle className="text-2xl">{totalRows}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Gunakan data ini untuk melengkapi kebutuhan payroll yang tidak otomatis berasal dari HR atau absensi.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fokus tahap ini</CardDescription>
              <CardTitle className="text-lg">Data non-rutin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Pastikan komponen, nominal, periode, dan target pegawai sudah tepat sebelum masuk ke validasi.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Langkah berikutnya</CardDescription>
              <CardTitle className="text-lg">Validasi Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/validation")}>
                Buka Validasi Payroll
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Input Variabel</CardTitle>
            <CardDescription>
              Gunakan filter untuk memastikan data variabel siap dipakai sebelum validasi dan proses payroll.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <Label htmlFor="search">Pencarian</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  className="pl-9"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari kode, nama komponen, trace id, atau catatan..."
                />
              </div>
            </div>
            <div>
              <Label>Periode</Label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Periode</SelectItem>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>{period.period_key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Jenis Komponen</Label>
              <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as typeof scopeFilter)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="income">Penghasilan</SelectItem>
                  <SelectItem value="deduction">Potongan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Urutkan</Label>
              <Select value={`${sortBy}:${sortDir}`} onValueChange={(value) => {
                const [nextSortBy, nextSortDir] = value.split(":");
                setSortBy(nextSortBy as VariableInputSortKey);
                setSortDir(nextSortDir as "asc" | "desc");
              }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at:desc">Terbaru</SelectItem>
                  <SelectItem value="created_at:asc">Terlama</SelectItem>
                  <SelectItem value="amount:desc">Nominal DESC</SelectItem>
                  <SelectItem value="amount:asc">Nominal ASC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Variabel</CardTitle>
            <CardDescription>Data variabel yang akan dipakai pada proses payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/periods")}>
                <ArrowLeft className="mr-2 h-4 w-4" />Periode Payroll
              </Button>
              <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Tambah Input</Button>
              <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Komponen</TableHead>
                  <TableHead>Pegawai</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Trace</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Memuat input variabel...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Belum ada input variabel payroll.</TableCell></TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{periodMap.get(row.period_id)?.period_key || "-"}</TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium">{row.component_code}</p>
                          <p className="text-xs text-muted-foreground">{row.component_name}</p>
                        </div>
                      </TableCell>
                      <TableCell>{row.employee_id ? employeeMap.get(row.employee_id)?.name || row.employee_id : "Semua Pegawai"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="mr-1">
                          {SCOPE_LABELS[row.component_scope as "income" | "deduction"] || row.component_scope}
                        </Badge>
                        <Badge variant="outline">{INPUT_TYPE_LABELS[row.input_type] || row.input_type}</Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(Number(row.amount))}</TableCell>
                      <TableCell className="font-mono text-xs">{row.trace_id || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(row)}><PencilLine className="h-4 w-4" /></Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDelete(row)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} data</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</Button>
                <span>{currentPage}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>Berikutnya</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Input Variabel" : "Tambah Input Variabel"}</DialogTitle>
              <DialogDescription>
                Isi data variabel yang akan dihitung pada periode payroll terkait.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Periode Payroll</Label>
                <Select value={formState.period_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, period_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih periode" /></SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem key={period.id} value={period.id}>{period.period_key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Jenis Komponen</Label>
                  <Select value={formState.component_scope} onValueChange={(value) => setFormState((prev) => ({ ...prev, component_scope: value as "income" | "deduction" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Penghasilan</SelectItem>
                      <SelectItem value="deduction">Potongan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Tipe Input</Label>
                  <Select value={formState.input_type} onValueChange={(value) => setFormState((prev) => ({ ...prev, input_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INPUT_TYPE_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="component_code">Kode Komponen</Label>
                  <Input id="component_code" value={formState.component_code} onChange={(event) => setFormState((prev) => ({ ...prev, component_code: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="component_name">Nama Komponen</Label>
                  <Input id="component_name" value={formState.component_name} onChange={(event) => setFormState((prev) => ({ ...prev, component_name: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Pegawai (opsional)</Label>
                  <Select value={formState.employee_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, employee_id: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Pegawai</SelectItem>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="amount">Nominal</Label>
                  <Input id="amount" type="number" value={formState.amount} onChange={(event) => setFormState((prev) => ({ ...prev, amount: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Sumber</Label>
                  <Select value={formState.source} onValueChange={(value) => setFormState((prev) => ({ ...prev, source: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="trace_id">Trace ID</Label>
                  <Input id="trace_id" value={formState.trace_id} onChange={(event) => setFormState((prev) => ({ ...prev, trace_id: event.target.value }))} placeholder="Opsional, auto-generate jika kosong" />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Catatan</Label>
                <Textarea id="notes" rows={3} value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={handleSave} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OrgPayrollPageGuide pathname="/org/payroll/variable-input" />
      </div>
    </OrganizationLayout>
  );
}
