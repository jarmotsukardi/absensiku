import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Download, PencilLine, Plus, Search, XCircle } from "lucide-react";
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
import { fetchSupabaseRest } from "@/lib/supabaseRestClient";

type PayrollPaymentBatch = Database["public"]["Tables"]["payroll_payment_batches"]["Row"];
type PayrollPaymentBatchInsert = Database["public"]["Tables"]["payroll_payment_batches"]["Insert"];
type PayrollPaymentBatchUpdate = Database["public"]["Tables"]["payroll_payment_batches"]["Update"];
type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type PaymentStatus = "draft" | "queued" | "processing" | "completed" | "failed" | "reconciled";

type PaymentFormState = {
  run_id: string;
  batch_number: string;
  bank_name: string;
  bank_file_url: string;
  total_employees: string;
  total_amount: string;
  payment_status: PaymentStatus;
  trace_id: string;
  notes: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: Array<{ value: PaymentStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "queued", label: "Antre" },
  { value: "processing", label: "Diproses" },
  { value: "completed", label: "Selesai" },
  { value: "failed", label: "Gagal" },
  { value: "reconciled", label: "Terekonsiliasi" },
];

const STATUS_LABELS: Record<PaymentStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PaymentStatus, string>;

const initialFormState: PaymentFormState = {
  run_id: "",
  batch_number: "",
  bank_name: "",
  bank_file_url: "",
  total_employees: "0",
  total_amount: "0",
  payment_status: "draft",
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

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

export default function OrgPayrollPayment() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [rows, setRows] = useState<PayrollPaymentBatch[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PaymentFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [runFilter, setRunFilter] = useState<"all" | string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const runMap = useMemo(() => new Map(runs.map((item) => [item.id, item])), [runs]);
  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [runRes, periodRes] = await Promise.all([
        supabase.from("payroll_runs").select("*").eq("tenant_id", resolvedTenantId).order("created_at", { ascending: false }).limit(200),
        supabase.from("payroll_periods").select("*").eq("tenant_id", resolvedTenantId).order("period_start", { ascending: false }),
      ]);
      if (runRes.error) {
        reportError(runRes.error, "org.payroll.payment.fetch_runs", { tenant_id: resolvedTenantId });
        setRuns([]);
      } else {
        setRuns(runRes.data || []);
      }
      if (periodRes.error) {
        reportError(periodRes.error, "org.payroll.payment.fetch_periods", { tenant_id: resolvedTenantId });
        setPeriods([]);
      } else {
        setPeriods(periodRes.data || []);
      }

      let query = supabase
        .from("payroll_payment_batches")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("payment_status", statusFilter);
      if (runFilter !== "all") query = query.eq("run_id", runFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const matchedRunIds = ((runRes.error ? [] : runRes.data) || [])
          .filter((run) => `${run.trace_id || ""} ${run.notes || ""}`.toLowerCase().includes(keyword.toLowerCase()))
          .map((run) => run.id);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["batch_number", "bank_name", "trace_id", "notes", "bank_file_url"],
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
      const ref = reportError(error, "org.payroll.payment.fetch");
      const message = appendErrorReference("Gagal memuat data pembayaran payroll", ref);
      setLoadError(message);
      toast.error(message);
      setRuns([]);
      setPeriods([]);
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
      batch_number: `BATCH-${Date.now()}`,
      trace_id: `PAY-${Date.now()}`,
    });
    setEditingId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: PayrollPaymentBatch) => {
    setEditingId(row.id);
    setFormState({
      run_id: row.run_id,
      batch_number: row.batch_number,
      bank_name: row.bank_name || "",
      bank_file_url: row.bank_file_url || "",
      total_employees: String(row.total_employees),
      total_amount: String(row.total_amount),
      payment_status: row.payment_status as PaymentStatus,
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

      const totalEmployees = Number(formState.total_employees || "0");
      const totalAmount = Number(formState.total_amount || "0");
      if (!Number.isInteger(totalEmployees) || totalEmployees < 0) {
        toast.error("Total pegawai harus bilangan bulat >= 0");
        return;
      }
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        toast.error("Total nominal harus >= 0");
        return;
      }
      if (!formState.run_id || !formState.batch_number.trim()) {
        toast.error("Run payroll dan nomor batch wajib diisi");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollPaymentBatchInsert = {
        tenant_id: resolvedTenantId,
        run_id: formState.run_id,
        batch_number: formState.batch_number.trim().toUpperCase(),
        bank_name: formState.bank_name.trim() || null,
        bank_file_url: formState.bank_file_url.trim() || null,
        total_employees: totalEmployees,
        total_amount: totalAmount,
        payment_status: formState.payment_status,
        trace_id: formState.trace_id.trim() || `PAY-${Date.now()}`,
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
        paid_at: formState.payment_status === "completed" ? new Date().toISOString() : null,
        reconciled_at: formState.payment_status === "reconciled" ? new Date().toISOString() : null,
      };

      if (editingId) {
        const updatePayload: PayrollPaymentBatchUpdate = {
          ...payload,
          tenant_id: undefined,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        await fetchSupabaseRest<null>("payroll_payment_batches", {
          method: "PATCH",
          params: {
            id: `eq.${editingId}`,
            tenant_id: `eq.${resolvedTenantId}`,
          },
          body: updatePayload,
        });
      } else {
        await fetchSupabaseRest<null>("payroll_payment_batches", {
          method: "POST",
          body: payload,
        });
      }

      toast.success(`Batch pembayaran berhasil ${editingId ? "diperbarui" : "ditambahkan"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.payment.save");
      toast.error(appendErrorReference("Gagal menyimpan batch pembayaran payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updatePaymentStatus = async (row: PayrollPaymentBatch, status: PaymentStatus) => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const patch: PayrollPaymentBatchUpdate = {
        payment_status: status,
      };
      if (status === "completed") patch.paid_at = new Date().toISOString();
      if (status === "reconciled") patch.reconciled_at = new Date().toISOString();

      await fetchSupabaseRest<null>("payroll_payment_batches", {
        method: "PATCH",
        params: {
          id: `eq.${row.id}`,
          tenant_id: `eq.${resolvedTenantId}`,
        },
        body: patch,
      });

      toast.success(`Status pembayaran diubah ke ${status}`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.payment.update_status");
      toast.error(appendErrorReference("Gagal memperbarui status pembayaran", ref));
    }
  };

  const exportCsv = () => {
    const csv = [
      ["batch_number", "period", "run", "status", "bank", "total_employees", "total_amount", "trace_id", "paid_at", "reconciled_at"],
      ...rows.map((row) => {
        const run = runMap.get(row.run_id);
        const period = run ? periodMap.get(run.period_id) : null;
        return [
          row.batch_number,
          period?.period_key || "-",
          run ? `#${run.run_sequence}` : "-",
          row.payment_status,
          row.bank_name || "",
          row.total_employees,
          row.total_amount,
          row.trace_id || "",
          row.paid_at || "",
          row.reconciled_at || "",
        ];
      }),
    ]
      .map((line) => line.map((value) => toCsvSafe(value)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-payment-batches-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV pembayaran payroll berhasil");
  };

  const summary = useMemo(() => {
    return {
      draft: rows.filter((item) => item.payment_status === "draft").length,
      processing: rows.filter((item) => item.payment_status === "processing").length,
      completed: rows.filter((item) => item.payment_status === "completed").length,
      reconciled: rows.filter((item) => item.payment_status === "reconciled").length,
    };
  }, [rows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Pembayaran & Bank File</h1>
          <p className="text-sm text-muted-foreground">Kelola batch pembayaran payroll, status transfer, dan rekonsiliasi.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Status fitur</CardDescription>
              <CardTitle className="text-base">Pembayaran belum menjadi fokus awal</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Menu ini tetap tampil untuk memberi gambaran roadmap, tetapi pembayaran batch belum termasuk inti payroll sederhana tahap awal.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Fungsi halaman</CardDescription>
              <CardTitle className="text-base">Kelola batch transfer dan rekonsiliasi</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Gunakan saat organisasi sudah siap mengelola bank file, status transfer, dan pencocokan hasil pembayaran.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Langkah terkait</CardDescription>
              <CardTitle className="text-base">Cocokkan dengan slip dan laporan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Setelah batch pembayaran siap, cocokkan kembali dengan slip payroll dan ringkasan laporan sebelum ditutup.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/slips")}>
                Buka Slip Payroll
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Draft" value={summary.draft} />
          <StatCard title="Diproses" value={summary.processing} />
          <StatCard title="Selesai" value={summary.completed} />
          <StatCard title="Terekonsiliasi" value={summary.reconciled} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Batch Pembayaran</CardTitle>
            <CardDescription>Filter batch berdasarkan run dan status pembayaran.</CardDescription>
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
                  placeholder="Cari nomor batch, bank, trace id, atau catatan..."
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
            <CardTitle>Batch Pembayaran</CardTitle>
            <CardDescription>Rekam bank file payroll dan update status pembayaran sampai rekonsiliasi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/slips")}>
                <ArrowLeft className="mr-2 h-4 w-4" />Slip Payroll
              </Button>
              <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Tambah Batch</Button>
              <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Periode/Run</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Memuat batch pembayaran...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Belum ada batch pembayaran payroll.</TableCell></TableRow>
                ) : (
                  rows.map((row) => {
                    const run = runMap.get(row.run_id);
                    const period = run ? periodMap.get(run.period_id) : null;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium">{row.batch_number}</p>
                            <p className="text-xs text-muted-foreground">{row.bank_name || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p>{period?.period_key || "-"}</p>
                            <p className="text-xs text-muted-foreground">Run #{run?.run_sequence || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p>{formatCurrency(Number(row.total_amount))}</p>
                            <p className="text-xs text-muted-foreground">{row.total_employees} pegawai</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.payment_status === "failed" ? "destructive" : row.payment_status === "reconciled" ? "default" : "secondary"}>
                            {STATUS_LABELS[row.payment_status as PaymentStatus] || row.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <p>Dibayar: {formatDateTime(row.paid_at)}</p>
                          <p>Rekonsiliasi: {formatDateTime(row.reconciled_at)}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(row)}><PencilLine className="h-4 w-4" /></Button>
                            {row.payment_status === "draft" ? (
                              <Button variant="secondary" size="sm" onClick={() => updatePaymentStatus(row, "queued")}>Antrekan</Button>
                            ) : null}
                            {row.payment_status === "queued" ? (
                              <Button variant="secondary" size="sm" onClick={() => updatePaymentStatus(row, "processing")}>Proses</Button>
                            ) : null}
                            {row.payment_status === "processing" ? (
                              <Button variant="secondary" size="sm" onClick={() => updatePaymentStatus(row, "completed")}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Selesai
                              </Button>
                            ) : null}
                            {row.payment_status === "completed" ? (
                              <Button variant="secondary" size="sm" onClick={() => updatePaymentStatus(row, "reconciled")}>Rekonsiliasi</Button>
                            ) : null}
                            {row.payment_status !== "reconciled" ? (
                              <Button variant="destructive" size="sm" onClick={() => updatePaymentStatus(row, "failed")}>
                                <XCircle className="mr-1 h-3.5 w-3.5" />Gagal
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} batch</span>
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
              <DialogTitle>{editingId ? "Edit Batch Pembayaran" : "Tambah Batch Pembayaran"}</DialogTitle>
              <DialogDescription>Isi metadata bank file dan nominal pembayaran payroll.</DialogDescription>
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
                  <Label htmlFor="batch_number">Nomor Batch</Label>
                  <Input id="batch_number" value={formState.batch_number} onChange={(event) => setFormState((prev) => ({ ...prev, batch_number: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bank_name">Nama Bank</Label>
                  <Input id="bank_name" value={formState.bank_name} onChange={(event) => setFormState((prev) => ({ ...prev, bank_name: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="bank_file_url">URL Bank File</Label>
                <Input id="bank_file_url" value={formState.bank_file_url} onChange={(event) => setFormState((prev) => ({ ...prev, bank_file_url: event.target.value }))} placeholder="https://..." />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="total_employees">Total Pegawai</Label>
                  <Input id="total_employees" type="number" min={0} value={formState.total_employees} onChange={(event) => setFormState((prev) => ({ ...prev, total_employees: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="total_amount">Total Nominal</Label>
                  <Input id="total_amount" type="number" min={0} value={formState.total_amount} onChange={(event) => setFormState((prev) => ({ ...prev, total_amount: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={formState.payment_status} onValueChange={(value) => setFormState((prev) => ({ ...prev, payment_status: value as PaymentStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

        <OrgPayrollPageGuide pathname="/org/payroll/payment" />
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
