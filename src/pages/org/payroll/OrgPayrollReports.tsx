import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Download, PencilLine, Plus, Search, Sparkles, Trash2 } from "lucide-react";
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

type PayrollReportSnapshot = Database["public"]["Tables"]["payroll_report_snapshots"]["Row"];
type PayrollReportSnapshotInsert = Database["public"]["Tables"]["payroll_report_snapshots"]["Insert"];
type PayrollReportSnapshotUpdate = Database["public"]["Tables"]["payroll_report_snapshots"]["Update"];
type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type ReportStatus = "draft" | "generated" | "published" | "archived" | "failed";
type ReportType = "summary" | "cost_center" | "bank_transfer" | "tax" | "journal" | "custom";

type FormState = {
  period_id: string;
  run_id: string;
  report_type: ReportType;
  snapshot_name: string;
  status: ReportStatus;
  file_url: string;
  trace_id: string;
  log_id: string;
  notes: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: Array<{ value: ReportStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "generated", label: "Dibuat" },
  { value: "published", label: "Dipublikasikan" },
  { value: "archived", label: "Arsip" },
  { value: "failed", label: "Gagal" },
];

const TYPE_OPTIONS: Array<{ value: ReportType; label: string }> = [
  { value: "summary", label: "Ringkasan" },
  { value: "cost_center", label: "Pusat Biaya" },
  { value: "bank_transfer", label: "Transfer Bank" },
  { value: "tax", label: "Pajak" },
  { value: "journal", label: "Jurnal" },
  { value: "custom", label: "Kustom" },
];

const initialFormState: FormState = {
  period_id: "all",
  run_id: "all",
  report_type: "summary",
  snapshot_name: "",
  status: "draft",
  file_url: "",
  trace_id: "",
  log_id: "",
  notes: "",
};

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  generated: "Dibuat",
  published: "Dipublikasikan",
  archived: "Arsip",
  failed: "Gagal",
};

const REPORT_TYPE_LABELS: Record<ReportType, string> = Object.fromEntries(
  TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ReportType, string>;

export default function OrgPayrollReports() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [rows, setRows] = useState<PayrollReportSnapshot[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | ReportType>("all");
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
        reportError(periodRes.error, "org.payroll.reports.fetch_periods", { tenant_id: resolvedTenantId });
        setPeriods([]);
      } else {
        setPeriods(periodRes.data || []);
      }
      if (runRes.error) {
        reportError(runRes.error, "org.payroll.reports.fetch_runs", { tenant_id: resolvedTenantId });
        setRuns([]);
      } else {
        setRuns(runRes.data || []);
      }

      let query = supabase.from("payroll_report_snapshots").select("*", { count: "exact" }).eq("tenant_id", resolvedTenantId);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (typeFilter !== "all") query = query.eq("report_type", typeFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["snapshot_name", "trace_id", "log_id", "notes", "file_url"],
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
      const ref = reportError(error, "org.payroll.reports.fetch");
      const message = appendErrorReference("Gagal memuat laporan payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setRuns([]);
      setRows([]);
      setTotalRows(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, searchTerm, statusFilter, typeFilter, currentPage]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      period_id: periods[0]?.id || "all",
      run_id: runs[0]?.id || "all",
      snapshot_name: `Payroll Report ${new Date().toISOString().slice(0, 10)}`,
      trace_id: `RPT-${Date.now()}`,
      log_id: `LOG-${Date.now()}`,
    });
    setEditingId(null);
  };

  const openCreateDialog = () => { resetForm(); setIsDialogOpen(true); };

  const openEditDialog = (row: PayrollReportSnapshot) => {
    setEditingId(row.id);
    setFormState({
      period_id: row.period_id || "all",
      run_id: row.run_id || "all",
      report_type: row.report_type as ReportType,
      snapshot_name: row.snapshot_name,
      status: row.status as ReportStatus,
      file_url: row.file_url || "",
      trace_id: row.trace_id || "",
      log_id: row.log_id || "",
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

      if (!formState.snapshot_name.trim()) {
        toast.error("Nama snapshot laporan wajib diisi");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollReportSnapshotInsert = {
        tenant_id: resolvedTenantId,
        period_id: formState.period_id === "all" ? null : formState.period_id,
        run_id: formState.run_id === "all" ? null : formState.run_id,
        report_type: formState.report_type,
        snapshot_name: formState.snapshot_name.trim(),
        status: formState.status,
        file_url: formState.file_url.trim() || null,
        trace_id: formState.trace_id.trim() || `RPT-${Date.now()}`,
        log_id: formState.log_id.trim() || `LOG-${Date.now()}`,
        notes: formState.notes.trim() || null,
        generated_at: formState.status === "generated" ? new Date().toISOString() : null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingId) {
        const updatePayload: PayrollReportSnapshotUpdate = {
          ...payload,
          tenant_id: undefined,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        const { error } = await supabase.from("payroll_report_snapshots").update(updatePayload).eq("id", editingId).eq("tenant_id", resolvedTenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_report_snapshots").insert(payload);
        if (error) throw error;
      }

      toast.success(`Snapshot laporan berhasil ${editingId ? "diperbarui" : "ditambahkan"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.reports.save");
      toast.error(appendErrorReference("Gagal menyimpan snapshot laporan", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (row: PayrollReportSnapshot, status: ReportStatus) => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const patch: PayrollReportSnapshotUpdate = { status };
      if (status === "generated") patch.generated_at = new Date().toISOString();
      const { error } = await supabase.from("payroll_report_snapshots").update(patch).eq("id", row.id).eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success(`Status laporan diubah ke ${REPORT_STATUS_LABELS[status]}`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.reports.update_status");
      toast.error(appendErrorReference("Gagal memperbarui status laporan", ref));
    }
  };

  const handleDelete = async (row: PayrollReportSnapshot) => {
    if (!(await confirmDialog({ title: "Hapus Snapshot Laporan", description: `Yakin ingin menghapus ${row.snapshot_name}?`, confirmText: "Ya, hapus", variant: "destructive" }))) return;
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const { error } = await supabase.from("payroll_report_snapshots").delete().eq("id", row.id).eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success("Snapshot laporan berhasil dihapus");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.reports.delete");
      toast.error(appendErrorReference("Gagal menghapus snapshot laporan", ref));
    }
  };

  const exportCsv = () => {
    const csv = [
      ["snapshot_name", "report_type", "status", "period", "run", "file_url", "trace_id", "log_id", "generated_at"],
      ...rows.map((row) => {
        const period = row.period_id ? periodMap.get(row.period_id) : null;
        const run = row.run_id ? runMap.get(row.run_id) : null;
        return [
          row.snapshot_name,
          row.report_type,
          row.status,
          period?.period_key || "-",
          run ? `#${run.run_sequence}` : "-",
          row.file_url || "",
          row.trace_id || "",
          row.log_id || "",
          row.generated_at || "",
        ];
      }),
    ].map((line) => line.map((value) => toCsvSafe(value)).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV laporan berhasil");
  };

  const summary = useMemo(() => ({
    generated: rows.filter((item) => item.status === "generated").length,
    published: rows.filter((item) => item.status === "published").length,
    failed: rows.filter((item) => item.status === "failed").length,
  }), [rows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Laporan Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Kelola snapshot laporan payroll ringkas dengan referensi trace ID dan log ID untuk tindak lanjut operasional.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Dibuat" value={summary.generated} />
          <StatCard title="Dipublikasikan" value={summary.published} />
          <StatCard title="Gagal" value={summary.failed} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fokus tahap ini</CardDescription>
              <CardTitle className="text-lg">Hasil ringkas payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Gunakan laporan untuk melihat hasil akhir proses payroll tanpa masuk ke fitur distribusi yang lebih kompleks.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Yang perlu dijaga</CardDescription>
              <CardTitle className="text-lg">Trace dan log</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Pastikan setiap snapshot laporan memiliki referensi yang bisa dipakai saat ada kendala operasional.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Langkah akhir inti</CardDescription>
              <CardTitle className="text-lg">Ringkasan siap baca</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Setelah persetujuan selesai, laporan ini menjadi titik akhir alur payroll sederhana tahap awal.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Laporan</CardTitle>
            <CardDescription>Filter status dan jenis laporan payroll ringkas.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label htmlFor="search">Pencarian</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="search" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari nama snapshot, trace_id, log_id..." />
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
              <Label>Jenis Laporan</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {TYPE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Snapshot Laporan</CardTitle>
            <CardDescription>Setiap kegagalan/hasil publish harus memiliki log_id agar mudah dilacak.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/approval")}><ArrowLeft className="mr-2 h-4 w-4" />Persetujuan Payroll</Button>
              <Button variant="outline" onClick={() => navigate("/org/payroll/run-engine")}>Proses Payroll</Button>
              <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
              <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Tambah Snapshot</Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Snapshot</TableHead>
                  <TableHead>Periode/Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Memuat laporan...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Belum ada snapshot laporan</TableCell></TableRow>
                ) : rows.map((row) => {
                  const period = row.period_id ? periodMap.get(row.period_id) : null;
                  const run = row.run_id ? runMap.get(row.run_id) : null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.snapshot_name}</div>
                        <div className="text-xs text-muted-foreground">{REPORT_TYPE_LABELS[row.report_type as ReportType]}</div>
                      </TableCell>
                      <TableCell>
                        <div>{period?.period_key || "-"}</div>
                        <div className="text-xs text-muted-foreground">{run ? `Run #${run.run_sequence}` : "-"}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{REPORT_STATUS_LABELS[row.status as ReportStatus]}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">trace:{row.trace_id || "-"}<br />log:{row.log_id || "-"}</TableCell>
                      <TableCell>{formatDateTime(row.generated_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(row)}><PencilLine className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => updateStatus(row, "generated")}><Sparkles className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => updateStatus(row, "published")}><CheckCircle2 className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => void handleDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} snapshot</span>
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
              <DialogTitle>{editingId ? "Edit Snapshot Laporan" : "Tambah Snapshot Laporan"}</DialogTitle>
              <DialogDescription>Simpan snapshot laporan payroll beserta referensi trace dan log.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 md:grid-cols-2">
              <div>
                <Label>Nama Snapshot</Label>
                <Input className="mt-1.5" value={formState.snapshot_name} onChange={(e) => setFormState((prev) => ({ ...prev, snapshot_name: e.target.value }))} />
              </div>
              <div>
                <Label>Jenis Laporan</Label>
                <Select value={formState.report_type} onValueChange={(value) => setFormState((prev) => ({ ...prev, report_type: value as ReportType }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as ReportStatus }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Periode</Label>
                <Select value={formState.period_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, period_id: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">(Opsional) Semua</SelectItem>{periods.map((item) => <SelectItem key={item.id} value={item.id}>{item.period_key}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Proses Payroll</Label>
                <Select value={formState.run_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, run_id: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">(Opsional) Semua</SelectItem>{runs.map((item) => <SelectItem key={item.id} value={item.id}>Run #{item.run_sequence}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>File URL</Label>
                <Input className="mt-1.5" value={formState.file_url} onChange={(e) => setFormState((prev) => ({ ...prev, file_url: e.target.value }))} />
              </div>
              <div>
                <Label>Trace ID</Label>
                <Input className="mt-1.5" value={formState.trace_id} onChange={(e) => setFormState((prev) => ({ ...prev, trace_id: e.target.value }))} />
              </div>
              <div>
                <Label>Log ID</Label>
                <Input className="mt-1.5" value={formState.log_id} onChange={(e) => setFormState((prev) => ({ ...prev, log_id: e.target.value }))} />
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

        <OrgPayrollPageGuide pathname="/org/payroll/reports" />
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
