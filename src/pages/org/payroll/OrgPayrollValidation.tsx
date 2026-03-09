import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, PencilLine, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
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

type PayrollValidationRun = Database["public"]["Tables"]["payroll_validation_runs"]["Row"];
type PayrollValidationRunInsert = Database["public"]["Tables"]["payroll_validation_runs"]["Insert"];
type PayrollValidationRunUpdate = Database["public"]["Tables"]["payroll_validation_runs"]["Update"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type ValidationStatus = "passed" | "failed" | "warning";
type ValidationSortKey = "executed_at" | "status" | "issue_count" | "critical_count";

type ValidationFormState = {
  period_id: string;
  status: ValidationStatus;
  issue_count: string;
  critical_count: string;
  trace_id: string;
  summary_json: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: Array<{ value: ValidationStatus; label: string }> = [
  { value: "warning", label: "Warning" },
  { value: "failed", label: "Failed" },
  { value: "passed", label: "Passed" },
];

const initialFormState: ValidationFormState = {
  period_id: "",
  status: "warning",
  issue_count: "0",
  critical_count: "0",
  trace_id: "",
  summary_json: "{}",
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const toValidationStatus = (value: string): ValidationStatus =>
  value === "passed" || value === "failed" || value === "warning" ? value : "warning";

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

export default function OrgPayrollValidation() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollValidationRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ValidationFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ValidationStatus>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<ValidationSortKey>("executed_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const periodMap = useMemo(
    () => new Map(periods.map((item) => [item.id, item])),
    [periods],
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const { data: periodRows, error: periodError } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("period_start", { ascending: false });
      if (periodError) throw periodError;
      const periodList = periodRows || [];
      setPeriods(periodList);

      let query = supabase
        .from("payroll_validation_runs")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (periodFilter !== "all") query = query.eq("period_id", periodFilter);
      if (dateFrom) query = query.gte("executed_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("executed_at", `${dateTo}T23:59:59`);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const matchedPeriodIds = periodList
          .filter((period) => {
            const haystack = `${period.period_key} ${period.status} ${period.notes || ""}`.toLowerCase();
            return haystack.includes(keyword.toLowerCase());
          })
          .map((period) => period.id);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["trace_id"],
          inFilters: [{ field: "period_id", values: matchedPeriodIds }],
        });
        if (orClause) query = query.or(orClause);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDir === "asc" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      setRuns(data || []);
      setTotalRuns(count || 0);
    } catch (error) {
      const ref = reportError(error, "org.payroll.validation.fetch");
      const message = appendErrorReference("Gagal memuat validasi payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setRuns([]);
      setTotalRuns(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, periodFilter, dateFrom, dateTo, searchTerm, sortBy, sortDir, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, periodFilter, dateFrom, dateTo, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalRuns / ITEMS_PER_PAGE));
  const summary = useMemo(
    () => ({
      failed: runs.filter((item) => item.status === "failed").length,
      warning: runs.filter((item) => item.status === "warning").length,
      passed: runs.filter((item) => item.status === "passed").length,
    }),
    [runs],
  );

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      period_id: periods[0]?.id ?? "",
    });
    setEditingRunId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: PayrollValidationRun) => {
    setEditingRunId(item.id);
    setFormState({
      period_id: item.period_id,
      status: toValidationStatus(item.status),
      issue_count: String(item.issue_count),
      critical_count: String(item.critical_count),
      trace_id: item.trace_id || "",
      summary_json: JSON.stringify(item.summary ?? {}, null, 2),
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      if (!formState.period_id) {
        toast.error("Periode payroll wajib dipilih");
        return;
      }

      const issueCount = Number(formState.issue_count);
      const criticalCount = Number(formState.critical_count);
      if (!Number.isInteger(issueCount) || issueCount < 0) {
        toast.error("Issue count wajib bilangan bulat >= 0");
        return;
      }
      if (!Number.isInteger(criticalCount) || criticalCount < 0) {
        toast.error("Critical count wajib bilangan bulat >= 0");
        return;
      }
      if (criticalCount > issueCount) {
        toast.error("Critical count tidak boleh lebih besar dari issue count");
        return;
      }

      let parsedSummary: Record<string, unknown> = {};
      if (formState.summary_json.trim().length > 0) {
        try {
          parsedSummary = JSON.parse(formState.summary_json);
        } catch {
          toast.error("Summary JSON tidak valid");
          return;
        }
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollValidationRunInsert = {
        tenant_id: resolvedTenantId,
        period_id: formState.period_id,
        status: formState.status,
        issue_count: issueCount,
        critical_count: criticalCount,
        trace_id: formState.trace_id.trim() || null,
        summary: parsedSummary,
        executed_by: user?.id || null,
        executed_at: new Date().toISOString(),
      };

      if (editingRunId) {
        const updatePayload: PayrollValidationRunUpdate = {
          ...payload,
          tenant_id: undefined,
          period_id: payload.period_id,
        };
        const { error } = await supabase
          .from("payroll_validation_runs")
          .update(updatePayload)
          .eq("id", editingRunId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        toast.success("Validasi payroll berhasil diperbarui");
      } else {
        const { error } = await supabase.from("payroll_validation_runs").insert(payload);
        if (error) throw error;
        toast.success("Validasi payroll berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.validation.save");
      toast.error(appendErrorReference("Gagal menyimpan validasi payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: PayrollValidationRun) => {
    if (!(await confirmDialog({
      title: "Hapus Validasi Payroll",
      description: `Yakin ingin menghapus validasi ${item.trace_id || item.id}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) return;

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const { error } = await supabase
        .from("payroll_validation_runs")
        .delete()
        .eq("id", item.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success("Validasi payroll berhasil dihapus");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.validation.delete");
      toast.error(appendErrorReference("Gagal menghapus validasi payroll", ref));
    }
  };

  const exportCsv = () => {
    const rows = [
      ["trace_id", "period_key", "status", "issue_count", "critical_count", "executed_at"],
      ...runs.map((item) => [
        item.trace_id || "-",
        periodMap.get(item.period_id)?.period_key || "-",
        item.status,
        String(item.issue_count),
        String(item.critical_count),
        item.executed_at,
      ]),
    ];
    const csv = rows.map((line) => line.map((item) => toCsvSafe(item)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-validation-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Badge variant="outline">Payroll</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">Validasi Payroll</h1>
            <p className="text-sm text-muted-foreground">
              Jalankan dan pantau hasil validasi sebelum proses payroll agar error dapat dikoreksi lebih awal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/org/payroll")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Payroll
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah Validasi
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Run</CardDescription>
              <CardTitle className="text-2xl">{totalRuns}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
              <CardTitle className="text-2xl text-red-600">{summary.failed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Warning</CardDescription>
              <CardTitle className="text-2xl text-amber-600">{summary.warning}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Passed</CardDescription>
              <CardTitle className="text-2xl text-emerald-600">{summary.passed}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Daftar Validasi
            </CardTitle>
            <CardDescription>Filter dan review hasil validasi payroll per periode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-5">
              <div className="space-y-1 lg:col-span-2">
                <Label htmlFor="search">Pencarian</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    className="pl-9"
                    placeholder="Cari trace id, period key, atau catatan..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value: "all" | ValidationStatus) => setStatusFilter(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Semua status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Periode</Label>
                <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua periode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua periode</SelectItem>
                    {periods.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.period_key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="date_from">Dari Tanggal</Label>
                <Input id="date_from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="date_to">Sampai Tanggal</Label>
                <Input id="date_to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Urutkan</Label>
                <Select value={sortBy} onValueChange={(value: ValidationSortKey) => setSortBy(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="executed_at">Waktu Eksekusi</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="issue_count">Issue Count</SelectItem>
                    <SelectItem value="critical_count">Critical Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Arah Urutan</Label>
                <Select value={sortDir} onValueChange={(value: "asc" | "desc") => setSortDir(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Terbaru</SelectItem>
                    <SelectItem value="asc">Terlama</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loadError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu Eksekusi</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issue / Critical</TableHead>
                    <TableHead>Trace ID</TableHead>
                    <TableHead className="w-[130px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Belum ada data validasi payroll.
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDateTime(item.executed_at)}</TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium">{periodMap.get(item.period_id)?.period_key || "-"}</p>
                            <p className="text-xs text-muted-foreground">{periodMap.get(item.period_id)?.status || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={item.status === "passed" ? "secondary" : "outline"}
                            className={
                              item.status === "failed"
                                ? "border-red-300 bg-red-50 text-red-700"
                                : item.status === "warning"
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-700"
                            }
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.issue_count} / <span className="text-red-600">{item.critical_count}</span>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {item.trace_id || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                              <PencilLine className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => void handleDelete(item)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <p>
                Halaman {currentPage} dari {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRunId ? "Edit Validasi Payroll" : "Tambah Validasi Payroll"}</DialogTitle>
            <DialogDescription>
              Simpan hasil validasi payroll untuk periode terpilih, termasuk trace_id agar mudah ditelusuri.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Periode Payroll</Label>
              <Select
                value={formState.period_id}
                onValueChange={(value) => setFormState((prev) => ({ ...prev, period_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih periode" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.period_key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={formState.status}
                onValueChange={(value: ValidationStatus) => setFormState((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
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
            </div>
            <div className="space-y-1">
              <Label htmlFor="issue_count">Issue Count</Label>
              <Input
                id="issue_count"
                inputMode="numeric"
                value={formState.issue_count}
                onChange={(event) => setFormState((prev) => ({ ...prev, issue_count: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="critical_count">Critical Count</Label>
              <Input
                id="critical_count"
                inputMode="numeric"
                value={formState.critical_count}
                onChange={(event) => setFormState((prev) => ({ ...prev, critical_count: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="trace_id">Trace ID (opsional)</Label>
            <Input
              id="trace_id"
              placeholder="Contoh: TRACE-PR-20260224-0001"
              value={formState.trace_id}
              onChange={(event) => setFormState((prev) => ({ ...prev, trace_id: event.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="summary_json">Summary JSON</Label>
            <Textarea
              id="summary_json"
              rows={8}
              value={formState.summary_json}
              onChange={(event) => setFormState((prev) => ({ ...prev, summary_json: event.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
