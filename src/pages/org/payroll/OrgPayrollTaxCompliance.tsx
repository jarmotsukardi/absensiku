import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Download, PencilLine, Plus, Search, Send, Trash2 } from "lucide-react";
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

type PayrollTaxFiling = Database["public"]["Tables"]["payroll_tax_filings"]["Row"];
type PayrollTaxFilingInsert = Database["public"]["Tables"]["payroll_tax_filings"]["Insert"];
type PayrollTaxFilingUpdate = Database["public"]["Tables"]["payroll_tax_filings"]["Update"];
type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type FilingStatus = "draft" | "calculated" | "submitted" | "paid" | "revised" | "failed";
type FilingType = "pph21" | "bpjs_kesehatan" | "bpjs_tk" | "other";

type FormState = {
  period_id: string;
  run_id: string;
  filing_code: string;
  filing_type: FilingType;
  status: FilingStatus;
  due_date: string;
  total_amount: string;
  trace_id: string;
  notes: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "calculated", label: "Dihitung" },
  { value: "submitted", label: "Dikirim" },
  { value: "paid", label: "Dibayar" },
  { value: "revised", label: "Direvisi" },
  { value: "failed", label: "Gagal" },
];

const STATUS_LABELS: Record<FilingStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<FilingStatus, string>;

const TYPE_OPTIONS: Array<{ value: FilingType; label: string }> = [
  { value: "pph21", label: "PPh21" },
  { value: "bpjs_kesehatan", label: "BPJS Kesehatan" },
  { value: "bpjs_tk", label: "BPJS TK" },
  { value: "other", label: "Lainnya" },
];

const initialFormState: FormState = {
  period_id: "all",
  run_id: "all",
  filing_code: "",
  filing_type: "pph21",
  status: "draft",
  due_date: "",
  total_amount: "0",
  trace_id: "",
  notes: "",
};

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

export default function OrgPayrollTaxCompliance() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [rows, setRows] = useState<PayrollTaxFiling[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FilingStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | FilingType>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);
  const runMap = useMemo(() => new Map(runs.map((item) => [item.id, item])), [runs]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [periodRes, runRes] = await Promise.all([
        supabase.from("payroll_periods").select("*").eq("tenant_id", resolvedTenantId).order("period_start", { ascending: false }),
        supabase.from("payroll_runs").select("*").eq("tenant_id", resolvedTenantId).order("created_at", { ascending: false }).limit(200),
      ]);
      if (periodRes.error) {
        reportError(periodRes.error, "org.payroll.tax_compliance.fetch_periods", { tenant_id: resolvedTenantId });
        setPeriods([]);
      } else {
        setPeriods(periodRes.data || []);
      }
      if (runRes.error) {
        reportError(runRes.error, "org.payroll.tax_compliance.fetch_runs", { tenant_id: resolvedTenantId });
        setRuns([]);
      } else {
        setRuns(runRes.data || []);
      }

      let query = supabase.from("payroll_tax_filings").select("*", { count: "exact" }).eq("tenant_id", resolvedTenantId);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (typeFilter !== "all") query = query.eq("filing_type", typeFilter);
      if (periodFilter !== "all") query = query.eq("period_id", periodFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const matchedRunIds = ((runRes.error ? [] : runRes.data) || [])
          .filter((run) => `${run.trace_id || ""} ${run.notes || ""}`.toLowerCase().includes(keyword.toLowerCase()))
          .map((run) => run.id);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["filing_code", "trace_id", "notes"],
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
      const ref = reportError(error, "org.payroll.tax_compliance.fetch");
      const message = appendErrorReference("Gagal memuat data pajak payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setRuns([]);
      setRows([]);
      setTotalRows(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, searchTerm, statusFilter, typeFilter, periodFilter, currentPage]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, typeFilter, periodFilter]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      period_id: periods[0]?.id || "all",
      run_id: runs[0]?.id || "all",
      filing_code: `TAX-${Date.now()}`,
      trace_id: `TAX-${Date.now()}`,
    });
    setEditingId(null);
  };

  const openCreateDialog = () => { resetForm(); setIsDialogOpen(true); };

  const openEditDialog = (row: PayrollTaxFiling) => {
    setEditingId(row.id);
    setFormState({
      period_id: row.period_id || "all",
      run_id: row.run_id || "all",
      filing_code: row.filing_code,
      filing_type: row.filing_type as FilingType,
      status: row.status as FilingStatus,
      due_date: row.due_date || "",
      total_amount: String(row.total_amount),
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

      const totalAmount = Number(formState.total_amount || "0");
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        toast.error("Total nominal pajak harus >= 0");
        return;
      }
      if (!formState.filing_code.trim()) {
        toast.error("Kode filing wajib diisi");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollTaxFilingInsert = {
        tenant_id: resolvedTenantId,
        period_id: formState.period_id === "all" ? null : formState.period_id,
        run_id: formState.run_id === "all" ? null : formState.run_id,
        filing_code: formState.filing_code.trim().toUpperCase(),
        filing_type: formState.filing_type,
        status: formState.status,
        due_date: formState.due_date || null,
        total_amount: totalAmount,
        trace_id: formState.trace_id.trim() || `TAX-${Date.now()}`,
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
        submitted_at: formState.status === "submitted" ? new Date().toISOString() : null,
        paid_at: formState.status === "paid" ? new Date().toISOString() : null,
      };

      if (editingId) {
        const updatePayload: PayrollTaxFilingUpdate = {
          ...payload,
          tenant_id: undefined,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        const { error } = await supabase.from("payroll_tax_filings").update(updatePayload).eq("id", editingId).eq("tenant_id", resolvedTenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_tax_filings").insert(payload);
        if (error) throw error;
      }

      toast.success(`Filing pajak berhasil ${editingId ? "diperbarui" : "ditambahkan"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.tax_compliance.save");
      toast.error(appendErrorReference("Gagal menyimpan filing pajak", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (row: PayrollTaxFiling, status: FilingStatus) => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const patch: PayrollTaxFilingUpdate = { status };
      if (status === "submitted") patch.submitted_at = new Date().toISOString();
      if (status === "paid") patch.paid_at = new Date().toISOString();
      const { error } = await supabase.from("payroll_tax_filings").update(patch).eq("id", row.id).eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success(`Status filing diubah ke ${status}`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.tax_compliance.update_status");
      toast.error(appendErrorReference("Gagal memperbarui status filing", ref));
    }
  };

  const handleDelete = async (row: PayrollTaxFiling) => {
    if (!(await confirmDialog({ title: "Hapus Filing Pajak", description: `Yakin ingin menghapus filing ${row.filing_code}?`, confirmText: "Ya, hapus", variant: "destructive" }))) return;
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const { error } = await supabase.from("payroll_tax_filings").delete().eq("id", row.id).eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success("Filing pajak berhasil dihapus");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.tax_compliance.delete");
      toast.error(appendErrorReference("Gagal menghapus filing pajak", ref));
    }
  };

  const exportCsv = () => {
    const csv = [
      ["filing_code", "type", "status", "period", "run", "due_date", "amount", "trace_id", "submitted_at", "paid_at"],
      ...rows.map((row) => {
        const period = row.period_id ? periodMap.get(row.period_id) : null;
        const run = row.run_id ? runMap.get(row.run_id) : null;
        return [
          row.filing_code,
          row.filing_type,
          row.status,
          period?.period_key || "-",
          run ? `#${run.run_sequence}` : "-",
          row.due_date || "",
          row.total_amount,
          row.trace_id || "",
          row.submitted_at || "",
          row.paid_at || "",
        ];
      }),
    ].map((line) => line.map((value) => toCsvSafe(value)).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-tax-filings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV pajak berhasil");
  };

  const summary = useMemo(() => ({
    dueSoon: rows.filter((item) => item.due_date && new Date(item.due_date).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000).length,
    submitted: rows.filter((item) => item.status === "submitted").length,
    paid: rows.filter((item) => item.status === "paid").length,
  }), [rows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Ditunda</Badge>
            <Badge variant="outline">Kepatuhan Payroll</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Pajak & Kepatuhan</h1>
          <p className="text-sm text-muted-foreground">Kelola filing pajak payroll dengan jejak trace_id untuk audit dan pelaporan.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Status fitur</CardDescription>
              <CardTitle className="text-base">Kepatuhan pajak masih tahap lanjutan</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Halaman ini tetap tampil sejak awal, tetapi pengelolaan filing pajak belum menjadi fokus payroll sederhana tahap awal.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Fungsi halaman</CardDescription>
              <CardTitle className="text-base">Rekam filing dan tenggat kepatuhan</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Gunakan untuk mencatat status pelaporan, nominal kewajiban, dan nomor referensi saat organisasi sudah siap mengelola compliance payroll.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Langkah terkait</CardDescription>
              <CardTitle className="text-base">Sambungkan ke hak akses dan audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Pastikan hanya peran yang tepat yang mengelola filing pajak, lalu gunakan audit log untuk menelusuri perubahannya.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/roles")}>
                Buka Hak Akses Payroll
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Jatuh Tempo < 7 Hari" value={summary.dueSoon} />
          <StatCard title="Dikirim" value={summary.submitted} />
          <StatCard title="Dibayar" value={summary.paid} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Filing</CardTitle>
            <CardDescription>Filter berdasarkan status, tipe pajak, dan periode payroll.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <Label htmlFor="search">Pencarian</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="search" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari filing code, trace_id, atau notes..." />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {STATUS_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipe</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {TYPE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Periode</Label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {periods.map((item) => <SelectItem key={item.id} value={item.id}>{item.period_key}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Filing Pajak</CardTitle>
            <CardDescription>Trace ID wajib dicatat agar triase cepat saat ada masalah kepatuhan payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/payment")}><ArrowLeft className="mr-2 h-4 w-4" />Pembayaran</Button>
              <Button variant="outline" onClick={() => navigate("/org/payroll/roles")}>Lanjut ke Hak Akses</Button>
              <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
              <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Tambah Filing</Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filing</TableHead>
                  <TableHead>Periode/Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Tenggat</TableHead>
                  <TableHead>Trace</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Memuat filing pajak...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Belum ada filing pajak</TableCell></TableRow>
                ) : rows.map((row) => {
                  const period = row.period_id ? periodMap.get(row.period_id) : null;
                  const run = row.run_id ? runMap.get(row.run_id) : null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.filing_code}</div>
                        <div className="text-xs text-muted-foreground">{row.filing_type}</div>
                      </TableCell>
                      <TableCell>
                        <div>{period?.period_key || "-"}</div>
                        <div className="text-xs text-muted-foreground">{run ? `Proses #${run.run_sequence}` : "-"}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{STATUS_LABELS[row.status as FilingStatus] || row.status}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(row.total_amount)}</TableCell>
                      <TableCell>{row.due_date || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.trace_id || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(row)}><PencilLine className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => updateStatus(row, "submitted")}><Send className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => updateStatus(row, "paid")}><CheckCircle2 className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => void handleDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} filing</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((v) => Math.max(1, v - 1))}>Sebelumnya</Button>
                <span>Halaman {currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((v) => Math.min(totalPages, v + 1))}>Berikutnya</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Filing Pajak" : "Tambah Filing Pajak"}</DialogTitle>
              <DialogDescription>Isi detail filing pajak. Sertakan trace_id untuk referensi operasional.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 md:grid-cols-2">
              <div>
                <Label>Kode Filing</Label>
                <Input className="mt-1.5" value={formState.filing_code} onChange={(e) => setFormState((prev) => ({ ...prev, filing_code: e.target.value }))} />
              </div>
              <div>
                <Label>Tipe Filing</Label>
                <Select value={formState.filing_type} onValueChange={(value) => setFormState((prev) => ({ ...prev, filing_type: value as FilingType }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as FilingStatus }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Periode</Label>
                <Select value={formState.period_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, period_id: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">(Opsional) Semua</SelectItem>
                    {periods.map((item) => <SelectItem key={item.id} value={item.id}>{item.period_key}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Proses Payroll</Label>
                <Select value={formState.run_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, run_id: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">(Opsional) Semua</SelectItem>
                    {runs.map((item) => <SelectItem key={item.id} value={item.id}>Proses #{item.run_sequence} ({item.status})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tenggat</Label>
                <Input type="date" className="mt-1.5" value={formState.due_date} onChange={(e) => setFormState((prev) => ({ ...prev, due_date: e.target.value }))} />
              </div>
              <div>
                <Label>Total Nominal</Label>
                <Input type="number" min="0" className="mt-1.5" value={formState.total_amount} onChange={(e) => setFormState((prev) => ({ ...prev, total_amount: e.target.value }))} />
              </div>
              <div>
                <Label>Trace ID</Label>
                <Input className="mt-1.5" value={formState.trace_id} onChange={(e) => setFormState((prev) => ({ ...prev, trace_id: e.target.value }))} placeholder="TAX-..." />
              </div>
              <div className="md:col-span-2">
                <Label>Catatan</Label>
                <Textarea className="mt-1.5" rows={3} value={formState.notes} onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Batal</Button>
              <Button onClick={handleSave} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OrgPayrollPageGuide pathname="/org/payroll/tax-compliance" />
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{title}</CardDescription></CardHeader>
      <CardContent><CardTitle className="text-2xl">{value}</CardTitle></CardContent>
    </Card>
  );
}
