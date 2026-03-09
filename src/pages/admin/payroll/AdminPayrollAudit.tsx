import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ExternalLink, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { buildPostgrestOrClause, sanitizeOrKeyword } from "@/lib/postgrestSearch";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type PayrollAuditRow = Database["public"]["Tables"]["payroll_audit_logs"]["Row"];
type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];

type AuditRowView = PayrollAuditRow & {
  tenant_name: string | null;
  run_sequence: number | null;
  period_key: string | null;
};

type QuickStats = {
  critical24h: number;
  topTenantName: string;
  topTenantCount: number;
  topActionType: string;
  topActionCount: number;
};

const ITEMS_PER_PAGE = 20;

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const isCriticalAuditEntry = (row: Pick<PayrollAuditRow, "action_type" | "action_label" | "notes">) => {
  const normalizedAction = row.action_type.toLowerCase();
  if (["reject", "rollback", "failed", "error", "void"].includes(normalizedAction)) return true;
  const haystack = `${row.action_label} ${row.notes || ""}`.toLowerCase();
  return haystack.includes("error") || haystack.includes("gagal") || haystack.includes("failed");
};

export default function AdminPayrollAudit() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditRowView[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [quickStats, setQuickStats] = useState<QuickStats>({
    critical24h: 0,
    topTenantName: "-",
    topTenantCount: 0,
    topActionType: "-",
    topActionCount: 0,
  });

  const runMap = useMemo(() => new Map(runs.map((item) => [item.id, item.run_sequence])), [runs]);
  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item.period_key])), [periods]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [tenantRes, runRes, periodRes] = await Promise.all([
        supabase.from("tenants").select("id,name").order("name", { ascending: true }),
        supabase.from("payroll_runs").select("id,run_sequence").order("created_at", { ascending: false }).limit(500),
        supabase.from("payroll_periods").select("id,period_key").order("period_start", { ascending: false }).limit(500),
      ]);
      if (tenantRes.error) throw tenantRes.error;
      if (runRes.error) throw runRes.error;
      if (periodRes.error) throw periodRes.error;
      setTenants(tenantRes.data || []);
      setRuns(runRes.data || []);
      setPeriods(periodRes.data || []);
      const localTenantMap = new Map((tenantRes.data || []).map((item) => [item.id, item.name]));
      const localRunMap = new Map((runRes.data || []).map((item) => [item.id, item.run_sequence]));
      const localPeriodMap = new Map((periodRes.data || []).map((item) => [item.id, item.period_key]));

      let query = supabase.from("payroll_audit_logs").select("*", { count: "exact" });
      if (tenantFilter !== "all") query = query.eq("tenant_id", tenantFilter);
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

      const mappedRows: AuditRowView[] = (data || []).map((row) => ({
        ...row,
        tenant_name: localTenantMap.get(row.tenant_id) || null,
        run_sequence: row.run_id ? localRunMap.get(row.run_id) ?? null : null,
        period_key: row.period_id ? localPeriodMap.get(row.period_id) ?? null : null,
      }));

      setRows(mappedRows);
      setTotalRows(count || 0);

      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: last24hRows, error: statsError } = await supabase
        .from("payroll_audit_logs")
        .select("tenant_id,action_type,action_label,notes")
        .gte("created_at", sinceIso)
        .limit(5000);
      if (statsError) throw statsError;

      const tenantCounter = new Map<string, number>();
      const actionCounter = new Map<string, number>();
      let criticalCount = 0;
      for (const row of last24hRows || []) {
        const tenantCount = tenantCounter.get(row.tenant_id) || 0;
        tenantCounter.set(row.tenant_id, tenantCount + 1);

        const normalizedAction = row.action_type?.trim() || "-";
        actionCounter.set(normalizedAction, (actionCounter.get(normalizedAction) || 0) + 1);

        if (isCriticalAuditEntry(row)) {
          criticalCount += 1;
        }
      }

      const [topTenantId = "-", topTenantCount = 0] =
        [...tenantCounter.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      const [topActionType = "-", topActionCount = 0] =
        [...actionCounter.entries()].sort((a, b) => b[1] - a[1])[0] || [];

      setQuickStats({
        critical24h: criticalCount,
        topTenantName: localTenantMap.get(topTenantId) || topTenantId,
        topTenantCount,
        topActionType,
        topActionCount,
      });
    } catch (error) {
      const errorRef = reportError(error, "admin.payroll.audit.fetch");
      const message = appendErrorReference("Gagal memuat audit payroll lintas tenant", errorRef);
      toast.error(message);
      setLoadError(message);
      setRows([]);
      setTotalRows(0);
      setQuickStats({
        critical24h: 0,
        topTenantName: "-",
        topTenantCount: 0,
        topActionType: "-",
        topActionCount: 0,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantFilter, entityFilter, actionFilter, searchTerm, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, tenantFilter, entityFilter, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
  const pageStart = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const visiblePages = Array.from({ length: Math.min(3, totalPages) }, (_, idx) => pageStart + idx).filter(
    (page) => page <= totalPages
  );

  const exportCsv = () => {
    const csvRows = [
      ["created_at", "tenant", "entity_type", "entity_id", "action_type", "action_label", "run_sequence", "period_key", "trace_id", "log_id", "actor_role", "notes"],
      ...rows.map((row) => [
        row.created_at,
        row.tenant_name || row.tenant_id,
        row.entity_type,
        row.entity_id || "",
        row.action_type,
        row.action_label,
        row.run_sequence ? String(row.run_sequence) : "",
        row.period_key || "",
        row.trace_id || "",
        row.log_id,
        row.actor_role || "",
        row.notes || "",
      ]),
    ];
    const csv = csvRows.map((line) => line.map((cell) => toCsvSafe(cell)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-audit-superadmin-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SuperAdminLayout
      title="Audit Payroll"
      subtitle="Audit trail payroll lintas tenant"
      workspaceMode="payroll"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Superadmin Payroll</Badge>
              <Badge variant="secondary">Total {totalRows} log</Badge>
            </div>
            <CardTitle>Audit Log Payroll Platform</CardTitle>
            <CardDescription>
              Monitoring perubahan payroll lintas tenant untuk kebutuhan governance, investigasi, dan compliance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Kritis 24 Jam</p>
                <p className="text-xl font-semibold">{quickStats.critical24h}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Tenant Tertinggi (24 Jam)</p>
                <p className="text-sm font-semibold">{quickStats.topTenantName}</p>
                <p className="text-xs text-muted-foreground">{quickStats.topTenantCount} log</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Aksi Terbanyak (24 Jam)</p>
                <p className="text-sm font-semibold">{quickStats.topActionType}</p>
                <p className="text-xs text-muted-foreground">{quickStats.topActionCount} log</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="relative md:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari log_id, trace_id, action, entity..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tenant</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Entitas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Entitas</SelectItem>
                  <SelectItem value="payroll_run">payroll_run</SelectItem>
                  <SelectItem value="payroll_period">payroll_period</SelectItem>
                  <SelectItem value="payroll_component">payroll_component</SelectItem>
                  <SelectItem value="payout">payout</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Aksi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Aksi</SelectItem>
                  <SelectItem value="create">create</SelectItem>
                  <SelectItem value="update">update</SelectItem>
                  <SelectItem value="approve">approve</SelectItem>
                  <SelectItem value="reject">reject</SelectItem>
                  <SelectItem value="post">post</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void fetchData()} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/payroll/settings")}>
                Pengaturan Payroll
              </Button>
            </div>

            {loadError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Entitas</TableHead>
                    <TableHead>Aksi</TableHead>
                    <TableHead>Run/Periode</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="w-[140px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        {isLoading ? "Memuat audit payroll..." : "Belum ada data audit payroll."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(row.created_at)}</TableCell>
                        <TableCell>{row.tenant_name || row.tenant_id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.entity_type}</div>
                          <div className="text-xs text-muted-foreground">{row.entity_id || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.action_type}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{row.action_label}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">Run: {row.run_sequence ? `#${row.run_sequence}` : "-"}</div>
                          <div className="text-xs text-muted-foreground">Periode: {row.period_key || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono">{row.log_id}</div>
                          <div className="font-mono text-muted-foreground">{row.trace_id || "-"}</div>
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate" title={row.notes || ""}>
                          {row.notes || "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const params = new URLSearchParams();
                              if (row.tenant_id) params.set("tenant", row.tenant_id);
                              if (row.trace_id) params.set("trace", row.trace_id);
                              params.set("log", row.log_id);
                              navigate(`/admin/payroll/error-logs?${params.toString()}`);
                            }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Drill-down
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 ? (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (currentPage > 1) setCurrentPage((prev) => prev - 1);
                      }}
                    />
                  </PaginationItem>
                  {visiblePages.map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        isActive={page === currentPage}
                        onClick={(event) => {
                          event.preventDefault();
                          setCurrentPage(page);
                        }}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
