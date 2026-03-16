import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlayCircle, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { buildPostgrestOrClause, sanitizeOrKeyword } from "@/lib/postgrestSearch";

type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollRunInsert = Database["public"]["Tables"]["payroll_runs"]["Insert"];
type PayrollRunUpdate = Database["public"]["Tables"]["payroll_runs"]["Update"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type RunStatus = "draft" | "processing" | "review" | "approved" | "paid" | "archived" | "failed";

type RunFormState = {
  period_id: string;
  run_type: "simulation" | "final";
  status: RunStatus;
  trace_id: string;
  notes: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: Array<{ value: RunStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "processing", label: "Diproses" },
  { value: "review", label: "Tinjau" },
  { value: "approved", label: "Disetujui" },
  { value: "paid", label: "Dibayar" },
  { value: "archived", label: "Arsip" },
  { value: "failed", label: "Gagal" },
];

const initialFormState: RunFormState = {
  period_id: "",
  run_type: "simulation",
  status: "draft",
  trace_id: "",
  notes: "",
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  draft: "Draft",
  processing: "Diproses",
  review: "Tinjau",
  approved: "Disetujui",
  paid: "Dibayar",
  archived: "Arsip",
  failed: "Gagal",
};

const RUN_TYPE_LABELS: Record<"simulation" | "final", string> = {
  simulation: "Simulasi",
  final: "Final",
};

export default function OrgPayrollRunEngine() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [formState, setFormState] = useState<RunFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RunStatus>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);

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
      if (periodError) {
        reportError(periodError, "org.payroll.run_engine.fetch_periods", { tenant_id: resolvedTenantId });
        setPeriods([]);
      } else {
        setPeriods(periodRows || []);
      }

      let query = supabase
        .from("payroll_runs")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (periodFilter !== "all") query = query.eq("period_id", periodFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const matchedPeriodIds = ((periodError ? [] : periodRows) || [])
          .filter((item) => `${item.period_key} ${item.status}`.toLowerCase().includes(keyword.toLowerCase()))
          .map((item) => item.id);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["trace_id", "notes"],
          inFilters: [{ field: "period_id", values: matchedPeriodIds }],
        });
        if (orClause) query = query.or(orClause);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      setRuns(data || []);
      setTotalRuns(count || 0);
    } catch (error) {
      const ref = reportError(error, "org.payroll.run_engine.fetch");
      const message = appendErrorReference("Gagal memuat data run payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setRuns([]);
      setTotalRuns(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, periodFilter, searchTerm, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, periodFilter]);

  const totalPages = Math.max(1, Math.ceil(totalRuns / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      period_id: periods[0]?.id || "",
    });
    setEditingRunId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: PayrollRun) => {
    setEditingRunId(row.id);
    setFormState({
      period_id: row.period_id,
      run_type: row.run_type as "simulation" | "final",
      status: row.status as RunStatus,
      trace_id: row.trace_id || "",
      notes: row.notes || "",
    });
    setIsDialogOpen(true);
  };

  const ensureApprovalStages = useCallback(async (resolvedTenantId: string, runId: string) => {
    const { error } = await supabase.from("payroll_approvals").upsert(
      ["hr", "finance", "executive"].map((stage) => ({
        tenant_id: resolvedTenantId,
        run_id: runId,
        approval_stage: stage,
        status: "pending",
      })),
      { onConflict: "run_id,approval_stage" },
    );
    if (error) throw error;
  }, []);

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

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const traceId = (formState.trace_id.trim() || `RUN-${Date.now()}`).slice(0, 120);

      if (editingRunId) {
        const updatePayload: PayrollRunUpdate = {
          period_id: formState.period_id,
          run_type: formState.run_type,
          status: formState.status,
          trace_id: traceId,
          notes: formState.notes.trim() || null,
        };
        const { error } = await supabase
          .from("payroll_runs")
          .update(updatePayload)
          .eq("id", editingRunId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        if (["review", "approved", "paid"].includes(formState.status)) {
          await ensureApprovalStages(resolvedTenantId, editingRunId);
        }
      } else {
        const { data: latestRun, error: latestRunError } = await supabase
          .from("payroll_runs")
          .select("run_sequence")
          .eq("tenant_id", resolvedTenantId)
          .eq("period_id", formState.period_id)
          .order("run_sequence", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRunError) throw latestRunError;

        const payload: PayrollRunInsert = {
          tenant_id: resolvedTenantId,
          period_id: formState.period_id,
          run_sequence: (latestRun?.run_sequence || 0) + 1,
          run_type: formState.run_type,
          status: formState.status,
          trace_id: traceId,
          notes: formState.notes.trim() || null,
          summary: {} as Json,
          created_by: user?.id || null,
          started_at: formState.status === "processing" ? new Date().toISOString() : null,
          finished_at: ["review", "approved", "paid", "archived", "failed"].includes(formState.status)
            ? new Date().toISOString()
            : null,
        };

        const { data, error } = await supabase
          .from("payroll_runs")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id && ["review", "approved", "paid"].includes(formState.status)) {
          await ensureApprovalStages(resolvedTenantId, data.id);
        }
      }

      toast.success(`Run payroll berhasil ${editingRunId ? "diperbarui" : "dibuat"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.run_engine.save");
      toast.error(appendErrorReference("Gagal menyimpan run payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickSetStatus = async (row: PayrollRun, nextStatus: RunStatus) => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const patch: PayrollRunUpdate = {
        status: nextStatus,
      };

      if (nextStatus === "processing") {
        patch.started_at = new Date().toISOString();
      }
      if (["review", "approved", "paid", "archived", "failed"].includes(nextStatus)) {
        patch.finished_at = new Date().toISOString();
      }
      if (nextStatus === "approved") {
        patch.approved_at = new Date().toISOString();
        patch.approved_by = user?.id || null;
      }
      if (nextStatus === "paid") {
        patch.paid_at = new Date().toISOString();
        patch.paid_by = user?.id || null;
      }

      const { error } = await supabase
        .from("payroll_runs")
        .update(patch)
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      if (["review", "approved", "paid"].includes(nextStatus)) {
        await ensureApprovalStages(resolvedTenantId, row.id);
      }

      toast.success(`Status run diperbarui ke ${RUN_STATUS_LABELS[nextStatus]}`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.run_engine.quick_status");
      toast.error(appendErrorReference("Gagal memperbarui status run", ref));
    }
  };

  const summary = useMemo(() => {
    return {
      draft: runs.filter((item) => item.status === "draft").length,
      processing: runs.filter((item) => item.status === "processing").length,
      review: runs.filter((item) => item.status === "review").length,
      approved: runs.filter((item) => item.status === "approved").length,
      failed: runs.filter((item) => item.status === "failed").length,
    };
  }, [runs]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Inti</Badge>
            <Badge variant="outline">Proses Payroll</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Proses Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Jalankan simulasi atau proses final payroll per periode dengan status yang rapi dan mudah ditelusuri.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard title="Draft" value={summary.draft} />
          <StatCard title="Diproses" value={summary.processing} />
          <StatCard title="Tinjau" value={summary.review} />
          <StatCard title="Disetujui" value={summary.approved} />
          <StatCard title="Gagal" value={summary.failed} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fokus tahap ini</CardDescription>
              <CardTitle className="text-lg">Eksekusi payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Jalankan payroll hanya setelah validasi cukup aman dan periode yang dipilih sudah jelas.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Yang perlu dijaga</CardDescription>
              <CardTitle className="text-lg">Status dan trace</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Pastikan setiap run memiliki status yang tepat dan trace ID yang bisa dipakai untuk triase.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Langkah berikutnya</CardDescription>
              <CardTitle className="text-lg">Persetujuan Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/approval")}>
                Buka Persetujuan Payroll
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Proses Payroll</CardTitle>
            <CardDescription>Filter periode dan status untuk meninjau run payroll.</CardDescription>
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
                  placeholder="Cari trace id, period key, atau catatan..."
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
            <CardTitle>Daftar Payroll Run</CardTitle>
            <CardDescription>Buat run baru atau ubah status run sesuai alur payroll sederhana.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/validation")}>
                <ArrowLeft className="mr-2 h-4 w-4" />Validasi
              </Button>
              <Button onClick={openCreateDialog}>
                <PlayCircle className="mr-2 h-4 w-4" />Buat Proses
              </Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Run</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trace</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Memuat payroll run...</TableCell></TableRow>
                ) : runs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Belum ada payroll run.</TableCell></TableRow>
                ) : (
                  runs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{periodMap.get(row.period_id)?.period_key || "-"}</TableCell>
                      <TableCell>Run #{row.run_sequence}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{RUN_TYPE_LABELS[row.run_type as "simulation" | "final"]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "failed" ? "destructive" : "outline"}>
                          {RUN_STATUS_LABELS[row.status as RunStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.trace_id || "-"}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          <p>Mulai: {formatDateTime(row.started_at)}</p>
                          <p>Selesai: {formatDateTime(row.finished_at)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(row)}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          {row.status === "draft" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "processing")}>Proses</Button>
                          ) : null}
                          {row.status === "processing" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "review")}>Tinjau</Button>
                          ) : null}
                          {row.status === "review" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "approved")}>
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" />Setujui
                            </Button>
                          ) : null}
                          {row.status === "approved" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "paid")}>Tandai Dibayar</Button>
                          ) : null}
                          {["draft", "processing", "review", "approved"].includes(row.status) ? (
                            <Button variant="destructive" size="sm" onClick={() => quickSetStatus(row, "failed")}>
                              <XCircle className="mr-1 h-3.5 w-3.5" />Tandai Gagal
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRuns} run</span>
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
              <DialogTitle>{editingRunId ? "Edit Proses Payroll" : "Buat Proses Payroll"}</DialogTitle>
              <DialogDescription>Pilih periode, tipe proses, dan status awal payroll.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Periode</Label>
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
                  <Label>Tipe Proses</Label>
                  <Select value={formState.run_type} onValueChange={(value) => setFormState((prev) => ({ ...prev, run_type: value as "simulation" | "final" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simulation">Simulasi</SelectItem>
                      <SelectItem value="final">Final</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as RunStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="trace_id">Trace ID</Label>
                <Input id="trace_id" value={formState.trace_id} onChange={(event) => setFormState((prev) => ({ ...prev, trace_id: event.target.value }))} placeholder="Opsional, auto-generate jika kosong" />
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

        <OrgPayrollPageGuide pathname="/org/payroll/run-engine" />
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
