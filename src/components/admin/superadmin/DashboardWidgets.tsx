import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  Building2, 
  Users, 
  CreditCard, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  MessageSquare,
  ShieldAlert,
  CalendarClock,
  Wrench
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface Stats {
  totalTenants: number;
  activeTenants: number;
  totalEmployees: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiredSubscriptions: number;
  todayAttendance: number;
  pendingLeaves: number;
  readyForInvoicing: number;
  pendingInvoices: number;
  overdueInvoices: number;
  failedCronRuns24h: number;
  openFeedbacks: number;
  openBugs: number;
  lockedOtpUsers: number;
  trends: {
    tenants: { label: string; trendUp: boolean };
    employees: { label: string; trendUp: boolean };
    subscriptions: { label: string; trendUp: boolean };
    attendance: { label: string; trendUp: boolean };
  };
}

interface StatsCachePayload {
  stats: Stats;
  updatedAt: string;
}

interface DashboardSnapshotRpcRow {
  payload: unknown;
  computed_at: string | null;
  source: string | null;
  count_mode: string | null;
}

const DASHBOARD_STATS_CACHE_KEY = "admin.dashboard.widgets.stats.v1";
const DASHBOARD_STATS_CACHE_TTL_MS = 60 * 1000;
const DASHBOARD_AUTO_REFRESH_MS = 2 * 60 * 1000;
const DASHBOARD_COUNT_MODE = "planned" as const;
const DASHBOARD_WIDGETS_READ_TIMEOUT_MS = 12000;
const DASHBOARD_WIDGETS_MAX_RETRIES = 2;

const DEFAULT_STATS: Stats = {
  totalTenants: 0,
  activeTenants: 0,
  totalEmployees: 0,
  activeSubscriptions: 0,
  trialSubscriptions: 0,
  expiredSubscriptions: 0,
  todayAttendance: 0,
  pendingLeaves: 0,
  readyForInvoicing: 0,
  pendingInvoices: 0,
  overdueInvoices: 0,
  failedCronRuns24h: 0,
  openFeedbacks: 0,
  openBugs: 0,
  lockedOtpUsers: 0,
  trends: {
    tenants: { label: "0% vs 30 hari lalu", trendUp: true },
    employees: { label: "0% vs 30 hari lalu", trendUp: true },
    subscriptions: { label: "0% vs 30 hari lalu", trendUp: true },
    attendance: { label: "0% vs kemarin", trendUp: true },
  },
};

const isValidStats = (value: unknown): value is Stats => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.totalTenants === "number" &&
    typeof v.totalEmployees === "number" &&
    typeof v.activeSubscriptions === "number" &&
    typeof v.todayAttendance === "number"
  );
};

const readStatsCache = (): { stats: Stats; updatedAt: Date; isStale: boolean } | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StatsCachePayload;
    if (!parsed || !isValidStats(parsed.stats) || typeof parsed.updatedAt !== "string") return null;
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return null;
    const isStale = Date.now() - updatedAt.getTime() > DASHBOARD_STATS_CACHE_TTL_MS;
    return { stats: parsed.stats, updatedAt, isStale };
  } catch {
    return null;
  }
};

const writeStatsCache = (stats: Stats, updatedAt: Date) => {
  if (typeof window === "undefined") return;
  try {
    const payload: StatsCachePayload = {
      stats,
      updatedAt: updatedAt.toISOString(),
    };
    window.localStorage.setItem(DASHBOARD_STATS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/private mode failures.
  }
};

const isAttendancePeakHourJakarta = (date = new Date()): boolean => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeStr = formatter.format(date); // HH:mm
  const [hourStr, minuteStr] = timeStr.split(":");
  const minutes = Number(hourStr) * 60 + Number(minuteStr);

  const windows = [
    { start: 6 * 60, end: 9 * 60 }, // 06:00-09:00
    { start: 15 * 60, end: 18 * 60 + 30 }, // 15:00-18:30
  ];

  return windows.some((window) => minutes >= window.start && minutes < window.end);
};

export function DashboardWidgets() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUsingCachedSnapshot, setIsUsingCachedSnapshot] = useState(false);
  const [snapshotSource, setSnapshotSource] = useState<"fresh" | "cache" | "legacy" | "peak_cache" | null>(null);
  const [snapshotCountMode, setSnapshotCountMode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const fetchStats = async (options?: { silent?: boolean; forceRefresh?: boolean }) => {
    const isSilent = options?.silent ?? false;
    try {
      if (isSilent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setIsRetrying(false);
      setLoadError(null);
      const today = new Date().toISOString().split('T')[0];
      const nowIso = new Date().toISOString();
      const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Primary path: use server snapshot RPC (cached in DB) to avoid heavy count queries per page load.
      try {
        const { data: snapshotData, error: snapshotError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.rpc("get_admin_dashboard_snapshot", {
                p_force_refresh: options?.forceRefresh ?? false,
                p_max_age_seconds: 180,
              }),
              DASHBOARD_WIDGETS_READ_TIMEOUT_MS,
              "Permintaan snapshot dashboard timeout."
            ),
          {
            maxRetries: DASHBOARD_WIDGETS_MAX_RETRIES,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (snapshotError) {
          throw snapshotError;
        }
        const snapshotRow = (Array.isArray(snapshotData) ? snapshotData[0] : null) as DashboardSnapshotRpcRow | null;
        if (snapshotRow && isValidStats(snapshotRow.payload)) {
          const updatedAt = snapshotRow.computed_at ? new Date(snapshotRow.computed_at) : new Date();
          setStats(snapshotRow.payload);
          setLastUpdatedAt(Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt);
          setIsUsingCachedSnapshot(false);
          const source = snapshotRow.source === "peak_cache"
            ? "peak_cache"
            : snapshotRow.source === "cache"
              ? "cache"
              : "fresh";
          setSnapshotSource(source);
          setSnapshotCountMode(snapshotRow.count_mode || "snapshot");
          writeStatsCache(snapshotRow.payload, Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt);
          return;
        }
        throw new Error("Invalid dashboard snapshot payload");
      } catch (snapshotFetchError) {
        reportError(snapshotFetchError, "admin.dashboard.widgets.fetch_snapshot");
      }

      const [
        tenantsRes,
        activeTenantsRes,
        employeesRes,
        activeSubsRes,
        trialSubsRes,
        expiredSubsRes,
        attendanceRes,
        leavesRes,
        readyForInvoicingRes,
        pendingInvoicesRes,
        awaitingInvoicesRes,
        overdueInvoicesRes,
        failedCronRunsRes,
        openFeedbackRes,
        openBugsRes,
        lockedOtpRes,
        tenantsNew30Res,
        tenantsPrev30Res,
        employeesNew30Res,
        employeesPrev30Res,
        activeSubsNew30Res,
        activeSubsPrev30Res,
        attendanceYesterdayRes,
      ] = await withTimeout(
        Promise.all([
          supabase.from("tenants").select("id", { count: DASHBOARD_COUNT_MODE, head: true }),
          supabase.from("tenants").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("is_active", true),
          supabase.from("employees").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("is_active", true),
          supabase.from("subscriptions").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "active"),
          supabase.from("subscriptions").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "trial"),
          supabase.from("subscriptions").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "expired"),
          supabase.from("attendance_records_partitioned").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("date", today),
          supabase.from("leave_requests").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "menunggu"),
          supabase.from("stability_streaks").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "ready_for_invoicing"),
          supabase.from("invoices").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "PENDING"),
          supabase.from("invoices").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "AWAITING_VERIFICATION"),
          supabase
            .from("invoices")
            .select("id", { count: DASHBOARD_COUNT_MODE, head: true })
            .in("status", ["PENDING", "AWAITING_VERIFICATION"])
            .lt("due_date", today),
          supabase
            .from("cron_job_logs")
            .select("id", { count: DASHBOARD_COUNT_MODE, head: true })
            .gte("started_at", dayAgoIso)
            .or("status.ilike.%fail%,status.ilike.%error%"),
          supabase.from("feedback_reports").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "open"),
          supabase.from("feedback_reports").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "open").eq("feedback_type", "bug"),
          supabase.from("rate_limit_otp").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).gt("locked_until", nowIso),
          supabase.from("tenants").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).gte("created_at", thirtyDaysAgoIso),
          supabase.from("tenants").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).gte("created_at", sixtyDaysAgoIso).lt("created_at", thirtyDaysAgoIso),
          supabase.from("employees").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).gte("created_at", thirtyDaysAgoIso),
          supabase.from("employees").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).gte("created_at", sixtyDaysAgoIso).lt("created_at", thirtyDaysAgoIso),
          supabase.from("subscriptions").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "active").gte("created_at", thirtyDaysAgoIso),
          supabase.from("subscriptions").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("status", "active").gte("created_at", sixtyDaysAgoIso).lt("created_at", thirtyDaysAgoIso),
          supabase.from("attendance_records_partitioned").select("id", { count: DASHBOARD_COUNT_MODE, head: true }).eq("date", yesterday),
        ]),
        DASHBOARD_WIDGETS_READ_TIMEOUT_MS,
        "Permintaan fallback statistik dashboard timeout.",
      );

      const queryErrors = [
        tenantsRes.error,
        activeTenantsRes.error,
        employeesRes.error,
        activeSubsRes.error,
        trialSubsRes.error,
        expiredSubsRes.error,
        attendanceRes.error,
        leavesRes.error,
        readyForInvoicingRes.error,
        pendingInvoicesRes.error,
        awaitingInvoicesRes.error,
        overdueInvoicesRes.error,
        failedCronRunsRes.error,
        openFeedbackRes.error,
        openBugsRes.error,
        lockedOtpRes.error,
        tenantsNew30Res.error,
        tenantsPrev30Res.error,
        employeesNew30Res.error,
        employeesPrev30Res.error,
        activeSubsNew30Res.error,
        activeSubsPrev30Res.error,
        attendanceYesterdayRes.error,
      ].filter(Boolean);

      if (queryErrors.length > 0) {
        throw queryErrors[0];
      }

      const pctTrend = (current: number, previous: number): { label: string; trendUp: boolean } => {
        if (current === 0 && previous === 0) return { label: "0% vs periode lalu", trendUp: true };
        if (previous === 0) return { label: `+${current} baru`, trendUp: true };
        const diffPct = ((current - previous) / previous) * 100;
        const rounded = Math.abs(diffPct).toFixed(1);
        return {
          label: `${diffPct >= 0 ? "+" : "-"}${rounded}% vs periode lalu`,
          trendUp: diffPct >= 0,
        };
      };

      const attendanceTrend = (() => {
        const todayCount = attendanceRes.count || 0;
        const yesterdayCount = attendanceYesterdayRes.count || 0;
        if (todayCount === 0 && yesterdayCount === 0) return { label: "0% vs kemarin", trendUp: true };
        if (yesterdayCount === 0) return { label: `+${todayCount} vs kemarin`, trendUp: true };
        const diffPct = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
        return {
          label: `${diffPct >= 0 ? "+" : "-"}${Math.abs(diffPct).toFixed(1)}% vs kemarin`,
          trendUp: diffPct >= 0,
        };
      })();

      const nextStats: Stats = {
        totalTenants: tenantsRes.count || 0,
        activeTenants: activeTenantsRes.count || 0,
        totalEmployees: employeesRes.count || 0,
        activeSubscriptions: activeSubsRes.count || 0,
        trialSubscriptions: trialSubsRes.count || 0,
        expiredSubscriptions: expiredSubsRes.count || 0,
        todayAttendance: attendanceRes.count || 0,
        pendingLeaves: leavesRes.count || 0,
        readyForInvoicing: readyForInvoicingRes.count || 0,
        pendingInvoices: (pendingInvoicesRes.count || 0) + (awaitingInvoicesRes.count || 0),
        overdueInvoices: overdueInvoicesRes.count || 0,
        failedCronRuns24h: failedCronRunsRes.count || 0,
        openFeedbacks: openFeedbackRes.count || 0,
        openBugs: openBugsRes.count || 0,
        lockedOtpUsers: lockedOtpRes.count || 0,
        trends: {
          tenants: pctTrend(tenantsNew30Res.count || 0, tenantsPrev30Res.count || 0),
          employees: pctTrend(employeesNew30Res.count || 0, employeesPrev30Res.count || 0),
          subscriptions: pctTrend(activeSubsNew30Res.count || 0, activeSubsPrev30Res.count || 0),
          attendance: attendanceTrend,
        },
      };
      const updatedAt = new Date();
      setStats(nextStats);
      setLastUpdatedAt(updatedAt);
      setIsUsingCachedSnapshot(false);
      setSnapshotSource("legacy");
      setSnapshotCountMode(DASHBOARD_COUNT_MODE);
      writeStatsCache(nextStats, updatedAt);
    } catch (error) {
      const errorRef = reportError(error, "admin.dashboard.widgets.fetch_stats");
      const message = appendErrorReference("Gagal memuat widget dashboard", errorRef);
      setLoadError(message);
      if (!isSilent) {
        toast.error(message);
      }
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = readStatsCache();
    if (cached) {
      setStats(cached.stats);
      setLastUpdatedAt(cached.updatedAt);
      setIsUsingCachedSnapshot(true);
      setIsLoading(false);
      if (cached.isStale) {
        void fetchStats({ silent: true });
      }
      return;
    }
    void fetchStats();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (isAttendancePeakHourJakarta()) {
        return;
      }
      void fetchStats({ silent: true });
    }, DASHBOARD_AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "Belum tersinkron";
    return `Terakhir sinkron ${lastUpdatedAt.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  }, [lastUpdatedAt]);

  const navigateToSubscriptions = (status?: "active" | "trial" | "expired") => {
    if (!status) {
      navigate("/admin/subscriptions");
      return;
    }
    navigate(`/admin/subscriptions?status=${encodeURIComponent(status)}`);
  };

  const navigateToBilling = (status?: "PENDING" | "OVERDUE") => {
    if (!status) {
      navigate("/admin/billing");
      return;
    }
    navigate(`/admin/billing?status=${encodeURIComponent(status)}`);
  };

  const widgets = [
    {
      title: "Total Organisasi",
      value: stats.totalTenants,
      subtitle: `${stats.activeTenants} aktif`,
      icon: Building2,
      trend: stats.trends.tenants.label,
      trendUp: stats.trends.tenants.trendUp,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total Pegawai",
      value: stats.totalEmployees,
      subtitle: "Semua organisasi",
      icon: Users,
      trend: stats.trends.employees.label,
      trendUp: stats.trends.employees.trendUp,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Langganan Aktif",
      value: stats.activeSubscriptions,
      subtitle: `${stats.trialSubscriptions} trial`,
      icon: CreditCard,
      trend: stats.trends.subscriptions.label,
      trendUp: stats.trends.subscriptions.trendUp,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Absensi Hari Ini",
      value: stats.todayAttendance,
      subtitle: "Check-in tercatat",
      icon: Activity,
      trend: stats.trends.attendance.label,
      trendUp: stats.trends.attendance.trendUp,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16 mb-2"></div>
              <div className="h-3 bg-muted rounded w-20"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}
      {isRetrying && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Sedang mencoba ulang memuat widget dashboard...
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p>{lastUpdatedLabel}</p>
          {isUsingCachedSnapshot && (
            <Badge variant="outline" className="text-[10px]">
              Snapshot cepat
            </Badge>
          )}
          {snapshotSource && (
            <Badge variant="outline" className="text-[10px]">
              Snapshot {snapshotSource === "peak_cache" ? "peak-hour cache" : snapshotSource}
            </Badge>
          )}
          {snapshotCountMode && (
            <Badge variant="outline" className="text-[10px]">
              Count {snapshotCountMode}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isRefreshing}
          onClick={() => fetchStats({ silent: true, forceRefresh: true })}
        >
          {isRefreshing ? "Menyegarkan..." : "Muat Ulang Data"}
        </Button>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">KPI Utama</p>
        <h2 className="text-lg font-semibold">Ringkasan performa hari ini</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {widgets.map((widget) => (
          <Card key={widget.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {widget.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${widget.bgColor}`}>
                <widget.icon className={`h-4 w-4 ${widget.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{widget.value.toLocaleString()}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">{widget.subtitle}</p>
                <Badge 
                  variant="secondary" 
                  className={`text-[10px] ${widget.trendUp ? 'text-green-600' : 'text-red-600'}`}
                >
                  {widget.trendUp ? (
                    <ArrowUpRight className="h-3 w-3 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 mr-0.5" />
                  )}
                  {widget.trend}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Insight Operasional</p>
        <h2 className="text-lg font-semibold">Area prioritas untuk tindak lanjut</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Langganan</CardTitle>
            <CardDescription>Distribusi status langganan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="space-y-2 cursor-pointer rounded-md p-1 -m-1 transition-colors hover:bg-muted/40"
              onClick={() => navigateToSubscriptions("active")}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Aktif
                </span>
                <span className="font-medium">{stats.activeSubscriptions}</span>
              </div>
              <Progress 
                value={stats.totalTenants ? (stats.activeSubscriptions / stats.totalTenants) * 100 : 0} 
                className="h-2 bg-green-100"
              />
            </div>
            <div
              className="space-y-2 cursor-pointer rounded-md p-1 -m-1 transition-colors hover:bg-muted/40"
              onClick={() => navigateToSubscriptions("trial")}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Masa Coba
                </span>
                <span className="font-medium">{stats.trialSubscriptions}</span>
              </div>
              <Progress 
                value={stats.totalTenants ? (stats.trialSubscriptions / stats.totalTenants) * 100 : 0} 
                className="h-2 bg-amber-100"
              />
            </div>
            <div
              className="space-y-2 cursor-pointer rounded-md p-1 -m-1 transition-colors hover:bg-muted/40"
              onClick={() => navigateToSubscriptions("expired")}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Berakhir
                </span>
                <span className="font-medium">{stats.expiredSubscriptions}</span>
              </div>
              <Progress 
                value={stats.totalTenants ? (stats.expiredSubscriptions / stats.totalTenants) * 100 : 0} 
                className="h-2 bg-red-100"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perlu Perhatian</CardTitle>
            <CardDescription>Item yang membutuhkan tindakan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.expiredSubscriptions > 0 && (
              <div
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 transition-colors hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:hover:bg-red-500/20"
                onClick={() => navigateToSubscriptions("expired")}
              >
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    {stats.expiredSubscriptions} langganan expired
                  </p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">
                    Perlu follow up
                  </p>
                </div>
              </div>
            )}
            {stats.pendingLeaves > 0 && (
              <div
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:hover:bg-amber-500/20"
                onClick={() => navigate("/admin/leave-approvals")}
              >
                <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {stats.pendingLeaves} pengajuan pending
                  </p>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
                    Menunggu approval
                  </p>
                </div>
              </div>
            )}
            {stats.expiredSubscriptions === 0 && stats.pendingLeaves === 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Semua beres!
                  </p>
                  <p className="text-xs text-green-600/70 dark:text-green-400/70">
                    Tidak ada item pending
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Streak & Billing</CardTitle>
            <CardDescription>Status tagihan berbasis streak</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              onClick={() => navigate("/admin/streak-monitoring?status=ready_for_invoicing")}
            >
              <span className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Siap Ditagih
              </span>
              <Badge variant="outline">{stats.readyForInvoicing}</Badge>
            </div>
            <div
              className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              onClick={() => navigateToBilling("PENDING")}
            >
              <span className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-500" />
                Tagihan tertunda
              </span>
              <Badge variant="outline">{stats.pendingInvoices}</Badge>
            </div>
            <div
              className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              onClick={() => navigateToBilling("OVERDUE")}
            >
              <span className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Tagihan lewat jatuh tempo
              </span>
              <Badge variant={stats.overdueInvoices > 0 ? "destructive" : "outline"}>{stats.overdueInvoices}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operasional & Security</CardTitle>
            <CardDescription>Pemantauan cron, feedback, dan kunci login</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              onClick={() => navigate("/admin/cron-jobs")}
            >
              <span className="text-sm flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-500" />
                Cron gagal (24 jam)
              </span>
              <Badge variant={stats.failedCronRuns24h > 0 ? "destructive" : "outline"}>{stats.failedCronRuns24h}</Badge>
            </div>
            <div
              className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              onClick={() => navigate("/admin/feedback?status=open")}
            >
              <span className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-500" />
                Masukan terbuka
              </span>
              <Badge variant="outline">{stats.openFeedbacks} ({stats.openBugs} Bug)</Badge>
            </div>
            <div
              className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              onClick={() => navigate("/admin/settings?tab=rate-limit")}
            >
              <span className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                OTP lock aktif
              </span>
              <Badge variant={stats.lockedOtpUsers > 0 ? "destructive" : "outline"}>{stats.lockedOtpUsers}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aksi & Status Layanan</p>
        <h2 className="text-lg font-semibold">Pintasan cepat dan kesehatan platform</h2>
      </div>
      <Card>
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/streak-monitoring")}>
              <Flame className="h-4 w-4 mr-2" />
              Buka Pemantauan Streak
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/billing")}>
              <CreditCard className="h-4 w-4 mr-2" />
              Tinjau Tagihan
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/cron-jobs")}>
              <Wrench className="h-4 w-4 mr-2" />
              Cek Cron Jobs
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/feedback")}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Kelola Masukan & Bug
            </Button>
            <Button variant="outline" className="justify-start sm:col-span-2" onClick={() => navigate("/admin/attendance-security")}>
              <ShieldAlert className="h-4 w-4 mr-2" />
              Validasi Keamanan
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between rounded-md bg-background p-2">
              <span className="text-sm">Database</span>
              <Badge variant="default" className="bg-green-500">Aktif</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md bg-background p-2">
              <span className="text-sm">API Server</span>
              <Badge variant="default" className="bg-green-500">Aktif</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md bg-background p-2">
              <span className="text-sm">Storage</span>
              <Badge variant="default" className="bg-green-500">Aktif</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
