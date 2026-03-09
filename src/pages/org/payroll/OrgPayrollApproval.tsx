import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, RefreshCw, Search, XCircle } from "lucide-react";
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

type PayrollApproval = Database["public"]["Tables"]["payroll_approvals"]["Row"];
type PayrollApprovalUpdate = Database["public"]["Tables"]["payroll_approvals"]["Update"];
type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type ApprovalStatus = "pending" | "approved" | "rejected";

type ApprovalFormState = {
  comment: string;
};

const ITEMS_PER_PAGE = 12;

const STAGE_OPTIONS = [
  { value: "hr", label: "HR" },
  { value: "finance", label: "Finance" },
  { value: "executive", label: "Executive" },
];

const STATUS_OPTIONS: Array<{ value: ApprovalStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

export default function OrgPayrollApproval() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [rows, setRows] = useState<PayrollApproval[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ApprovalStatus>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingRow, setEditingRow] = useState<PayrollApproval | null>(null);
  const [formState, setFormState] = useState<ApprovalFormState>({ comment: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        supabase
          .from("payroll_runs")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("payroll_periods")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("period_start", { ascending: false }),
      ]);
      if (runRes.error) throw runRes.error;
      if (periodRes.error) throw periodRes.error;
      setRuns(runRes.data || []);
      setPeriods(periodRes.data || []);

      let query = supabase
        .from("payroll_approvals")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (stageFilter !== "all") query = query.eq("approval_stage", stageFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const runIds = (runRes.data || [])
          .filter((run) => `${run.trace_id || ""} ${run.notes || ""}`.toLowerCase().includes(keyword.toLowerCase()))
          .map((run) => run.id);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["trace_id", "comment"],
          inFilters: [{ field: "run_id", values: runIds }],
        });
        if (orClause) query = query.or(orClause);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      setRows(data || []);
      setTotalRows(count || 0);
    } catch (error) {
      const ref = reportError(error, "org.payroll.approval.fetch");
      const message = appendErrorReference("Gagal memuat approval payroll", ref);
      setLoadError(message);
      toast.error(message);
      setRuns([]);
      setPeriods([]);
      setRows([]);
      setTotalRows(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, searchTerm, stageFilter, statusFilter, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stageFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  const openActionDialog = (row: PayrollApproval) => {
    setEditingRow(row);
    setFormState({ comment: row.comment || "" });
  };

  const closeDialog = () => {
    setEditingRow(null);
    setFormState({ comment: "" });
  };

  const updateApprovalStatus = async (nextStatus: ApprovalStatus) => {
    if (!editingRow) return;
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollApprovalUpdate = {
        status: nextStatus,
        comment: formState.comment.trim() || null,
        decided_at: nextStatus === "pending" ? null : new Date().toISOString(),
        decided_by: nextStatus === "pending" ? null : user?.id || null,
      };

      const { error } = await supabase
        .from("payroll_approvals")
        .update(payload)
        .eq("id", editingRow.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success(`Approval stage ${editingRow.approval_stage} diubah ke ${nextStatus}`);
      closeDialog();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.approval.update_status");
      toast.error(appendErrorReference("Gagal memperbarui approval", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const syncApprovals = async () => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const candidateRuns = runs.filter((run) => ["review", "approved", "paid"].includes(run.status));
      if (candidateRuns.length === 0) {
        toast.info("Belum ada run dengan status review/approved/paid untuk disinkronkan.");
        return;
      }

      const payload = candidateRuns.flatMap((run) =>
        ["hr", "finance", "executive"].map((stage) => ({
          tenant_id: resolvedTenantId,
          run_id: run.id,
          approval_stage: stage,
          status: "pending",
          trace_id: `APR-${run.trace_id || run.id}`,
        })),
      );

      const { error } = await supabase.from("payroll_approvals").upsert(payload, {
        onConflict: "run_id,approval_stage",
      });
      if (error) throw error;

      toast.success("Approval payroll berhasil disinkronkan dari run engine.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.approval.sync");
      toast.error(appendErrorReference("Gagal sinkron approval payroll", ref));
    }
  };

  const summary = useMemo(() => {
    return {
      pending: rows.filter((item) => item.status === "pending").length,
      approved: rows.filter((item) => item.status === "approved").length,
      rejected: rows.filter((item) => item.status === "rejected").length,
    };
  }, [rows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Payroll</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Approval Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Kelola persetujuan payroll berlapis per stage {"(HR -> Finance -> Executive)"} dari payroll run.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Pending" value={summary.pending} />
          <StatCard title="Approved" value={summary.approved} />
          <StatCard title="Rejected" value={summary.rejected} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Approval</CardTitle>
            <CardDescription>Filter stage/status untuk proses approval payroll.</CardDescription>
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
                  placeholder="Cari trace approval, trace run, atau catatan..."
                />
              </div>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {STAGE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
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
            <CardTitle>Daftar Approval</CardTitle>
            <CardDescription>Approval payroll terkait run engine dengan jejak audit dan keputusan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/run-engine")}>
                <ArrowLeft className="mr-2 h-4 w-4" />Run Engine
              </Button>
              <Button variant="secondary" onClick={syncApprovals}>
                <RefreshCw className="mr-2 h-4 w-4" />Sync dari Run
              </Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode / Run</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trace</TableHead>
                  <TableHead>Keputusan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Memuat approval payroll...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Belum ada data approval payroll.</TableCell></TableRow>
                ) : (
                  rows.map((row) => {
                    const run = runMap.get(row.run_id);
                    const period = run ? periodMap.get(run.period_id) : null;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium">{period?.period_key || "-"}</p>
                            <p className="text-xs text-muted-foreground">Run #{run?.run_sequence || "-"} • {run?.trace_id || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{row.approval_stage}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={row.status === "approved" ? "default" : row.status === "rejected" ? "destructive" : "secondary"}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.trace_id || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <p>{formatDateTime(row.decided_at)}</p>
                          <p>{row.comment || "-"}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="secondary" size="sm" onClick={() => openActionDialog(row)}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Aksi
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} approval</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</Button>
                <span>{currentPage}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>Berikutnya</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={Boolean(editingRow)} onOpenChange={(open) => (!open ? closeDialog() : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aksi Approval Payroll</DialogTitle>
              <DialogDescription>Ubah status approval untuk stage terkait dan simpan catatan keputusan.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-md border p-3 text-sm">
                <p><span className="font-medium">Stage:</span> {editingRow?.approval_stage || "-"}</p>
                <p><span className="font-medium">Run:</span> {editingRow ? runMap.get(editingRow.run_id)?.trace_id || editingRow.run_id : "-"}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="comment">Komentar</Label>
                <Textarea id="comment" rows={3} value={formState.comment} onChange={(event) => setFormState({ comment: event.target.value })} />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={closeDialog}>Batal</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => updateApprovalStatus("pending")} disabled={isSubmitting}>Pending</Button>
                <Button variant="default" onClick={() => updateApprovalStatus("approved")} disabled={isSubmitting}>Approve</Button>
                <Button variant="destructive" onClick={() => updateApprovalStatus("rejected")} disabled={isSubmitting}>
                  <XCircle className="mr-1 h-3.5 w-3.5" />Reject
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
