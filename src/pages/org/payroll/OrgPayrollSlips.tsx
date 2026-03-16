import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, PencilLine, Plus, Search, Send, Trash2 } from "lucide-react";
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

type PayrollSlip = Database["public"]["Tables"]["payroll_slips"]["Row"];
type PayrollSlipInsert = Database["public"]["Tables"]["payroll_slips"]["Insert"];
type PayrollSlipUpdate = Database["public"]["Tables"]["payroll_slips"]["Update"];
type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];
type Employee = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  "id" | "name" | "email" | "nik" | "tenant_id" | "is_active"
>;

type SlipStatus = "draft" | "generated" | "published" | "failed";

type SlipFormState = {
  run_id: string;
  employee_id: string;
  slip_number: string;
  status: SlipStatus;
  distribution_channel: "portal" | "email" | "whatsapp" | "manual";
  pdf_url: string;
  trace_id: string;
  notes: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: Array<{ value: SlipStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "generated", label: "Dibuat" },
  { value: "published", label: "Dipublikasikan" },
  { value: "failed", label: "Gagal" },
];

const STATUS_LABELS: Record<SlipStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<SlipStatus, string>;

const CHANNEL_OPTIONS = [
  { value: "portal", label: "Portal" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Manual" },
] as const;

const CHANNEL_LABELS: Record<(typeof CHANNEL_OPTIONS)[number]["value"], string> = Object.fromEntries(
  CHANNEL_OPTIONS.map((item) => [item.value, item.label]),
) as Record<(typeof CHANNEL_OPTIONS)[number]["value"], string>;

const initialFormState: SlipFormState = {
  run_id: "",
  employee_id: "all",
  slip_number: "",
  status: "draft",
  distribution_channel: "portal",
  pdf_url: "",
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

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

export default function OrgPayrollSlips() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<PayrollSlip[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<SlipFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SlipStatus>("all");
  const [runFilter, setRunFilter] = useState<"all" | string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const runMap = useMemo(() => new Map(runs.map((item) => [item.id, item])), [runs]);
  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);
  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [runRes, periodRes, employeeRes] = await Promise.all([
        supabase.from("payroll_runs").select("*").eq("tenant_id", resolvedTenantId).order("created_at", { ascending: false }).limit(200),
        supabase.from("payroll_periods").select("*").eq("tenant_id", resolvedTenantId).order("period_start", { ascending: false }),
        supabase
          .from("employees")
          .select("id, name, email, nik, tenant_id, is_active")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(200),
      ]);
      if (runRes.error) {
        reportError(runRes.error, "org.payroll.slips.fetch_runs", { tenant_id: resolvedTenantId });
        setRuns([]);
      } else {
        setRuns(runRes.data || []);
      }
      if (periodRes.error) {
        reportError(periodRes.error, "org.payroll.slips.fetch_periods", { tenant_id: resolvedTenantId });
        setPeriods([]);
      } else {
        setPeriods(periodRes.data || []);
      }
      if (employeeRes.error) {
        reportError(employeeRes.error, "org.payroll.slips.fetch_employees", { tenant_id: resolvedTenantId });
        setEmployees([]);
      } else {
        setEmployees((employeeRes.data || []) as Employee[]);
      }

      let query = supabase
        .from("payroll_slips")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (runFilter !== "all") query = query.eq("run_id", runFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const matchedRunIds = ((runRes.error ? [] : runRes.data) || [])
          .filter((run) => `${run.trace_id || ""} ${run.notes || ""}`.toLowerCase().includes(keyword.toLowerCase()))
          .map((run) => run.id);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["slip_number", "trace_id", "notes", "pdf_url"],
          inFilters: [{ field: "run_id", values: matchedRunIds }],
        });
        if (orClause) query = query.or(orClause);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;

      setRows(data || []);
      setTotalRows(count || 0);
    } catch (error) {
      const ref = reportError(error, "org.payroll.slips.fetch");
      const message = appendErrorReference("Gagal memuat slip gaji payroll", ref);
      setLoadError(message);
      toast.error(message);
      setRuns([]);
      setPeriods([]);
      setEmployees([]);
      setRows([]);
      setTotalRows(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, runFilter, searchTerm, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, runFilter]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      run_id: runs[0]?.id || "",
      slip_number: `SLIP-${Date.now()}`,
      trace_id: `SLP-${Date.now()}`,
    });
    setEditingId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: PayrollSlip) => {
    setEditingId(row.id);
    setFormState({
      run_id: row.run_id,
      employee_id: row.employee_id || "all",
      slip_number: row.slip_number,
      status: row.status as SlipStatus,
      distribution_channel: row.distribution_channel as SlipFormState["distribution_channel"],
      pdf_url: row.pdf_url || "",
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

      if (!formState.run_id || !formState.slip_number.trim()) {
        toast.error("Run payroll dan nomor slip wajib diisi");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollSlipInsert = {
        tenant_id: resolvedTenantId,
        run_id: formState.run_id,
        employee_id: formState.employee_id === "all" ? null : formState.employee_id,
        slip_number: formState.slip_number.trim().toUpperCase(),
        status: formState.status,
        distribution_channel: formState.distribution_channel,
        pdf_url: formState.pdf_url.trim() || null,
        trace_id: formState.trace_id.trim() || `SLP-${Date.now()}`,
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
        distributed_at: formState.status === "published" ? new Date().toISOString() : null,
      };

      if (editingId) {
        const updatePayload: PayrollSlipUpdate = {
          ...payload,
          tenant_id: undefined,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        const { error } = await supabase
          .from("payroll_slips")
          .update(updatePayload)
          .eq("id", editingId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_slips").insert(payload);
        if (error) throw error;
      }

      toast.success(`Slip payroll berhasil ${editingId ? "diperbarui" : "ditambahkan"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.slips.save");
      toast.error(appendErrorReference("Gagal menyimpan slip payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: PayrollSlip) => {
    if (!(await confirmDialog({
      title: "Hapus Slip Payroll",
      description: `Yakin ingin menghapus slip ${row.slip_number}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) return;

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { error } = await supabase
        .from("payroll_slips")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success("Slip payroll berhasil dihapus");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.slips.delete");
      toast.error(appendErrorReference("Gagal menghapus slip payroll", ref));
    }
  };

  const publishSlip = async (row: PayrollSlip) => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { error } = await supabase
        .from("payroll_slips")
        .update({
          status: "published",
          distributed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success("Slip payroll berhasil dipublish");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.slips.publish");
      toast.error(appendErrorReference("Gagal publish slip payroll", ref));
    }
  };

  const exportCsv = () => {
    const csv = [
      ["slip_number", "period", "run", "employee", "status", "channel", "trace_id", "pdf_url", "distributed_at"],
      ...rows.map((row) => {
        const run = runMap.get(row.run_id);
        const period = run ? periodMap.get(run.period_id) : null;
        const employee = row.employee_id ? employeeMap.get(row.employee_id)?.name || row.employee_id : "Semua Pegawai";
        return [
          row.slip_number,
          period?.period_key || "-",
          run ? `#${run.run_sequence}` : "-",
          employee,
          row.status,
          row.distribution_channel,
          row.trace_id || "",
          row.pdf_url || "",
          row.distributed_at || "",
        ];
      }),
    ]
      .map((line) => line.map((value) => toCsvSafe(value)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-slips-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV slip payroll berhasil");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Ditunda</Badge>
            <Badge variant="outline">Distribusi Payroll</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Slip Gaji & Distribusi</h1>
          <p className="text-sm text-muted-foreground">Generate, publish, dan lacak distribusi slip gaji payroll.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Status fitur</CardDescription>
              <CardTitle className="text-base">Slip masih tahap lanjutan</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Halaman ini tetap tampil sejak awal, tetapi distribusi slip belum menjadi fokus utama payroll sederhana.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Fokus penggunaan</CardDescription>
              <CardTitle className="text-base">Kelola metadata dan kanal distribusi</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Gunakan saat organisasi sudah siap mengelola nomor slip, status publikasi, dan kanal penyampaian ke pegawai.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Langkah terkait</CardDescription>
              <CardTitle className="text-base">Kembali ke persetujuan bila perlu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Pastikan proses dan persetujuan payroll sudah beres sebelum slip dipublikasikan.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/approval")}>
                Buka Persetujuan Payroll
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Slip Payroll</CardTitle>
            <CardDescription>Filter slip berdasarkan run dan status distribusi.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label htmlFor="search">Pencarian</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  className="pl-9"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari nomor slip, trace id, catatan, atau URL PDF..."
                />
              </div>
            </div>
            <div>
              <Label>Proses Payroll</Label>
              <Select value={runFilter} onValueChange={setRunFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Proses</SelectItem>
                  {runs.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {periodMap.get(run.period_id)?.period_key || "-"} • Run #{run.run_sequence}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Slip</CardTitle>
            <CardDescription>Kelola slip per run payroll dan saluran distribusinya.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/approval")}>
                <ArrowLeft className="mr-2 h-4 w-4" />Persetujuan Payroll
              </Button>
              <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Tambah Slip</Button>
              <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slip</TableHead>
                  <TableHead>Periode/Run</TableHead>
                  <TableHead>Pegawai</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Distribusi</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Memuat slip payroll...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Belum ada slip payroll.</TableCell></TableRow>
                ) : (
                  rows.map((row) => {
                    const run = runMap.get(row.run_id);
                    const period = run ? periodMap.get(run.period_id) : null;
                    const employee = row.employee_id ? employeeMap.get(row.employee_id)?.name || row.employee_id : "Semua Pegawai";
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium">{row.slip_number}</p>
                            <p className="text-xs text-muted-foreground font-mono">{row.trace_id || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p>{period?.period_key || "-"}</p>
                            <p className="text-xs text-muted-foreground">Run #{run?.run_sequence || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>{employee}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === "failed" ? "destructive" : row.status === "published" ? "default" : "secondary"}>
                            {STATUS_LABELS[row.status as SlipStatus] || row.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            <p>{CHANNEL_LABELS[row.distribution_channel as keyof typeof CHANNEL_LABELS] || row.distribution_channel}</p>
                            <p>{formatDateTime(row.distributed_at)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap gap-1 justify-end">
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(row)}><PencilLine className="h-4 w-4" /></Button>
                            {row.status !== "published" ? (
                              <Button variant="secondary" size="sm" onClick={() => publishSlip(row)}>
                                <Send className="mr-1 h-3.5 w-3.5" />Publikasikan
                              </Button>
                            ) : null}
                            <Button variant="destructive" size="icon" onClick={() => handleDelete(row)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} slip</span>
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
              <DialogTitle>{editingId ? "Edit Slip Payroll" : "Tambah Slip Payroll"}</DialogTitle>
              <DialogDescription>Kelola metadata slip dan kanal distribusi payroll.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Proses Payroll</Label>
                <Select value={formState.run_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, run_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih run" /></SelectTrigger>
                  <SelectContent>
                    {runs.map((run) => (
                      <SelectItem key={run.id} value={run.id}>
                        {periodMap.get(run.period_id)?.period_key || "-"} • Run #{run.run_sequence}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <Label htmlFor="slip_number">Nomor Slip</Label>
                  <Input id="slip_number" value={formState.slip_number} onChange={(event) => setFormState((prev) => ({ ...prev, slip_number: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as SlipStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Kanal Distribusi</Label>
                  <Select value={formState.distribution_channel} onValueChange={(value) => setFormState((prev) => ({ ...prev, distribution_channel: value as SlipFormState["distribution_channel"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNEL_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="pdf_url">URL PDF</Label>
                  <Input id="pdf_url" value={formState.pdf_url} onChange={(event) => setFormState((prev) => ({ ...prev, pdf_url: event.target.value }))} placeholder="https://..." />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="trace_id">Trace ID</Label>
                  <Input id="trace_id" value={formState.trace_id} onChange={(event) => setFormState((prev) => ({ ...prev, trace_id: event.target.value }))} />
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

        <OrgPayrollPageGuide pathname="/org/payroll/slips" />
      </div>
    </OrganizationLayout>
  );
}
