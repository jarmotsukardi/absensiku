import { useCallback, useEffect, useMemo, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { toast } from "sonner";
import {
  executeRpcWithAvailability,
  isRpcMissingFunctionError,
} from "@/lib/rpcAvailability";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface LogCleanupCronSettings {
  audit_cleanup_enabled: boolean;
  audit_cleanup_cron: string;
  error_cleanup_enabled: boolean;
  error_cleanup_cron: string;
}

interface LogCleanupCronRuntime {
  cron_available: boolean;
  audit_job_name: string;
  audit_current_schedule: string | null;
  error_job_name: string;
  error_current_schedule: string | null;
}

interface LogCleanupCronPolicy {
  settings: LogCleanupCronSettings;
  runtime: LogCleanupCronRuntime;
}

interface NotificationCleanupCronSettings {
  notification_cleanup_enabled: boolean;
  notification_cleanup_cron: string;
  notification_retention_days: number;
}

interface NotificationCleanupCronRuntime {
  cron_available: boolean;
  notification_job_name: string;
  notification_current_schedule: string | null;
}

interface NotificationCleanupCronPolicy {
  settings: NotificationCleanupCronSettings;
  runtime: NotificationCleanupCronRuntime;
}

interface DailyTimePoint {
  hour: number;
  minute: number;
}

interface DailyScheduleDraft extends DailyTimePoint {
  isDailyFixed: boolean;
}

const RUNS_PER_PAGE = 20;
const LOGS_PER_PAGE = 20;
const CRON_JOBS_QUERY_TIMEOUT_MS = 12000;
const CRON_JOBS_QUERY_RETRY_MAX = 2;
const LOG_CLEANUP_POLICY_RPC_NAME = "get_log_cleanup_cron_policy";
const NOTIFICATION_CLEANUP_POLICY_RPC_NAME = "get_notification_cleanup_policy";
const WIB_OFFSET_MINUTES = 7 * 60;
const NOTIFICATION_RETENTION_MIN_DAYS = 1;
const NOTIFICATION_RETENTION_MAX_DAYS = 3650;
const CRON_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour.toString().padStart(2, "0"));
const CRON_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => minute.toString().padStart(2, "0"));

const DEFAULT_LOG_CLEANUP_SETTINGS: LogCleanupCronSettings = {
  audit_cleanup_enabled: true,
  audit_cleanup_cron: "10 20 * * *",
  error_cleanup_enabled: true,
  error_cleanup_cron: "0 18 * * *",
};

const DEFAULT_LOG_CLEANUP_RUNTIME: LogCleanupCronRuntime = {
  cron_available: false,
  audit_job_name: "cleanup-audit-logs-daily-dynamic",
  audit_current_schedule: null,
  error_job_name: "client-error-logs-retention-daily",
  error_current_schedule: null,
};

const DEFAULT_NOTIFICATION_CLEANUP_SETTINGS: NotificationCleanupCronSettings = {
  notification_cleanup_enabled: true,
  notification_cleanup_cron: "30 20 * * *",
  notification_retention_days: 30,
};

const DEFAULT_NOTIFICATION_CLEANUP_RUNTIME: NotificationCleanupCronRuntime = {
  cron_available: false,
  notification_job_name: "notifications-retention-daily",
  notification_current_schedule: null,
};

const normalizeCronExpression = (value: string) => value.trim().replace(/\s+/g, " ");

const splitCronExpression = (value: string) => {
  const normalized = normalizeCronExpression(value);
  if (!normalized) return [];
  return normalized.split(" ");
};

const isFivePartCronExpression = (value: string) => splitCronExpression(value).length === 5;

const parseCronNumericField = (value: string, min: number, max: number) => {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
};

const parseUtcDailyCron = (cronExpression: string): DailyTimePoint | null => {
  const parts = splitCronExpression(cronExpression);
  if (parts.length !== 5) return null;
  if (parts[2] !== "*" || parts[3] !== "*" || parts[4] !== "*") return null;

  const minute = parseCronNumericField(parts[0], 0, 59);
  const hour = parseCronNumericField(parts[1], 0, 23);
  if (minute === null || hour === null) return null;

  return { hour, minute };
};

const toWibFromUtcTime = ({ hour, minute }: DailyTimePoint): DailyTimePoint => {
  const utcTotalMinutes = hour * 60 + minute;
  const wibTotalMinutes = (utcTotalMinutes + WIB_OFFSET_MINUTES) % (24 * 60);
  return {
    hour: Math.floor(wibTotalMinutes / 60),
    minute: wibTotalMinutes % 60,
  };
};

const toUtcDailyCronFromWib = ({ hour, minute }: DailyTimePoint) => {
  const wibTotalMinutes = hour * 60 + minute;
  const utcTotalMinutes = (wibTotalMinutes - WIB_OFFSET_MINUTES + 24 * 60) % (24 * 60);
  const utcHour = Math.floor(utcTotalMinutes / 60);
  const utcMinute = utcTotalMinutes % 60;
  return `${utcMinute} ${utcHour} * * *`;
};

const getDailyScheduleDraft = (
  cronExpression: string,
  fallbackCronExpression: string,
): DailyScheduleDraft => {
  const parsedCurrent = parseUtcDailyCron(cronExpression);
  if (parsedCurrent) {
    const asWib = toWibFromUtcTime(parsedCurrent);
    return { ...asWib, isDailyFixed: true };
  }

  const parsedFallback = parseUtcDailyCron(fallbackCronExpression) ?? { hour: 0, minute: 0 };
  const fallbackAsWib = toWibFromUtcTime(parsedFallback);
  return { ...fallbackAsWib, isDailyFixed: false };
};

const isKnownCronInfraError = (message: string) => {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("permission denied") ||
    m.includes("schema cron") ||
    m.includes("cron.job") ||
    m.includes("get_cron_jobs_overview") ||
    m.includes("get_cron_recent_runs") ||
    m.includes("get_log_cleanup_cron_policy") ||
    m.includes("configure_log_cleanup_cron_jobs") ||
    m.includes("get_notification_cleanup_policy") ||
    m.includes("configure_notification_cleanup_cron") ||
    m.includes("apply_notifications_retention")
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
    category: "Dasbor",
    target: "SQL/RPC",
    description: "Muat ulang snapshot dasbor organisasi (skip otomatis saat jam sibuk absensi).",
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
    job_name: "cleanup-audit-logs-daily-dynamic",
    category: "Maintenance",
    target: "SQL/RPC",
    description: "Pembersihan log audit harian mengikuti retensi aktif.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "10 20 * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "client-error-logs-retention-daily",
    category: "Maintenance",
    target: "SQL/RPC",
    description: "Pembersihan log error client harian sesuai retensi.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "0 18 * * *",
    current_schedule: null,
    is_scheduled: false,
    is_active: false,
    command_preview: null,
  },
  {
    job_name: "notifications-retention-daily",
    category: "Maintenance",
    target: "SQL/RPC",
    description: "Pembersihan riwayat notifikasi harian sesuai retensi hari.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "30 20 * * *",
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
  {
    job_name: "device-push-dispatcher-5m",
    category: "Notifikasi",
    target: "Edge Function",
    description: "Kirim notifikasi push APK Android dari tabel notifications ke perangkat aktif.",
    timezone: "UTC (WIB +7)",
    expected_schedule: "*/5 * * * *",
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
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Berjalan</Badge>;
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

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

const toStringWithFallback = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const toPositiveInteger = (value: unknown, fallback: number, minimum = 1) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.trunc(value), minimum);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(parsed, minimum);
    }
  }
  return Math.max(fallback, minimum);
};

const normalizeNotificationRetentionDays = (
  value: unknown,
  fallback = DEFAULT_NOTIFICATION_CLEANUP_SETTINGS.notification_retention_days,
) => {
  const minimumBounded = toPositiveInteger(value, fallback, NOTIFICATION_RETENTION_MIN_DAYS);
  return Math.min(minimumBounded, NOTIFICATION_RETENTION_MAX_DAYS);
};

const normalizeLogCleanupPolicy = (value: unknown): LogCleanupCronPolicy => {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const rawSettings =
    typeof raw.settings === "object" && raw.settings !== null
      ? (raw.settings as Record<string, unknown>)
      : {};
  const rawRuntime =
    typeof raw.runtime === "object" && raw.runtime !== null
      ? (raw.runtime as Record<string, unknown>)
      : {};

  return {
    settings: {
      audit_cleanup_enabled: toBoolean(
        rawSettings.audit_cleanup_enabled,
        DEFAULT_LOG_CLEANUP_SETTINGS.audit_cleanup_enabled,
      ),
      audit_cleanup_cron: toStringWithFallback(
        rawSettings.audit_cleanup_cron,
        DEFAULT_LOG_CLEANUP_SETTINGS.audit_cleanup_cron,
      ),
      error_cleanup_enabled: toBoolean(
        rawSettings.error_cleanup_enabled,
        DEFAULT_LOG_CLEANUP_SETTINGS.error_cleanup_enabled,
      ),
      error_cleanup_cron: toStringWithFallback(
        rawSettings.error_cleanup_cron,
        DEFAULT_LOG_CLEANUP_SETTINGS.error_cleanup_cron,
      ),
    },
    runtime: {
      cron_available: toBoolean(rawRuntime.cron_available, DEFAULT_LOG_CLEANUP_RUNTIME.cron_available),
      audit_job_name: toStringWithFallback(
        rawRuntime.audit_job_name,
        DEFAULT_LOG_CLEANUP_RUNTIME.audit_job_name,
      ),
      audit_current_schedule:
        typeof rawRuntime.audit_current_schedule === "string"
          ? rawRuntime.audit_current_schedule
          : DEFAULT_LOG_CLEANUP_RUNTIME.audit_current_schedule,
      error_job_name: toStringWithFallback(
        rawRuntime.error_job_name,
        DEFAULT_LOG_CLEANUP_RUNTIME.error_job_name,
      ),
      error_current_schedule:
        typeof rawRuntime.error_current_schedule === "string"
          ? rawRuntime.error_current_schedule
          : DEFAULT_LOG_CLEANUP_RUNTIME.error_current_schedule,
    },
  };
};

const normalizeNotificationCleanupPolicy = (value: unknown): NotificationCleanupCronPolicy => {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const rawSettings =
    typeof raw.settings === "object" && raw.settings !== null
      ? (raw.settings as Record<string, unknown>)
      : {};
  const rawRuntime =
    typeof raw.runtime === "object" && raw.runtime !== null
      ? (raw.runtime as Record<string, unknown>)
      : {};

  return {
    settings: {
      notification_cleanup_enabled: toBoolean(
        rawSettings.notification_cleanup_enabled,
        DEFAULT_NOTIFICATION_CLEANUP_SETTINGS.notification_cleanup_enabled,
      ),
      notification_cleanup_cron: toStringWithFallback(
        rawSettings.notification_cleanup_cron,
        DEFAULT_NOTIFICATION_CLEANUP_SETTINGS.notification_cleanup_cron,
      ),
      notification_retention_days: normalizeNotificationRetentionDays(
        rawSettings.notification_retention_days,
        DEFAULT_NOTIFICATION_CLEANUP_SETTINGS.notification_retention_days,
      ),
    },
    runtime: {
      cron_available: toBoolean(rawRuntime.cron_available, DEFAULT_NOTIFICATION_CLEANUP_RUNTIME.cron_available),
      notification_job_name: toStringWithFallback(
        rawRuntime.notification_job_name,
        DEFAULT_NOTIFICATION_CLEANUP_RUNTIME.notification_job_name,
      ),
      notification_current_schedule:
        typeof rawRuntime.notification_current_schedule === "string"
          ? rawRuntime.notification_current_schedule
          : DEFAULT_NOTIFICATION_CLEANUP_RUNTIME.notification_current_schedule,
    },
  };
};

const sortCronTasks = (rows: CronTaskRow[]) =>
  [...rows].sort((a, b) => {
    const categoryCompare = a.category.localeCompare(b.category);
    if (categoryCompare !== 0) return categoryCompare;
    return a.job_name.localeCompare(b.job_name);
  });

const normalizeCronTasksWithLogCleanupPolicy = (
  rows: CronTaskRow[],
  policy: LogCleanupCronSettings,
  notificationPolicy: NotificationCleanupCronPolicy,
): CronTaskRow[] => {
  const notificationSettings = notificationPolicy.settings;
  const notificationRuntime = notificationPolicy.runtime;
  const map = new Map(rows.map((row) => [row.job_name, row] as const));
  const weeklyAuditJob = map.get("cleanup-audit-logs-weekly");
  map.delete("cleanup-audit-logs-weekly");

  const existingAuditJob = map.get("cleanup-audit-logs-daily-dynamic");
  map.set("cleanup-audit-logs-daily-dynamic", {
    ...(weeklyAuditJob ?? existingAuditJob ?? {
      job_name: "cleanup-audit-logs-daily-dynamic",
      category: "Maintenance",
      target: "SQL/RPC",
      description: "Pembersihan log audit harian mengikuti retensi aktif.",
      timezone: "UTC (WIB +7)",
      expected_schedule: policy.audit_cleanup_cron,
      current_schedule: null,
      is_scheduled: false,
      is_active: false,
      command_preview: null,
    }),
    job_name: "cleanup-audit-logs-daily-dynamic",
    description: "Pembersihan log audit harian mengikuti retensi aktif.",
    expected_schedule: policy.audit_cleanup_cron,
  });

  const existingErrorJob = map.get("client-error-logs-retention-daily");
  map.set("client-error-logs-retention-daily", {
    ...(existingErrorJob ?? {
      job_name: "client-error-logs-retention-daily",
      category: "Maintenance",
      target: "SQL/RPC",
      description: "Pembersihan log error client harian sesuai retensi.",
      timezone: "UTC (WIB +7)",
      expected_schedule: policy.error_cleanup_cron,
      current_schedule: null,
      is_scheduled: false,
      is_active: false,
      command_preview: null,
    }),
    job_name: "client-error-logs-retention-daily",
    description: "Pembersihan log error client harian sesuai retensi.",
    expected_schedule: policy.error_cleanup_cron,
  });

  const existingNotificationJob = map.get("notifications-retention-daily");
  map.set("notifications-retention-daily", {
    ...(existingNotificationJob ?? {
      job_name: "notifications-retention-daily",
      category: "Maintenance",
      target: "SQL/RPC",
      description: "Pembersihan riwayat notifikasi harian sesuai retensi hari.",
      timezone: "UTC (WIB +7)",
      expected_schedule: notificationSettings.notification_cleanup_cron,
      current_schedule: notificationRuntime.notification_current_schedule,
      is_scheduled: Boolean(notificationRuntime.notification_current_schedule),
      is_active:
        notificationSettings.notification_cleanup_enabled &&
        Boolean(notificationRuntime.notification_current_schedule),
      command_preview: null,
    }),
    job_name: "notifications-retention-daily",
    description: `Pembersihan riwayat notifikasi otomatis. Retensi: ${notificationSettings.notification_retention_days} hari.`,
    expected_schedule: notificationSettings.notification_cleanup_cron,
    current_schedule:
      existingNotificationJob?.current_schedule ?? notificationRuntime.notification_current_schedule,
    is_scheduled:
      existingNotificationJob?.is_scheduled ?? Boolean(notificationRuntime.notification_current_schedule),
    is_active:
      existingNotificationJob?.is_active ??
      (notificationSettings.notification_cleanup_enabled &&
        Boolean(notificationRuntime.notification_current_schedule)),
  });

  return sortCronTasks(Array.from(map.values()));
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
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase env tidak tersedia untuk public RPC fallback.");
  }

  const {
    data: { session },
  } = await withTimeout(
    supabase.auth.getSession(),
    CRON_JOBS_QUERY_TIMEOUT_MS,
    "Memuat session untuk fallback RPC terlalu lama.",
  );
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Session token tidak tersedia untuk fallback RPC.");
  }

  const response = await withTimeout(
    fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload || {}),
    }),
    CRON_JOBS_QUERY_TIMEOUT_MS,
    `Fallback RPC ${fn} timeout.`,
  );

  const text = await withTimeout(
    response.text(),
    CRON_JOBS_QUERY_TIMEOUT_MS,
    `Membaca respons fallback RPC ${fn} timeout.`,
  );
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

export default function CronJobsInfo({ embedded = false }: { embedded?: boolean }) {
  const [tasks, setTasks] = useState<CronTaskRow[]>([]);
  const [runs, setRuns] = useState<CronRunRow[]>([]);
  const [appLogs, setAppLogs] = useState<AppCronLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [query, setQuery] = useState("");
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [partialLoadNote, setPartialLoadNote] = useState<string | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [logCleanupPolicy, setLogCleanupPolicy] = useState<LogCleanupCronPolicy>({
    settings: DEFAULT_LOG_CLEANUP_SETTINGS,
    runtime: DEFAULT_LOG_CLEANUP_RUNTIME,
  });
  const [logCleanupDraft, setLogCleanupDraft] = useState<LogCleanupCronSettings>(DEFAULT_LOG_CLEANUP_SETTINGS);
  const [notificationCleanupPolicy, setNotificationCleanupPolicy] = useState<NotificationCleanupCronPolicy>({
    settings: DEFAULT_NOTIFICATION_CLEANUP_SETTINGS,
    runtime: DEFAULT_NOTIFICATION_CLEANUP_RUNTIME,
  });
  const [notificationCleanupDraft, setNotificationCleanupDraft] = useState<NotificationCleanupCronSettings>(
    DEFAULT_NOTIFICATION_CLEANUP_SETTINGS,
  );
  const [isSavingLogPolicy, setIsSavingLogPolicy] = useState(false);
  const [isSavingNotificationPolicy, setIsSavingNotificationPolicy] = useState(false);
  const [isRunningNotificationCleanup, setIsRunningNotificationCleanup] = useState(false);

  const normalizedTasks = useMemo(
    () =>
      normalizeCronTasksWithLogCleanupPolicy(
        tasks,
        logCleanupPolicy.settings,
        notificationCleanupPolicy,
      ),
    [tasks, logCleanupPolicy.settings, notificationCleanupPolicy]
  );

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedTasks;
    return normalizedTasks.filter((item) =>
      item.job_name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.target.toLowerCase().includes(q)
    );
  }, [normalizedTasks, query]);

  const metrics = useMemo(() => {
    const total = normalizedTasks.length;
    const scheduled = normalizedTasks.filter((item) => item.is_scheduled).length;
    const active = normalizedTasks.filter((item) => item.is_scheduled && item.is_active).length;
    const failedRuns = runs.filter((item) => (item.status || "").toLowerCase().includes("fail")).length;
    return { total, scheduled, active, failedRuns };
  }, [normalizedTasks, runs]);
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
  const auditScheduleDraft = useMemo(
    () =>
      getDailyScheduleDraft(
        logCleanupDraft.audit_cleanup_cron,
        DEFAULT_LOG_CLEANUP_SETTINGS.audit_cleanup_cron,
      ),
    [logCleanupDraft.audit_cleanup_cron],
  );
  const errorScheduleDraft = useMemo(
    () =>
      getDailyScheduleDraft(
        logCleanupDraft.error_cleanup_cron,
        DEFAULT_LOG_CLEANUP_SETTINGS.error_cleanup_cron,
      ),
    [logCleanupDraft.error_cleanup_cron],
  );
  const notificationScheduleDraft = useMemo(
    () =>
      getDailyScheduleDraft(
        notificationCleanupDraft.notification_cleanup_cron,
        DEFAULT_NOTIFICATION_CLEANUP_SETTINGS.notification_cleanup_cron,
      ),
    [notificationCleanupDraft.notification_cleanup_cron],
  );

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
    setIsRetrying(false);
    try {
      const [tasksRes, runsRes, logsRes, logCleanupPolicyRes, notificationCleanupPolicyRes] = await Promise.allSettled([
        withExponentialBackoff(
          () =>
            withTimeout(
              rpcUntyped("get_cron_jobs_overview"),
              CRON_JOBS_QUERY_TIMEOUT_MS,
              "admin.cron_jobs.tasks timeout"
            ),
          {
            maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              rpcUntyped("get_cron_recent_runs", { p_limit: 100 }),
              CRON_JOBS_QUERY_TIMEOUT_MS,
              "admin.cron_jobs.runs timeout"
            ),
          {
            maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("cron_job_logs")
                .select("id, job_name, status, started_at, completed_at, error_message")
                .order("started_at", { ascending: false })
                .limit(100),
              CRON_JOBS_QUERY_TIMEOUT_MS,
              "admin.cron_jobs.logs timeout"
            ),
          {
            maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              executeRpcWithAvailability(LOG_CLEANUP_POLICY_RPC_NAME, () => rpcUntyped(LOG_CLEANUP_POLICY_RPC_NAME)),
              CRON_JOBS_QUERY_TIMEOUT_MS,
              "admin.cron_jobs.log_cleanup_policy timeout"
            ),
          {
            maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              executeRpcWithAvailability(
                NOTIFICATION_CLEANUP_POLICY_RPC_NAME,
                () => rpcUntyped(NOTIFICATION_CLEANUP_POLICY_RPC_NAME),
              ),
              CRON_JOBS_QUERY_TIMEOUT_MS,
              "admin.cron_jobs.notification_cleanup_policy timeout"
            ),
          {
            maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
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

      if (logCleanupPolicyRes.status === "fulfilled") {
        if (logCleanupPolicyRes.value.error) {
          const fallbackPolicy = {
            settings: DEFAULT_LOG_CLEANUP_SETTINGS,
            runtime: DEFAULT_LOG_CLEANUP_RUNTIME,
          };
          const sourceMessage =
            logCleanupPolicyRes.value.error instanceof Error
              ? logCleanupPolicyRes.value.error.message
              : String(logCleanupPolicyRes.value.error || "Gagal memuat kebijakan auto-clean log.");
          try {
            const publicPolicy = await callPublicRpc<LogCleanupCronPolicy>(LOG_CLEANUP_POLICY_RPC_NAME);
            const normalized = normalizeLogCleanupPolicy(publicPolicy);
            setLogCleanupPolicy(normalized);
            setLogCleanupDraft(normalized.settings);
          } catch (publicRpcError) {
            setLogCleanupPolicy(fallbackPolicy);
            setLogCleanupDraft(fallbackPolicy.settings);
            const isMissingRpc =
              isRpcMissingFunctionError(logCleanupPolicyRes.value.error) || isRpcMissingFunctionError(publicRpcError);
            knownInfraIssue = knownInfraIssue || isKnownCronInfraError(sourceMessage) || isMissingRpc;
            if (!isMissingRpc) {
              const errorRef = reportError(
                new Error(sourceMessage),
                "admin.cron_jobs.log_cleanup_policy_rpc"
              );
              warningRefs.push(errorRef);
              const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.log_cleanup_policy_public_rpc");
              warningRefs.push(fallbackRef);
            }
          }
        } else {
          const normalized = normalizeLogCleanupPolicy(logCleanupPolicyRes.value.data);
          setLogCleanupPolicy(normalized);
          setLogCleanupDraft(normalized.settings);
        }
      } else {
        const fallbackPolicy = {
          settings: DEFAULT_LOG_CLEANUP_SETTINGS,
          runtime: DEFAULT_LOG_CLEANUP_RUNTIME,
        };
        try {
          const publicPolicy = await callPublicRpc<LogCleanupCronPolicy>(LOG_CLEANUP_POLICY_RPC_NAME);
          const normalized = normalizeLogCleanupPolicy(publicPolicy);
          setLogCleanupPolicy(normalized);
          setLogCleanupDraft(normalized.settings);
        } catch (publicRpcError) {
          setLogCleanupPolicy(fallbackPolicy);
          setLogCleanupDraft(fallbackPolicy.settings);
          const reasonMessage =
            logCleanupPolicyRes.reason instanceof Error
              ? logCleanupPolicyRes.reason.message
              : String(logCleanupPolicyRes.reason || "");
          const isMissingRpc =
            isRpcMissingFunctionError(logCleanupPolicyRes.reason) || isRpcMissingFunctionError(publicRpcError);
          knownInfraIssue = knownInfraIssue || isKnownCronInfraError(reasonMessage) || isMissingRpc;
          if (!isMissingRpc) {
            const errorRef = reportError(
              logCleanupPolicyRes.reason,
              "admin.cron_jobs.log_cleanup_policy_rpc_rejected"
            );
            warningRefs.push(errorRef);
            const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.log_cleanup_policy_public_rpc");
            warningRefs.push(fallbackRef);
          }
        }
      }

      if (notificationCleanupPolicyRes.status === "fulfilled") {
        if (notificationCleanupPolicyRes.value.error) {
          const fallbackPolicy = {
            settings: DEFAULT_NOTIFICATION_CLEANUP_SETTINGS,
            runtime: DEFAULT_NOTIFICATION_CLEANUP_RUNTIME,
          };
          const sourceMessage =
            notificationCleanupPolicyRes.value.error instanceof Error
              ? notificationCleanupPolicyRes.value.error.message
              : String(notificationCleanupPolicyRes.value.error || "Gagal memuat kebijakan auto-clean notifikasi.");
          try {
            const publicPolicy = await callPublicRpc<NotificationCleanupCronPolicy>(NOTIFICATION_CLEANUP_POLICY_RPC_NAME);
            const normalized = normalizeNotificationCleanupPolicy(publicPolicy);
            setNotificationCleanupPolicy(normalized);
            setNotificationCleanupDraft(normalized.settings);
          } catch (publicRpcError) {
            setNotificationCleanupPolicy(fallbackPolicy);
            setNotificationCleanupDraft(fallbackPolicy.settings);
            const isMissingRpc =
              isRpcMissingFunctionError(notificationCleanupPolicyRes.value.error) ||
              isRpcMissingFunctionError(publicRpcError);
            knownInfraIssue = knownInfraIssue || isKnownCronInfraError(sourceMessage) || isMissingRpc;
            if (!isMissingRpc) {
              const errorRef = reportError(
                new Error(sourceMessage),
                "admin.cron_jobs.notification_cleanup_policy_rpc"
              );
              warningRefs.push(errorRef);
              const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.notification_cleanup_policy_public_rpc");
              warningRefs.push(fallbackRef);
            }
          }
        } else {
          const normalized = normalizeNotificationCleanupPolicy(notificationCleanupPolicyRes.value.data);
          setNotificationCleanupPolicy(normalized);
          setNotificationCleanupDraft(normalized.settings);
        }
      } else {
        const fallbackPolicy = {
          settings: DEFAULT_NOTIFICATION_CLEANUP_SETTINGS,
          runtime: DEFAULT_NOTIFICATION_CLEANUP_RUNTIME,
        };
        try {
          const publicPolicy = await callPublicRpc<NotificationCleanupCronPolicy>(NOTIFICATION_CLEANUP_POLICY_RPC_NAME);
          const normalized = normalizeNotificationCleanupPolicy(publicPolicy);
          setNotificationCleanupPolicy(normalized);
          setNotificationCleanupDraft(normalized.settings);
        } catch (publicRpcError) {
          setNotificationCleanupPolicy(fallbackPolicy);
          setNotificationCleanupDraft(fallbackPolicy.settings);
          const reasonMessage =
            notificationCleanupPolicyRes.reason instanceof Error
              ? notificationCleanupPolicyRes.reason.message
              : String(notificationCleanupPolicyRes.reason || "");
          const isMissingRpc =
            isRpcMissingFunctionError(notificationCleanupPolicyRes.reason) || isRpcMissingFunctionError(publicRpcError);
          knownInfraIssue = knownInfraIssue || isKnownCronInfraError(reasonMessage) || isMissingRpc;
          if (!isMissingRpc) {
            const errorRef = reportError(
              notificationCleanupPolicyRes.reason,
              "admin.cron_jobs.notification_cleanup_policy_rpc_rejected"
            );
            warningRefs.push(errorRef);
            const fallbackRef = reportError(publicRpcError, "admin.cron_jobs.notification_cleanup_policy_public_rpc");
            warningRefs.push(fallbackRef);
          }
        }
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
      setIsRetrying(false);
      const syncRes = await withExponentialBackoff(
        () =>
          withTimeout(
            rpcUntyped("ensure_system_cron_jobs"),
            CRON_JOBS_QUERY_TIMEOUT_MS,
            "admin.cron_jobs.sync timeout"
          ),
        {
          maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (syncRes.error) throw new Error(syncRes.error.message || "Gagal sinkron jadwal cron");

      const applyPolicyRes = await withExponentialBackoff(
        () =>
          withTimeout(
            rpcUntyped("configure_log_cleanup_cron_jobs", {
              p_audit_enabled: logCleanupDraft.audit_cleanup_enabled,
              p_audit_cron: normalizeCronExpression(logCleanupDraft.audit_cleanup_cron),
              p_error_enabled: logCleanupDraft.error_cleanup_enabled,
              p_error_cron: normalizeCronExpression(logCleanupDraft.error_cleanup_cron),
            }),
            CRON_JOBS_QUERY_TIMEOUT_MS,
            "admin.cron_jobs.sync_log_cleanup timeout"
          ),
        {
          maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      let hasWarning = false;
      if (applyPolicyRes.error) {
        hasWarning = true;
        const policyRef = reportError(
          new Error(applyPolicyRes.error.message || "Sinkron log cleanup gagal dijalankan."),
          "admin.cron_jobs.sync_log_cleanup"
        );
        toast.warning(appendErrorReference("Sinkron cron utama sukses, tetapi auto-clean log belum terpasang.", policyRef));
      } else {
        const normalized = normalizeLogCleanupPolicy(applyPolicyRes.data);
        setLogCleanupPolicy(normalized);
        setLogCleanupDraft(normalized.settings);
      }

      const applyNotificationPolicyRes = await withExponentialBackoff(
        () =>
          withTimeout(
            rpcUntyped("configure_notification_cleanup_cron", {
              p_enabled: notificationCleanupDraft.notification_cleanup_enabled,
              p_cron: normalizeCronExpression(notificationCleanupDraft.notification_cleanup_cron),
              p_retention_days: normalizeNotificationRetentionDays(notificationCleanupDraft.notification_retention_days, 30),
            }),
            CRON_JOBS_QUERY_TIMEOUT_MS,
            "admin.cron_jobs.sync_notification_cleanup timeout"
          ),
        {
          maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (applyNotificationPolicyRes.error) {
        hasWarning = true;
        const notificationPolicyRef = reportError(
          new Error(applyNotificationPolicyRes.error.message || "Sinkron cleanup notifikasi gagal dijalankan."),
          "admin.cron_jobs.sync_notification_cleanup"
        );
        toast.warning(
          appendErrorReference(
            "Sinkron cron utama sukses, tetapi auto-clean notifikasi belum terpasang.",
            notificationPolicyRef,
          ),
        );
      } else {
        const normalizedNotification = normalizeNotificationCleanupPolicy(applyNotificationPolicyRes.data);
        setNotificationCleanupPolicy(normalizedNotification);
        setNotificationCleanupDraft(normalizedNotification.settings);
      }

      if (!hasWarning) {
        toast.success("Sinkron jadwal cron dan auto-clean (log + notifikasi) berhasil dijalankan.");
      }
      await loadData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.cron_jobs.sync");
      toast.error(appendErrorReference("Sinkron cron gagal", errorRef));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetLogCleanupDraft = () => {
    setLogCleanupDraft(logCleanupPolicy.settings);
  };

  const handleResetNotificationCleanupDraft = () => {
    setNotificationCleanupDraft(notificationCleanupPolicy.settings);
  };

  const updateAuditWibTime = (field: "hour" | "minute", rawValue: string) => {
    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsedValue)) return;
    setLogCleanupDraft((prev) => {
      const current = getDailyScheduleDraft(prev.audit_cleanup_cron, DEFAULT_LOG_CLEANUP_SETTINGS.audit_cleanup_cron);
      const nextTime: DailyTimePoint = {
        hour: field === "hour" ? parsedValue : current.hour,
        minute: field === "minute" ? parsedValue : current.minute,
      };
      return { ...prev, audit_cleanup_cron: toUtcDailyCronFromWib(nextTime) };
    });
  };

  const updateErrorWibTime = (field: "hour" | "minute", rawValue: string) => {
    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsedValue)) return;
    setLogCleanupDraft((prev) => {
      const current = getDailyScheduleDraft(prev.error_cleanup_cron, DEFAULT_LOG_CLEANUP_SETTINGS.error_cleanup_cron);
      const nextTime: DailyTimePoint = {
        hour: field === "hour" ? parsedValue : current.hour,
        minute: field === "minute" ? parsedValue : current.minute,
      };
      return { ...prev, error_cleanup_cron: toUtcDailyCronFromWib(nextTime) };
    });
  };

  const updateNotificationWibTime = (field: "hour" | "minute", rawValue: string) => {
    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsedValue)) return;
    setNotificationCleanupDraft((prev) => {
      const current = getDailyScheduleDraft(
        prev.notification_cleanup_cron,
        DEFAULT_NOTIFICATION_CLEANUP_SETTINGS.notification_cleanup_cron,
      );
      const nextTime: DailyTimePoint = {
        hour: field === "hour" ? parsedValue : current.hour,
        minute: field === "minute" ? parsedValue : current.minute,
      };
      return { ...prev, notification_cleanup_cron: toUtcDailyCronFromWib(nextTime) };
    });
  };

  const handleSaveLogCleanupPolicy = async () => {
    const auditCron = normalizeCronExpression(logCleanupDraft.audit_cleanup_cron);
    const errorCron = normalizeCronExpression(logCleanupDraft.error_cleanup_cron);

    if (!isFivePartCronExpression(auditCron) || !isFivePartCronExpression(errorCron)) {
      toast.error("Format cron harus 5 kolom. Contoh: 10 20 * * *");
      return;
    }

    setIsSavingLogPolicy(true);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            rpcUntyped("configure_log_cleanup_cron_jobs", {
              p_audit_enabled: logCleanupDraft.audit_cleanup_enabled,
              p_audit_cron: auditCron,
              p_error_enabled: logCleanupDraft.error_cleanup_enabled,
              p_error_cron: errorCron,
            }),
            CRON_JOBS_QUERY_TIMEOUT_MS,
            "admin.cron_jobs.save_log_cleanup timeout"
          ),
        {
          maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw new Error(error.message || "Gagal menyimpan kebijakan auto-clean log.");

      const normalized = normalizeLogCleanupPolicy(data);
      setLogCleanupPolicy(normalized);
      setLogCleanupDraft(normalized.settings);
      toast.success("Pengaturan auto-clean log berhasil disimpan.");
      await loadData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.cron_jobs.save_log_cleanup");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan auto-clean log", errorRef));
    } finally {
      setIsSavingLogPolicy(false);
    }
  };

  const handleSaveNotificationCleanupPolicy = async () => {
    const cleanupCron = normalizeCronExpression(notificationCleanupDraft.notification_cleanup_cron);
    const retentionDays = normalizeNotificationRetentionDays(notificationCleanupDraft.notification_retention_days, 30);

    if (!isFivePartCronExpression(cleanupCron)) {
      toast.error("Format cron notifikasi harus 5 kolom. Contoh: 30 20 * * *");
      return;
    }

    setIsSavingNotificationPolicy(true);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            rpcUntyped("configure_notification_cleanup_cron", {
              p_enabled: notificationCleanupDraft.notification_cleanup_enabled,
              p_cron: cleanupCron,
              p_retention_days: retentionDays,
            }),
            CRON_JOBS_QUERY_TIMEOUT_MS,
            "admin.cron_jobs.save_notification_cleanup timeout"
          ),
        {
          maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw new Error(error.message || "Gagal menyimpan kebijakan auto-clean notifikasi.");

      const normalized = normalizeNotificationCleanupPolicy(data);
      setNotificationCleanupPolicy(normalized);
      setNotificationCleanupDraft(normalized.settings);
      toast.success("Pengaturan auto-clean notifikasi berhasil disimpan.");
      await loadData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.cron_jobs.save_notification_cleanup");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan auto-clean notifikasi", errorRef));
    } finally {
      setIsSavingNotificationPolicy(false);
    }
  };

  const handleRunNotificationCleanupNow = async () => {
    setIsRunningNotificationCleanup(true);
    try {
      const retentionDays = normalizeNotificationRetentionDays(notificationCleanupDraft.notification_retention_days, 30);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            rpcUntyped("apply_notifications_retention", {
              p_retention_days: retentionDays,
            }),
            CRON_JOBS_QUERY_TIMEOUT_MS,
            "admin.cron_jobs.run_notification_cleanup_now timeout"
          ),
        {
          maxRetries: CRON_JOBS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw new Error(error.message || "Gagal menjalankan cleanup notifikasi.");

      const result = (data && typeof data === "object" ? data : {}) as { deleted_count?: unknown };
      const deletedCount = toPositiveInteger(result.deleted_count, 0, 0);
      toast.success(`Pembersihan notifikasi selesai. ${deletedCount} data dihapus.`);
      await loadData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.cron_jobs.run_notification_cleanup_now");
      toast.error(appendErrorReference("Gagal menjalankan cleanup notifikasi", errorRef));
    } finally {
      setIsRunningNotificationCleanup(false);
    }
  };

  const pageContent = (
    <>
      <div className="space-y-6">
        {isRetrying && (
          <Card className="border-amber-300 bg-amber-50/80 dark:bg-amber-950/20">
            <CardContent className="pt-6 text-sm text-amber-900 dark:text-amber-200">
              Sedang mencoba ulang memuat data cron...
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-center justify-between gap-3 pt-6 text-sm text-destructive">
              <span>{loadError}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bg-white"
                onClick={() => void loadData()}
              >
                Coba Lagi
              </Button>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Pengaturan Auto Clean Log & Notifikasi
            </CardTitle>
            <CardDescription>
              Atur cron pembersihan otomatis log audit, log error client, dan riwayat notifikasi dari satu halaman.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Pembersihan Log Audit</p>
                    <p className="text-xs text-muted-foreground">Job: {logCleanupPolicy.runtime.audit_job_name}</p>
                  </div>
                  <Switch
                    checked={logCleanupDraft.audit_cleanup_enabled}
                    onCheckedChange={(checked) =>
                      setLogCleanupDraft((prev) => ({ ...prev, audit_cleanup_enabled: checked }))
                    }
                    disabled={isSavingLogPolicy || isSyncing}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Jam (WIB)</p>
                    <Select
                      value={auditScheduleDraft.hour.toString().padStart(2, "0")}
                      onValueChange={(value) => updateAuditWibTime("hour", value)}
                      disabled={isSavingLogPolicy || isSyncing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jam" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_HOUR_OPTIONS.map((hour) => (
                          <SelectItem key={`audit-hour-${hour}`} value={hour}>
                            {hour}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Menit (WIB)</p>
                    <Select
                      value={auditScheduleDraft.minute.toString().padStart(2, "0")}
                      onValueChange={(value) => updateAuditWibTime("minute", value)}
                      disabled={isSavingLogPolicy || isSyncing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih menit" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_MINUTE_OPTIONS.map((minute) => (
                          <SelectItem key={`audit-minute-${minute}`} value={minute}>
                            {minute}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!auditScheduleDraft.isDailyFixed && (
                  <p className="text-xs text-amber-700">
                    Cron saat ini tidak berbentuk harian standar. Mode angka memakai bawaan sampai Anda simpan ulang.
                  </p>
                )}
                <p className="text-xs font-medium text-muted-foreground">Cron Teknis (UTC, mode lanjutan)</p>
                <Input
                  value={logCleanupDraft.audit_cleanup_cron}
                  onChange={(event) =>
                    setLogCleanupDraft((prev) => ({ ...prev, audit_cleanup_cron: event.target.value }))
                  }
                  placeholder="10 20 * * *"
                  disabled={isSavingLogPolicy || isSyncing}
                />
                <p className="text-xs text-muted-foreground">
                  Jadwal aktif saat ini: {logCleanupPolicy.runtime.audit_current_schedule || "-"}
                </p>
              </div>
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Pembersihan Log Error</p>
                    <p className="text-xs text-muted-foreground">Job: {logCleanupPolicy.runtime.error_job_name}</p>
                  </div>
                  <Switch
                    checked={logCleanupDraft.error_cleanup_enabled}
                    onCheckedChange={(checked) =>
                      setLogCleanupDraft((prev) => ({ ...prev, error_cleanup_enabled: checked }))
                    }
                    disabled={isSavingLogPolicy || isSyncing}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Jam (WIB)</p>
                    <Select
                      value={errorScheduleDraft.hour.toString().padStart(2, "0")}
                      onValueChange={(value) => updateErrorWibTime("hour", value)}
                      disabled={isSavingLogPolicy || isSyncing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jam" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_HOUR_OPTIONS.map((hour) => (
                          <SelectItem key={`error-hour-${hour}`} value={hour}>
                            {hour}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Menit (WIB)</p>
                    <Select
                      value={errorScheduleDraft.minute.toString().padStart(2, "0")}
                      onValueChange={(value) => updateErrorWibTime("minute", value)}
                      disabled={isSavingLogPolicy || isSyncing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih menit" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_MINUTE_OPTIONS.map((minute) => (
                          <SelectItem key={`error-minute-${minute}`} value={minute}>
                            {minute}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!errorScheduleDraft.isDailyFixed && (
                  <p className="text-xs text-amber-700">
                    Cron saat ini tidak berbentuk harian standar. Mode angka memakai bawaan sampai Anda simpan ulang.
                  </p>
                )}
                <p className="text-xs font-medium text-muted-foreground">Cron Teknis (UTC, mode lanjutan)</p>
                <Input
                  value={logCleanupDraft.error_cleanup_cron}
                  onChange={(event) =>
                    setLogCleanupDraft((prev) => ({ ...prev, error_cleanup_cron: event.target.value }))
                  }
                  placeholder="0 18 * * *"
                  disabled={isSavingLogPolicy || isSyncing}
                />
                <p className="text-xs text-muted-foreground">
                  Jadwal aktif saat ini: {logCleanupPolicy.runtime.error_current_schedule || "-"}
                </p>
              </div>
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Riwayat Pembersihan Notifikasi</p>
                    <p className="text-xs text-muted-foreground">
                      Job: {notificationCleanupPolicy.runtime.notification_job_name}
                    </p>
                  </div>
                  <Switch
                    checked={notificationCleanupDraft.notification_cleanup_enabled}
                    onCheckedChange={(checked) =>
                      setNotificationCleanupDraft((prev) => ({ ...prev, notification_cleanup_enabled: checked }))
                    }
                    disabled={isSavingNotificationPolicy || isSyncing || isRunningNotificationCleanup}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Retensi (hari)</p>
                  <Input
                    type="number"
                    min={NOTIFICATION_RETENTION_MIN_DAYS}
                    max={NOTIFICATION_RETENTION_MAX_DAYS}
                    value={notificationCleanupDraft.notification_retention_days}
                    onChange={(event) =>
                      setNotificationCleanupDraft((prev) => ({
                        ...prev,
                        notification_retention_days: normalizeNotificationRetentionDays(
                          event.target.value,
                          prev.notification_retention_days,
                        ),
                      }))
                    }
                    disabled={isSavingNotificationPolicy || isSyncing || isRunningNotificationCleanup}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Jam (WIB)</p>
                    <Select
                      value={notificationScheduleDraft.hour.toString().padStart(2, "0")}
                      onValueChange={(value) => updateNotificationWibTime("hour", value)}
                      disabled={isSavingNotificationPolicy || isSyncing || isRunningNotificationCleanup}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jam" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_HOUR_OPTIONS.map((hour) => (
                          <SelectItem key={`notification-hour-${hour}`} value={hour}>
                            {hour}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Menit (WIB)</p>
                    <Select
                      value={notificationScheduleDraft.minute.toString().padStart(2, "0")}
                      onValueChange={(value) => updateNotificationWibTime("minute", value)}
                      disabled={isSavingNotificationPolicy || isSyncing || isRunningNotificationCleanup}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih menit" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_MINUTE_OPTIONS.map((minute) => (
                          <SelectItem key={`notification-minute-${minute}`} value={minute}>
                            {minute}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Rentang retensi aman: {NOTIFICATION_RETENTION_MIN_DAYS}-{NOTIFICATION_RETENTION_MAX_DAYS} hari.
                </p>
                {!notificationScheduleDraft.isDailyFixed && (
                  <p className="text-xs text-amber-700">
                    Cron saat ini tidak berbentuk harian standar. Mode angka memakai bawaan sampai Anda simpan ulang.
                  </p>
                )}
                <p className="text-xs font-medium text-muted-foreground">Cron Teknis (UTC, mode lanjutan)</p>
                <Input
                  value={notificationCleanupDraft.notification_cleanup_cron}
                  onChange={(event) =>
                    setNotificationCleanupDraft((prev) => ({
                      ...prev,
                      notification_cleanup_cron: event.target.value,
                    }))
                  }
                  placeholder="30 20 * * *"
                  disabled={isSavingNotificationPolicy || isSyncing || isRunningNotificationCleanup}
                />
                <p className="text-xs text-muted-foreground">
                  Jadwal aktif saat ini: {notificationCleanupPolicy.runtime.notification_current_schedule || "-"}
                </p>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-dashed bg-slate-50/70 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">Cara pakai cepat (disarankan)</p>
              <p>Pilih angka `jam` + `menit` pada mode WIB, lalu simpan. Sistem otomatis mengubahnya ke cron UTC.</p>
              <p>Mode lanjutan tetap tersedia pada kolom `Cron Teknis (UTC)` jika perlu pola khusus.</p>
              <p>Atur `Retensi (hari)` khusus notifikasi untuk mencegah tabel notifikasi menumpuk.</p>
              <p>Format cron wajib 5 kolom: `menit jam hari-bulan bulan hari-minggu` (contoh: `10 20 * * *`).</p>
            </div>
            {!logCleanupPolicy.runtime.cron_available && !notificationCleanupPolicy.runtime.cron_available && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
                pg_cron belum tersedia pada runtime saat ini. Pengaturan tetap disimpan, namun jadwal belum aktif.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleResetLogCleanupDraft}
                disabled={isSavingLogPolicy || isSyncing}
              >
                Reset Draf Log
              </Button>
              <Button type="button" onClick={handleSaveLogCleanupPolicy} disabled={isSavingLogPolicy || isSyncing}>
                {isSavingLogPolicy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                Simpan Pembersihan Otomatis Log
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResetNotificationCleanupDraft}
                disabled={isSavingNotificationPolicy || isSyncing || isRunningNotificationCleanup}
              >
                Reset Draf Notifikasi
              </Button>
              <Button
                type="button"
                onClick={handleSaveNotificationCleanupPolicy}
                disabled={isSavingNotificationPolicy || isSyncing || isRunningNotificationCleanup}
              >
                {isSavingNotificationPolicy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Settings2 className="mr-2 h-4 w-4" />
                )}
                Simpan Pembersihan Otomatis Notifikasi
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleRunNotificationCleanupNow}
                disabled={isRunningNotificationCleanup || isSavingNotificationPolicy || isSyncing}
              >
                {isRunningNotificationCleanup ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Bersihkan Notifikasi Sekarang
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Tugas</CardDescription>
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
                <Button
                  variant="outline"
                  onClick={() => void loadData()}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Muat Ulang
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
          <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <TabsTrigger value="runs" className="whitespace-nowrap">
              Riwayat Run pg_cron
            </TabsTrigger>
            <TabsTrigger value="app" className="whitespace-nowrap">
              Log Aplikasi
            </TabsTrigger>
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
    </>
  );
  if (embedded) return pageContent;
  return (
    <SuperAdminLayout title="Informasi Tugas Cron" subtitle="Pusat informasi seluruh tugas cron sistem">
      {pageContent}
    </SuperAdminLayout>
  );
}
