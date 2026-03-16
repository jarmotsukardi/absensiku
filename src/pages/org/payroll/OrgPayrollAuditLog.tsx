import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Plus, Search } from "lucide-react";
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

type PayrollAuditLog = Database["public"]["Tables"]["payroll_audit_logs"]["Row"];
type PayrollAuditLogInsert = Database["public"]["Tables"]["payroll_audit_logs"]["Insert"];
type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type FormState = {
  period_id: string;
  run_id: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  action_label: string;
  actor_role: string;
  log_id: string;
  trace_id: string;
  notes: string;
};

type JsonObject = Record<string, unknown>;

const ITEMS_PER_PAGE = 15;

const ENTITY_LABELS: Record<string, string> = {
  payroll_run: "Proses Payroll",
  tax_filing: "Pelaporan Pajak",
  payment_batch: "Pembayaran Batch",
  report_snapshot: "Snapshot Laporan",
  payroll_webhook: "Webhook Payroll",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Buat",
  update: "Ubah",
  status_change: "Perubahan Status",
  publish: "Publikasikan",
  delete: "Hapus",
  webhook_test_success: "Uji Webhook Berhasil",
  webhook_test_failed: "Uji Webhook Gagal",
};

const initialFormState: FormState = {
  period_id: "all",
  run_id: "all",
  entity_type: "payroll_run",
  entity_id: "",
  action_type: "update",
  action_label: "Pembaruan Manual",
  actor_role: "admin_instansi",
  log_id: "",
  trace_id: "",
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

const getWebhookAttemptCount = (value: Json | null): number | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as JsonObject;
  const attemptCount = data.attempt_count;
  if (typeof attemptCount === "number" && Number.isFinite(attemptCount)) return attemptCount;
  const attempts = data.attempts;
  if (Array.isArray(attempts)) return attempts.length;
  return null;
};

const getEntityLabel = (value: string) => ENTITY_LABELS[value] || value;
const getActionLabel = (value: string) => ACTION_LABELS[value] || value;

export default function OrgPayrollAuditLog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [rows, setRows] = useState<PayrollAuditLog[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") || searchParams.get("trace") || searchParams.get("log") || "");
  const [entityFilter, setEntityFilter] = useState<"all" | string>(() => searchParams.get("entity") || "all");
  const [actionFilter, setActionFilter] = useState<"all" | string>(() => searchParams.get("action") || "all");
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

      const [periodRes, runRes] = await Promise.all([
        supabase.from("payroll_periods").select("*").eq("tenant_id", resolvedTenantId).order("period_start", { ascending: false }),
        supabase.from("payroll_runs").select("*").eq("tenant_id", resolvedTenantId).order("created_at", { ascending: false }).limit(200),
      ]);
      if (periodRes.error) {
        reportError(periodRes.error, "org.payroll.audit_log.fetch_periods", { tenant_id: resolvedTenantId });
        setPeriods([]);
      } else {
        setPeriods(periodRes.data || []);
      }
      if (runRes.error) {
        reportError(runRes.error, "org.payroll.audit_log.fetch_runs", { tenant_id: resolvedTenantId });
        setRuns([]);
      } else {
        setRuns(runRes.data || []);
      }

      let query = supabase.from("payroll_audit_logs").select("*", { count: "exact" }).eq("tenant_id", resolvedTenantId);
      if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
      if (actionFilter !== "all") query = query.eq("action_type", actionFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["entity_type", "entity_id", "action_type", "action_label", "trace_id", "log_id", "notes", "actor_role"],
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
      const ref = reportError(error, "org.payroll.audit_log.fetch");
      const message = appendErrorReference("Gagal memuat audit log payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setRuns([]);
      setRows([]);
      setTotalRows(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, searchTerm, entityFilter, actionFilter, currentPage]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, entityFilter, actionFilter]);
  useEffect(() => {
    const next = new URLSearchParams();
    if (searchTerm.trim()) next.set("q", searchTerm.trim());
    if (entityFilter !== "all") next.set("entity", entityFilter);
    if (actionFilter !== "all") next.set("action", actionFilter);
    setSearchParams(next, { replace: true });
  }, [searchTerm, entityFilter, actionFilter, setSearchParams]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  const openCreateDialog = () => {
    setFormState({
      ...initialFormState,
      period_id: periods[0]?.id || "all",
      run_id: runs[0]?.id || "all",
      log_id: `LOG-${Date.now()}`,
      trace_id: `TRC-${Date.now()}`,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);
      if (!formState.log_id.trim() || !formState.action_label.trim()) {
        toast.error("Log ID dan action label wajib diisi");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollAuditLogInsert = {
        tenant_id: resolvedTenantId,
        period_id: formState.period_id === "all" ? null : formState.period_id,
        run_id: formState.run_id === "all" ? null : formState.run_id,
        entity_type: formState.entity_type.trim(),
        entity_id: formState.entity_id.trim() || null,
        action_type: formState.action_type.trim(),
        action_label: formState.action_label.trim(),
        actor_user_id: user?.id || null,
        actor_role: formState.actor_role.trim() || null,
        log_id: formState.log_id.trim(),
        trace_id: formState.trace_id.trim() || null,
        notes: formState.notes.trim() || null,
        before_state: null,
        after_state: {
          source: "manual_ui",
          created_at: new Date().toISOString(),
        } as Json,
      };

      const { error } = await supabase.from("payroll_audit_logs").insert(payload);
      if (error) throw error;

      toast.success("Audit log payroll berhasil ditambahkan");
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.audit_log.save");
      toast.error(appendErrorReference("Gagal menambah audit log payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportCsv = () => {
    const csv = [
      ["created_at", "entity_type", "entity_id", "action_type", "action_label", "actor_role", "period", "run", "trace_id", "log_id", "notes"],
      ...rows.map((row) => {
        const period = row.period_id ? periodMap.get(row.period_id) : null;
        const run = row.run_id ? runMap.get(row.run_id) : null;
        return [
          row.created_at,
          row.entity_type,
          row.entity_id || "",
          row.action_type,
          row.action_label,
          row.actor_role || "",
          period?.period_key || "-",
          run ? `#${run.run_sequence}` : "-",
          row.trace_id || "",
          row.log_id,
          row.notes || "",
        ];
      }),
    ].map((line) => line.map((value) => toCsvSafe(value)).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV audit log berhasil");
  };

  const summary = useMemo(() => ({
    total: totalRows,
    withTrace: rows.filter((item) => Boolean(item.trace_id)).length,
    withLogId: rows.filter((item) => Boolean(item.log_id)).length,
  }), [rows, totalRows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Ditunda</Badge>
            <Badge variant="outline">Observabilitas</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log Payroll</h1>
          <p className="text-sm text-muted-foreground">Jejak perubahan payroll untuk menelusuri siapa mengubah apa, kapan, dan pada proses yang mana.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Fungsi utama</CardDescription>
              <CardTitle className="text-base">Lacak jejak perubahan payroll</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Audit log dipakai saat butuh investigasi perubahan data, status proses, dan aktivitas manual yang berdampak ke payroll.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Fokus penggunaan</CardDescription>
              <CardTitle className="text-base">Hubungkan periode, proses, dan referensi</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Gunakan filter entitas, aksi, dan pencarian nomor referensi untuk mempercepat pelacakan saat ada insiden.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Langkah terkait</CardDescription>
              <CardTitle className="text-base">Cek log error saat ada kegagalan aktif</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Jika masalah masih aktif, lanjutkan ke log error untuk melihat konteks runtime dan nomor referensi yang lebih cepat ditindaklanjuti.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/error-log")}>
                Buka Log Error
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Total Log" value={summary.total} />
          <StatCard title="Dengan Trace ID" value={summary.withTrace} />
          <StatCard title="Dengan Log ID" value={summary.withLogId} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Audit</CardTitle>
            <CardDescription>Filter berdasarkan entity/action untuk investigasi lebih cepat.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label htmlFor="search">Pencarian</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="search" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari entity, action, trace_id, log_id..." />
              </div>
            </div>
            <div>
              <Label>Entity</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="payroll_run">{getEntityLabel("payroll_run")}</SelectItem>
                  <SelectItem value="tax_filing">{getEntityLabel("tax_filing")}</SelectItem>
                  <SelectItem value="payment_batch">{getEntityLabel("payment_batch")}</SelectItem>
                  <SelectItem value="report_snapshot">{getEntityLabel("report_snapshot")}</SelectItem>
                  <SelectItem value="payroll_webhook">{getEntityLabel("payroll_webhook")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Aksi</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="create">{getActionLabel("create")}</SelectItem>
                  <SelectItem value="update">{getActionLabel("update")}</SelectItem>
                  <SelectItem value="status_change">{getActionLabel("status_change")}</SelectItem>
                  <SelectItem value="publish">{getActionLabel("publish")}</SelectItem>
                  <SelectItem value="delete">{getActionLabel("delete")}</SelectItem>
                  <SelectItem value="webhook_test_success">{getActionLabel("webhook_test_success")}</SelectItem>
                  <SelectItem value="webhook_test_failed">{getActionLabel("webhook_test_failed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="xl:col-span-4 flex flex-wrap gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEntityFilter("payroll_webhook");
                  if (actionFilter !== "webhook_test_success" && actionFilter !== "webhook_test_failed") {
                    setActionFilter("all");
                  }
                }}
              >
                Hanya Webhook
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setEntityFilter("all");
                  setActionFilter("all");
                }}
              >
                Reset Filter
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Audit Log</CardTitle>
            <CardDescription>Gunakan log ini untuk triase cepat saat ada insiden payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll/reports")}><ArrowLeft className="mr-2 h-4 w-4" />Laporan Payroll</Button>
              <Button variant="outline" onClick={() => navigate("/org/payroll/integrations")}>Integrasi Payroll</Button>
              <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
              <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Tambah Audit Log</Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Entitas / Aksi</TableHead>
                  <TableHead>Periode / Proses</TableHead>
                  <TableHead>Percobaan Webhook</TableHead>
                  <TableHead>Referensi</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Memuat audit log...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Belum ada audit log</TableCell></TableRow>
                ) : rows.map((row) => {
                  const period = row.period_id ? periodMap.get(row.period_id) : null;
                  const run = row.run_id ? runMap.get(row.run_id) : null;
                  const attemptCount = getWebhookAttemptCount(row.after_state);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateTime(row.created_at)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{getEntityLabel(row.entity_type)} / {getActionLabel(row.action_type)}</div>
                        <div className="text-xs text-muted-foreground">{row.action_label}</div>
                      </TableCell>
                      <TableCell>
                        <div>{period?.period_key || "-"}</div>
                        <div className="text-xs text-muted-foreground">{run ? `Proses #${run.run_sequence}` : "-"}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.entity_type === "payroll_webhook" ? (attemptCount ?? "-") : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">trace_id: {row.trace_id || "-"}<br />log_id: {row.log_id || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.notes || "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} log</span>
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
              <DialogTitle>Tambah Audit Log Payroll</DialogTitle>
              <DialogDescription>Isi log_id dan trace_id agar incident bisa ditelusuri secara deterministik.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 md:grid-cols-2">
              <div>
                <Label>Jenis Entitas</Label>
                <Input className="mt-1.5" value={formState.entity_type} onChange={(e) => setFormState((prev) => ({ ...prev, entity_type: e.target.value }))} />
              </div>
              <div>
                <Label>ID Entitas</Label>
                <Input className="mt-1.5" value={formState.entity_id} onChange={(e) => setFormState((prev) => ({ ...prev, entity_id: e.target.value }))} />
              </div>
              <div>
                <Label>Jenis Aksi</Label>
                <Input className="mt-1.5" value={formState.action_type} onChange={(e) => setFormState((prev) => ({ ...prev, action_type: e.target.value }))} />
              </div>
              <div>
                <Label>Label Aksi</Label>
                <Input className="mt-1.5" value={formState.action_label} onChange={(e) => setFormState((prev) => ({ ...prev, action_label: e.target.value }))} />
              </div>
              <div>
                <Label>Periode</Label>
                <Select value={formState.period_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, period_id: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">(Opsional) Semua</SelectItem>{periods.map((item) => <SelectItem key={item.id} value={item.id}>{item.period_key}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Run</Label>
                <Select value={formState.run_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, run_id: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">(Opsional) Semua</SelectItem>{runs.map((item) => <SelectItem key={item.id} value={item.id}>Run #{item.run_sequence}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Peran Pelaku</Label>
                <Input className="mt-1.5" value={formState.actor_role} onChange={(e) => setFormState((prev) => ({ ...prev, actor_role: e.target.value }))} />
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

        <OrgPayrollPageGuide pathname="/org/payroll/audit-log" />
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
