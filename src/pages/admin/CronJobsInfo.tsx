import { useCallback, useEffect, useMemo, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function CronJobsInfo() {
  const [tasks, setTasks] = useState<CronTaskRow[]>([]);
  const [runs, setRuns] = useState<CronRunRow[]>([]);
  const [appLogs, setAppLogs] = useState<AppCronLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [query, setQuery] = useState("");

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tasksRes, runsRes, logsRes] = await Promise.all([
        rpcUntyped("get_cron_jobs_overview"),
        rpcUntyped("get_cron_recent_runs", { p_limit: 100 }),
        supabase
          .from("cron_job_logs")
          .select("id, job_name, status, started_at, completed_at, error_message")
          .order("started_at", { ascending: false })
          .limit(100),
      ]);

      if (tasksRes.error) throw new Error(tasksRes.error.message || "Gagal memuat task cron");
      if (runsRes.error) throw new Error(runsRes.error.message || "Gagal memuat run cron");
      if (logsRes.error) throw logsRes.error;

      setTasks(Array.isArray(tasksRes.data) ? (tasksRes.data as CronTaskRow[]) : []);
      setRuns(Array.isArray(runsRes.data) ? (runsRes.data as CronRunRow[]) : []);
      setAppLogs(logsRes.data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.cron_jobs.fetch");
      console.error(`[${errorRef}] Failed to fetch cron dashboard data`, error);
      toast.error(`Gagal memuat data cron [Log: ${errorRef}]`);
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
    } catch (error) {
      const errorRef = reportError(error, "admin.cron_jobs.sync");
      console.error(`[${errorRef}] Failed syncing cron jobs`, error);
      toast.error(`Sinkron cron gagal [Log: ${errorRef}]`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SuperAdminLayout title="Informasi Cron Jobs" subtitle="Pusat informasi seluruh tugas cron sistem">
      <div className="space-y-6">
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
                      runs.map((row) => (
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
                      appLogs.map((row) => (
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SuperAdminLayout>
  );
}
