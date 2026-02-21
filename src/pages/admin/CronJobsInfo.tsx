import { useCallback, useEffect, useMemo, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Settings2,
} from "lucide-react";

interface CronTaskRow {
  job_name: string;
  category: string;
  target: string;
  description: string;
  timezone: string;
  expected_schedule: string;
  current_schedule: string | null;
  is_scheduled: boolean;
  is_active: boolean;
  command_preview: string | null;
}

interface CronRunRow {
  run_id: number;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  return_message: string | null;
}

interface AppCronLogRow {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}
const RUNS_PER_PAGE = 20;
const LOGS_PER_PAGE = 20;

const isKnownCronInfraError = (message: string) => {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("permission denied") ||
    m.includes("schema cron") ||
    m.includes("cron.job") ||
    m.includes("get_cron_jobs_overview") ||
    m.includes("get_cron_recent_runs")
  );
};

const CRON_CATALOG_FALLBACK: CronTaskRow[] = [
  {
    job_name: "attendance-ingest-worker",
    category: "Attendance",
    target: "SQL/RPC",
    description: "Memproses queue absensi offline->DB.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "* * * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "org-dashboard-snapshot-5m",
    category: "Dashboard",
    target: "SQL/RPC",
    description: "Refresh snapshot dashboard organisasi (skip otomatis saat jam sibuk absensi).",
    timezone: "UTC (WIB +7)",
    expected_schedule: "*/5 * * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "cleanup-gps-daily",
    category: "Maintenance",
    target: "SQL/RPC",
    description: "Membersihkan GPS lama pada tabel absensi partisi.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "0 19 * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "analyze-partitions-daily",
    category: "Maintenance",
    target: "SQL/RPC",
    description: "VACUUM ANALYZE partisi absensi harian.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "0 20 * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "cleanup-audit-logs-weekly",
    category: "Maintenance",
    target: "SQL/RPC",
    description: "Pembersihan log audit mingguan.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "0 20 * * 6",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "create-next-month-partition-monthly",
    category: "Maintenance",
    target: "SQL/RPC",
    description: "Membuat partisi bulan berikutnya.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "0 18 24 * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "streak-subscription-sync-daily",
    category: "Billing",
    target: "SQL/RPC",
    description: "Sinkron status subscription terhadap grace period streak.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "10 17 * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "invoice-number-health-daily",
    category: "Billing",
    target: "SQL/RPC",
    description: "Snapshot harian kesehatan nomor faktur (valid vs invalid format).",
    timezone: "UTC (WIB +7)",
    expected_schedule: "15 17 * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "billing-grace-notifier-10m",
    category: "Billing",
    target: "Edge Function",
    description: "Kirim invoice grace period ke email/WhatsApp.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "*/10 * * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
];

const statusBadge = (status: string | null | undefined) => {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("succeed") || normalized.includes("success") || normalized.includes("done")) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Sukses</Badge>;
  }
  if (normalized.includes("running")) {
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Running</Badge>;
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return <Badge variant="destructive">Gagal</Badge>;
  }
  if (normalized === "scheduled") {
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Scheduled</Badge>;
  }
  if (normalized === "inactive") {
    return <Badge variant="secondary">Inactive</Badge>;
  }
  return <Badge variant="outline">{status || "-"}</Badge>;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd MMM yyyy HH:mm:ss", { locale: idLocale });
};

const rpcUntyped = supabase.rpc.bind(supabase) as (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message?: string } | null }>;

const callPublicRpc = async <T = unknown>(fn: string, payload?: Record<string, unknown>) => {
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env tidak tersedia untuk public RPC fallback.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Session token tidak tersedia untuk fallback RPC.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload || {}),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message?: unknown }).message || "Public RPC gagal.")
        : `Public RPC gagal (${response.status}).`;
    throw new Error(message);
  }

  return parsed as T;
};

export default function CronJobsInfo() {
  const [tasks, setTasks] = useState<CronTaskRow[]>([]);
  const [runs, setRuns] = useState<CronRunRow[]>([]);
  const [appLogs, setAppLogs] = useState<AppCronLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [partialLoadNote, setPartialLoadNote] = useState<string | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((item) =>
      item.job_name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.target.toLowerCase().includes(q)
    );
  }, [tasks, query]);

  const metrics = useMemo(() => {
    const total = tasks.length;
    const scheduled = tasks.filter((item) => item.is_scheduled).length;
    const active = tasks.filter((item) => item.is_scheduled && item.is_active).length;
    const failedRuns = runs.filter((item) => (item.status || "").toLowerCase().includes("fail")).length;
    return { total, scheduled, active, failedRuns };
  }, [tasks, runs]);
  const runsTotalPages = Math.max(1, Math.ceil(runs.length / RUNS_PER_PAGE));
  const runsPageNumbers = Array.from({ length: runsTotalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === runsTotalPages || Math.abs(page - runsPage) <= 1
  );
  const paginatedRuns = runs.slice((runsPage - 1) * RUNS_PER_PAGE, runsPage * RUNS_PER_PAGE);
  const logsTotalPages = Math.max(1, Math.ceil(appLogs.length / LOGS_PER_PAGE));
  const logsPageNumbers = Array.from({ length: logsTotalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === logsTotalPages || Math.abs(page - logsPage) <= 1
  );
  const paginatedLogs = appLogs.slice((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE);

  useEffect(() => {
    setRunsPage(1);
  }, [runs.length]);

  useEffect(() => {
    setLogsPage(1);
  }, [appLogs.length]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setIsFallbackMode(false);
    setLoadError(null);
    setPartialLoadNote(null);
    try {
      const [tasksRes, runsRes, logsRes] = await Promise.allSettled([
        rpcUntyped("get_cron_jobs_overview"),
        rpcUntyped("get_cron_recent_runs", { p_limit: 100 }),
        supabase
          .from("cron_job_logs")
          .select("id, job_name, status, started_at, completed_at, error_message")
          .order("started_at", { ascending: false })
          .limit(100),
      ]);

      const warningRefs: string[] = [];
      let knownInfraIssue = false;
      let fallbackUsed = false;

      if (tasksRes.status === "fulfilled") {
        if (tasksRes.value.error) {
          try {
            const publicTasks = await callPublicRpc<CronTaskRow[]>("get_cron_jobs_overview");
            setTasks(Array.isArray(publicTasks) ? publicTasks : []);
          } catch (publicRpcError) {
            fallbackUsed = true;
            setTasks(CRON_CATALOG_FALLBACK);
            const errorRef = reportError(
              new Error(tasksRes.value.error.message || "Gagal memuat task cron"),
              "admin.cron_jobs.tasks_rpc"
            );
            knownInfraIssue = isKnownCronInfraError(tasksRes.value.error.message || "");
            warningRefs.push(errorRef);
            const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.tasks_public_rpc");
            warningRefs.push(fallbackRef);
          }
        } else {
          setTasks(Array.isArray(tasksRes.value.data) ? (tasksRes.value.data as CronTaskRow[]) : []);
        }
      } else {
        try {
          const publicTasks = await callPublicRpc<CronTaskRow[]>("get_cron_jobs_overview");
          setTasks(Array.isArray(publicTasks) ? publicTasks : []);
        } catch (publicRpcError) {
          fallbackUsed = true;
          setTasks(CRON_CATALOG_FALLBACK);
          const errorRef = reportError(tasksRes.reason, "admin.cron_jobs.tasks_rpc_rejected");
          const reasonMessage = tasksRes.reason instanceof Error ? tasksRes.reason.message : String(tasksRes.reason || "");
          knownInfraIssue = knownInfraIssue || isKnownCronInfraError(reasonMessage);
          warningRefs.push(errorRef);
          const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.tasks_public_rpc");
          warningRefs.push(fallbackRef);
        }
      }

      if (runsRes.status === "fulfilled") {
        if (runsRes.value.error) {
          try {
            const publicRuns = await callPublicRpc<CronRunRow[]>("get_cron_recent_runs", { p_limit: 100 });
            setRuns(Array.isArray(publicRuns) ? publicRuns : []);
          } catch (publicRpcError) {
            setRuns([]);
            const errorRef = reportError(
              new Error(runsRes.value.error.message || "Gagal memuat run cron"),
              "admin.cron_jobs.runs_rpc"
            );
            knownInfraIssue = knownInfraIssue || isKnownCronInfraError(runsRes.value.error.message || "");
            warningRefs.push(errorRef);
            const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.runs_public_rpc");
            warningRefs.push(fallbackRef);
          }
        } else {
          setRuns(Array.isArray(runsRes.value.data) ? (runsRes.value.data as CronRunRow[]) : []);
        }
      } else {
        try {
          const publicRuns = await callPublicRpc<CronRunRow[]>("get_cron_recent_runs", { p_limit: 100 });
          setRuns(Array.isArray(publicRuns) ? publicRuns : []);
        } catch (publicRpcError) {
          setRuns([]);
          const errorRef = reportError(runsRes.reason, "admin.cron_jobs.runs_rpc_rejected");
          const reasonMessage = runsRes.reason instanceof Error ? runsRes.reason.message : String(runsRes.reason || "");
          knownInfraIssue = knownInfraIssue || isKnownCronInfraError(reasonMessage);
          warningRefs.push(errorRef);
          const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.runs_public_rpc");
          warningRefs.push(fallbackRef);
        }
      }

      if (logsRes.status === "fulfilled") {
        if (logsRes.value.error) {
          setAppLogs([]);
          const errorRef = reportError(logsRes.value.error, "admin.cron_jobs.logs_query");
          warningRefs.push(errorRef);
        } else {
          setAppLogs(logsRes.value.data || []);
        }
      } else {
        setAppLogs([]);
        const errorRef = reportError(logsRes.reason, "admin.cron_jobs.logs_query_rejected");
        warningRefs.push(errorRef);
      }

      if (fallbackUsed) {
        setIsFallbackMode(true);
      }
      if (warningRefs.length > 0) {
        if (knownInfraIssue) {
          setPartialLoadNote(
            `Sebagian data cron tidak tersedia di database saat ini. Jalankan migration cron terbaru. [Log: ${warningRefs[0]}]`
          );
        } else {
          setPartialLoadNote(`Sebagian data cron gagal dimuat. [Log: ${warningRefs[0]}]`);
        }
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.cron_jobs.fetch");
      const message = appendErrorReference("Gagal memuat data cron", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncJobs = async () => {
    setIsSyncing(true);
    try {
      const { error } = await rpcUntyped("ensure_system_cron_jobs");
      if (error) throw new Error(error.message || "Gagal sinkron jadwal cron");
      toast.success("Sinkron jadwal cron berhasil dijalankan.");
      await loadData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.cron_jobs.sync");
      toast.error(appendErrorReference("Sinkron cron gagal", errorRef));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SuperAdminLayout title="Informasi Cron Jobs" subtitle="Pusat informasi seluruh tugas cron sistem">
      <div className="space-y-6">
        {loadError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              {loadError}
            </CardContent>
          </Card>
        )}
        {partialLoadNote && (
          <Card className="border-slate-300 bg-slate-50/80 dark:bg-slate-900/30">
            <CardContent className="pt-6 text-sm text-slate-700 dark:text-slate-300">
              {partialLoadNote}
            </CardContent>
          </Card>
        )}
        {isFallbackMode && (
          <Card className="border-amber-300 bg-amber-50/80 dark:bg-amber-950/20">
            <CardContent className="pt-6 text-sm text-amber-900 dark:text-amber-200">
              Mode fallback aktif: RPC cron belum tersedia/bermasalah pada database saat ini.
              Halaman tetap menampilkan katalog standar. Jalankan migration Supabase terbaru lalu refresh halaman.
            </CardContent>
          </Card>
        )}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Task</CardDescription>
              <CardTitle className="text-2xl">{metrics.total}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">Seluruh task standar sistem</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Scheduled</CardDescription>
              <CardTitle className="text-2xl">{metrics.scheduled}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">Task yang sudah terdaftar di pg_cron</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Aktif</CardDescription>
              <CardTitle className="text-2xl">{metrics.active}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">Task terjadwal dengan status active</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Run Gagal (100 terbaru)</CardDescription>
              <CardTitle className="text-2xl">{metrics.failedRuns}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">Dari tabel run detail pg_cron</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />
                  Registry Cron Sistem
                </CardTitle>
                <CardDescription>Semua tugas terjadwal penting dikumpulkan di satu halaman.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
                <Button onClick={handleSyncJobs} disabled={isSyncing}>
                  {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Settings2 className="h-4 w-4 mr-2" />}
                  Sinkron Jadwal
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari job_name / kategori / target..."
            />
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Jadwal Ekspektasi</TableHead>
                      <TableHead>Jadwal Aktif</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Tidak ada task cron ditemukan
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTasks.map((row) => (
                        <TableRow key={row.job_name}>
                          <TableCell className="font-medium">{row.job_name}</TableCell>
                          <TableCell>{row.category}</TableCell>
                          <TableCell>{row.target}</TableCell>
                          <TableCell>{row.expected_schedule}</TableCell>
                          <TableCell>{row.current_schedule || "-"}</TableCell>
                          <TableCell>
                            {row.is_scheduled
                              ? row.is_active
                                ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Active</Badge>
                                : <Badge variant="secondary">Inactive</Badge>
                              : <Badge variant="outline">Belum terdaftar</Badge>}
                          </TableCell>
                          <TableCell className="max-w-[380px] truncate" title={row.description}>
                            {row.description}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="runs">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="runs">Riwayat Run pg_cron</TabsTrigger>
            <TabsTrigger value="app">Log Aplikasi</TabsTrigger>
          </TabsList>

          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5" />
                  100 Run Terbaru
                </CardTitle>
                <CardDescription>Data dari `cron.job_run_details`.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mulai</TableHead>
                      <TableHead>Selesai</TableHead>
                      <TableHead>Durasi (detik)</TableHead>
                      <TableHead>Return</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Belum ada run detail cron
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRuns.map((row) => (
                        <TableRow key={`${row.run_id}-${row.started_at}`}>
                          <TableCell className="font-medium">{row.job_name}</TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                          <TableCell>{formatDateTime(row.started_at)}</TableCell>
                          <TableCell>{formatDateTime(row.finished_at)}</TableCell>
                          <TableCell>{row.duration_seconds ?? "-"}</TableCell>
                          <TableCell className="max-w-[320px] truncate" title={row.return_message || ""}>
                            {row.return_message || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {runs.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-muted-foreground">
                      Halaman {runsPage} dari {runsTotalPages}
                    </span>
                    <Pagination className="mx-0 w-auto justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              if (runsPage > 1) {
                                setRunsPage((page) => page - 1);
                              }
                            }}
                            className={runsPage === 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        {runsPageNumbers.map((page) => (
                          <PaginationItem key={`runs-${page}`}>
                            <PaginationLink
                              href="#"
                              isActive={page === runsPage}
                              onClick={(event) => {
                                event.preventDefault();
                                setRunsPage(page);
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
                              if (runsPage < runsTotalPages) {
                                setRunsPage((page) => page + 1);
                              }
                            }}
                            className={runsPage === runsTotalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="app">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Log `cron_job_logs`
                </CardTitle>
                <CardDescription>
                  Log aplikasi internal untuk proses cron/manual maintenance yang menulis ke tabel ini.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mulai</TableHead>
                      <TableHead>Selesai</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Belum ada log aplikasi cron
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedLogs.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.job_name}</TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                          <TableCell>{formatDateTime(row.started_at)}</TableCell>
                          <TableCell>{formatDateTime(row.completed_at)}</TableCell>
                          <TableCell className="max-w-[320px] truncate" title={row.error_message || ""}>
                            {row.error_message || (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Tidak ada
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {appLogs.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-muted-foreground">
                      Halaman {logsPage} dari {logsTotalPages}
                    </span>
                    <Pagination className="mx-0 w-auto justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              if (logsPage > 1) {
                                setLogsPage((page) => page - 1);
                              }
                            }}
                            className={logsPage === 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        {logsPageNumbers.map((page) => (
                          <PaginationItem key={`logs-${page}`}>
                            <PaginationLink
                              href="#"
                              isActive={page === logsPage}
                              onClick={(event) => {
                                event.preventDefault();
                                setLogsPage(page);
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
                              if (logsPage < logsTotalPages) {
                                setLogsPage((page) => page + 1);
                              }
                            }}
                            className={logsPage === logsTotalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <PageGlossarySection preset="admin_cron_jobs" />
      </div>
    </SuperAdminLayout>
  );
}
