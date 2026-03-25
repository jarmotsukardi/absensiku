import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Search,
  Download,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Archive,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import {
  appendErrorReference,
  clearStoredErrorLogs,
  getRemoteErrorLoggingMode,
  getStoredErrorLogs,
  isNonCriticalClientError,
  reportError,
  setRemoteErrorLoggingPolicy,
  setRemoteErrorLoggingModeOverride,
  type AppErrorLogEntry,
} from "@/lib/errorLogger";
import {
  createDefaultRemoteErrorLoggingPolicy,
  normalizeRemoteErrorLoggingPolicy,
  resolveEffectiveRemoteErrorLoggingMode,
  serializeRemoteErrorLoggingPolicy,
  type RemoteErrorLoggingMode,
  type RemoteErrorLoggingPolicy,
} from "@/lib/errorLoggingPolicy";
import {
  CENTRALIZED_PURGE_CONFIRMATION_PHRASE,
  CENTRALIZED_PURGE_SCOPE_LABEL,
  normalizeCentralizedPurgeScope,
  resolveCentralizedPurgeErrorMessage,
  type CentralizedPurgeScope,
} from "@/lib/errorLogsAdminPolicy";
import {
  getTopupRequestIdFromErrorEntry,
  resolveTabForErrorEntry,
  type ErrorSeverityTab,
} from "@/lib/errorLogRouting";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { executeRpcWithAvailability } from "@/lib/rpcAvailability";

const escapeCsvCell = (value: unknown): string => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
};

const toCsv = (rows: AppErrorLogEntry[]): string => {
  const header = ["ref", "timestamp", "context", "message", "route", "metadata"];
  const lines = rows.map((row) =>
    [
      row.id,
      row.timestamp,
      row.context,
      row.message,
      row.route || "",
      row.metadata ? JSON.stringify(row.metadata) : "",
    ]
      .map(escapeCsvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
};

const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const toErrorText = (error: unknown): string => {
  if (error instanceof Error) return error.message || error.name || "unknown_error";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? "unknown_error");
  }
};

type SeverityTab = ErrorSeverityTab;
type TimeWindow = "all" | "24h" | "7d" | "30d";
type OwnershipFilter = "all" | "mine";
type TenantScopeFilter = "all_tenants" | "my_tenant" | "no_tenant";
const NON_CRITICAL_MAX_VISIBLE = 100;
const LOCAL_ARCHIVED_REFS_KEY = "absensiku:error_logs_archived_refs";
const LOCAL_NON_CRITICAL_OVERRIDES_KEY = "absensiku:error_logs_non_critical_overrides";
const LOCAL_RESOLVED_REFS_KEY = "absensiku:error_logs_resolved_refs";
const FILTER_STORAGE_KEY_PREFIX = "absensiku:error_logs_filters";
const ERROR_ALERT_SETTINGS_KEY = "error_alert_settings";
const ERROR_LOGGING_POLICY_KEY = "client_error_logging_policy";
const ERROR_RETENTION_POLICY_KEY = "client_error_logs_retention_policy";
const CRITICAL_ALERT_RELAY_FUNCTION = "critical-error-alert-relay";
const CENTRALIZED_PURGE_SLIDE_MAX = 100;
const CENTRALIZED_PURGE_SLIDE_ARM_THRESHOLD = 96;
const PREVIEW_CLIENT_ERROR_LOGS_PURGE_RPC_NAME = "preview_client_error_logs_purge";
const APPLY_CLIENT_ERROR_LOGS_RETENTION_RPC_NAME = "apply_client_error_logs_retention";
const PURGE_CLIENT_ERROR_LOGS_RPC_NAME = "purge_client_error_logs";

interface ErrorLogRow extends AppErrorLogEntry {
  rowId?: string;
  userId?: string | null;
  tenantId?: string | null;
  source?: string | null;
  userAgent?: string | null;
  isArchived?: boolean;
  isNonCritical?: boolean;
  isResolved?: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveNote?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
}

type BulkConfirmDialogState = {
  action: "archive" | "unarchive" | "resolve" | "reopen";
  count: number;
} | null;

interface ErrorAlertSettings {
  enableRealtimeAlerts: boolean;
  webhookUrl: string;
  slackWebhookUrl: string;
  whatsappWebhookUrl: string;
  emailWebhookUrl: string;
}

interface ErrorRetentionPolicySettings {
  nonCriticalArchiveDays: number;
  nonCriticalDeleteDays: number;
  resolvedCriticalArchiveDays: number;
  criticalDeleteDays: number;
}

interface TenantOption {
  id: string;
  name: string;
  code: string | null;
}

interface PersistedFilterState {
  search?: string;
  activeTab?: SeverityTab;
  ownershipFilter?: OwnershipFilter;
  tenantScopeFilter?: TenantScopeFilter;
  selectedContext?: string;
  selectedWindow?: TimeWindow;
  itemsPerPage?: number;
}

interface ErrorLogCostGuardrailSnapshot {
  last24hCount: number;
  last7dCount: number;
  projected30dCount: number;
  warningLevel: "normal" | "warning" | "high";
  refreshedAt: string | null;
}

const DEFAULT_ALERT_SETTINGS: ErrorAlertSettings = {
  enableRealtimeAlerts: false,
  webhookUrl: "",
  slackWebhookUrl: "",
  whatsappWebhookUrl: "",
  emailWebhookUrl: "",
};

const DEFAULT_ERROR_RETENTION_POLICY_SETTINGS: ErrorRetentionPolicySettings = {
  nonCriticalArchiveDays: 3,
  nonCriticalDeleteDays: 30,
  resolvedCriticalArchiveDays: 7,
  criticalDeleteDays: 180,
};

const toPositiveInteger = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(1, parsed);
  }
  return fallback;
};

const normalizeAlertSettings = (value: unknown): ErrorAlertSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_ALERT_SETTINGS;
  const raw = value as Record<string, unknown>;
  return {
    enableRealtimeAlerts: Boolean(raw.enable_realtime_alerts),
    webhookUrl: typeof raw.webhook_url === "string" ? raw.webhook_url : "",
    slackWebhookUrl: typeof raw.slack_webhook_url === "string" ? raw.slack_webhook_url : "",
    whatsappWebhookUrl: typeof raw.whatsapp_webhook_url === "string" ? raw.whatsapp_webhook_url : "",
    emailWebhookUrl: typeof raw.email_webhook_url === "string" ? raw.email_webhook_url : "",
  };
};

const serializeAlertSettings = (value: ErrorAlertSettings) => ({
  enable_realtime_alerts: value.enableRealtimeAlerts,
  webhook_url: value.webhookUrl.trim(),
  slack_webhook_url: value.slackWebhookUrl.trim(),
  whatsapp_webhook_url: value.whatsappWebhookUrl.trim(),
  email_webhook_url: value.emailWebhookUrl.trim(),
});

const normalizeErrorRetentionPolicySettings = (value: unknown): ErrorRetentionPolicySettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_ERROR_RETENTION_POLICY_SETTINGS;
  }
  const raw = value as Record<string, unknown>;
  return {
    nonCriticalArchiveDays: toPositiveInteger(
      raw.non_critical_archive_days,
      DEFAULT_ERROR_RETENTION_POLICY_SETTINGS.nonCriticalArchiveDays,
    ),
    nonCriticalDeleteDays: toPositiveInteger(
      raw.non_critical_delete_days,
      DEFAULT_ERROR_RETENTION_POLICY_SETTINGS.nonCriticalDeleteDays,
    ),
    resolvedCriticalArchiveDays: toPositiveInteger(
      raw.resolved_critical_archive_days,
      DEFAULT_ERROR_RETENTION_POLICY_SETTINGS.resolvedCriticalArchiveDays,
    ),
    criticalDeleteDays: toPositiveInteger(
      raw.critical_delete_days,
      DEFAULT_ERROR_RETENTION_POLICY_SETTINGS.criticalDeleteDays,
    ),
  };
};

const serializeErrorRetentionPolicySettings = (value: ErrorRetentionPolicySettings) => ({
  non_critical_archive_days: Math.max(1, value.nonCriticalArchiveDays),
  non_critical_delete_days: Math.max(1, value.nonCriticalDeleteDays),
  resolved_critical_archive_days: Math.max(1, value.resolvedCriticalArchiveDays),
  critical_delete_days: Math.max(1, value.criticalDeleteDays),
});

const DEFAULT_COST_GUARDRAIL_SNAPSHOT: ErrorLogCostGuardrailSnapshot = {
  last24hCount: 0,
  last7dCount: 0,
  projected30dCount: 0,
  warningLevel: "normal",
  refreshedAt: null,
};

const isValidItemsPerPage = (value: unknown): value is number =>
  value === 25 || value === 50 || value === 100;

const readArchivedLocalRefs = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LOCAL_ARCHIVED_REFS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
};

const writeArchivedLocalRefs = (refs: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_ARCHIVED_REFS_KEY, JSON.stringify(Array.from(refs)));
  } catch {
    // Ignore storage write failures.
  }
};

const readResolvedLocalRefs = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LOCAL_RESOLVED_REFS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
};

const writeResolvedLocalRefs = (refs: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_RESOLVED_REFS_KEY, JSON.stringify(Array.from(refs)));
  } catch {
    // Ignore storage write failures.
  }
};

const readLocalNonCriticalOverrides = (): Record<string, boolean> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_NON_CRITICAL_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
};

const writeLocalNonCriticalOverrides = (overrides: Record<string, boolean>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_NON_CRITICAL_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage write failures.
  }
};

const isNonCriticalEntry = (entry: ErrorLogRow): boolean => {
  if (typeof entry.isNonCritical === "boolean") return entry.isNonCritical;
  return isNonCriticalClientError(entry.context, entry.message);
};

const isResolvedEntry = (entry: ErrorLogRow): boolean => Boolean(entry.isResolved);

const resolveFilterStorageKey = (userId?: string | null) =>
  `${FILTER_STORAGE_KEY_PREFIX}:${userId || "anonymous"}`;

const readPersistedFilters = (key: string): PersistedFilterState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as PersistedFilterState;
    return {
      search: typeof value.search === "string" ? value.search : undefined,
      activeTab:
        value.activeTab === "critical" ||
        value.activeTab === "non_critical" ||
        value.activeTab === "resolved_critical" ||
        value.activeTab === "archived_critical" ||
        value.activeTab === "archived_non_critical"
          ? value.activeTab
          : undefined,
      selectedContext: typeof value.selectedContext === "string" ? value.selectedContext : undefined,
      ownershipFilter: value.ownershipFilter === "mine" || value.ownershipFilter === "all" ? value.ownershipFilter : undefined,
      tenantScopeFilter:
        value.tenantScopeFilter === "all_tenants" ||
        value.tenantScopeFilter === "my_tenant" ||
        value.tenantScopeFilter === "no_tenant"
          ? value.tenantScopeFilter
          : undefined,
      selectedWindow:
        value.selectedWindow === "all" ||
        value.selectedWindow === "24h" ||
        value.selectedWindow === "7d" ||
        value.selectedWindow === "30d"
          ? value.selectedWindow
          : undefined,
      itemsPerPage: isValidItemsPerPage(value.itemsPerPage) ? value.itemsPerPage : undefined,
    };
  } catch {
    return null;
  }
};

const writePersistedFilters = (key: string, value: PersistedFilterState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures.
  }
};

const mapRemoteRowToEntry = (row: Record<string, unknown>): ErrorLogRow => ({
  rowId: row.id ? String(row.id) : undefined,
  id: String(row.error_ref || row.id || ""),
  timestamp: String(row.occurred_at || row.created_at || new Date().toISOString()),
  context: String(row.context || "-"),
  message: String(row.message || "-"),
  name: row.name ? String(row.name) : undefined,
  stack: row.stack ? String(row.stack) : undefined,
  route: row.route ? String(row.route) : undefined,
  metadata: (row.metadata as Record<string, unknown> | undefined) ?? undefined,
  userId: row.user_id ? String(row.user_id) : null,
  tenantId: row.tenant_id ? String(row.tenant_id) : null,
  source: row.source ? String(row.source) : null,
  userAgent: row.user_agent ? String(row.user_agent) : null,
  isArchived: Boolean(row.is_archived),
  isNonCritical: Boolean(row.is_non_critical),
  isResolved: Boolean(row.is_resolved),
  archivedAt: row.archived_at ? String(row.archived_at) : null,
  archivedBy: row.archived_by ? String(row.archived_by) : null,
  archiveNote: row.archive_note ? String(row.archive_note) : null,
  resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
  resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
});

const getTopupRequestIdFromEntry = (entry: ErrorLogRow): string | null => {
  return getTopupRequestIdFromErrorEntry(entry);
};

const resolveTabForEntry = (entry: ErrorLogRow): SeverityTab => {
  return resolveTabForErrorEntry(entry, isNonCriticalEntry(entry));
};

const toWebhookTargets = (settings: ErrorAlertSettings): Array<{ channel: string; url: string }> =>
  [
    { channel: "webhook", url: settings.webhookUrl.trim() },
    { channel: "slack", url: settings.slackWebhookUrl.trim() },
    { channel: "whatsapp", url: settings.whatsappWebhookUrl.trim() },
    { channel: "email", url: settings.emailWebhookUrl.trim() },
  ].filter((item) => item.url.length > 0);

export default function ErrorLogs() {
  const ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_ERROR_LOGS_QUERY_RETRY_MAX = 1;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const realtimeNotifiedRefs = useRef<Set<string>>(new Set());
  const hasHydratedFiltersRef = useRef(false);
  const hasHandledFocusRef = useRef(false);
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<ErrorLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [activeTab, setActiveTab] = useState<SeverityTab>("critical");
  const [archivingRefId, setArchivingRefId] = useState<string | null>(null);
  const [unarchivingRefId, setUnarchivingRefId] = useState<string | null>(null);
  const [classifyingRefId, setClassifyingRefId] = useState<string | null>(null);
  const [resolvingRefId, setResolvingRefId] = useState<string | null>(null);
  const [reopeningRefId, setReopeningRefId] = useState<string | null>(null);
  const [isBulkClassifying, setIsBulkClassifying] = useState(false);
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);
  const [isBulkUnarchiving, setIsBulkUnarchiving] = useState(false);
  const [isBulkResolving, setIsBulkResolving] = useState(false);
  const [isBulkReopening, setIsBulkReopening] = useState(false);
  const [isRunningRetention, setIsRunningRetention] = useState(false);
  const [isRunningCentralizedPurge, setIsRunningCentralizedPurge] = useState(false);
  const [isLoadingCentralizedPurgePreview, setIsLoadingCentralizedPurgePreview] = useState(false);
  const [isSavingAlertSettings, setIsSavingAlertSettings] = useState(false);
  const [isSavingRemoteLogMode, setIsSavingRemoteLogMode] = useState(false);
  const [isSavingErrorRetentionSettings, setIsSavingErrorRetentionSettings] = useState(false);
  const [isLoadingCostGuardrail, setIsLoadingCostGuardrail] = useState(false);
  const [dataSource, setDataSource] = useState<"centralized" | "local" | "hybrid">("centralized");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [tenantScopeFilter, setTenantScopeFilter] = useState<TenantScopeFilter>("all_tenants");
  const [selectedContext, setSelectedContext] = useState("all");
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>("24h");
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRefreshCritical, setAutoRefreshCritical] = useState(false);
  const [bulkConfirmDialog, setBulkConfirmDialog] = useState<BulkConfirmDialogState>(null);
  const [isCentralizedPurgeDialogOpen, setIsCentralizedPurgeDialogOpen] = useState(false);
  const [centralizedPurgeScope, setCentralizedPurgeScope] = useState<CentralizedPurgeScope>("archived_or_resolved");
  const [centralizedPurgeSlideValue, setCentralizedPurgeSlideValue] = useState([0]);
  const [centralizedPurgePreviewCount, setCentralizedPurgePreviewCount] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserTenantId, setCurrentUserTenantId] = useState<string | null>(null);
  const [isCurrentUserSuperAdmin, setIsCurrentUserSuperAdmin] = useState(false);
  const [currentUserLabel, setCurrentUserLabel] = useState<string | null>(null);
  const [selectedDetailEntry, setSelectedDetailEntry] = useState<ErrorLogRow | null>(null);
  const [alertSettings, setAlertSettings] = useState<ErrorAlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [errorRetentionSettings, setErrorRetentionSettings] = useState<ErrorRetentionPolicySettings>(
    DEFAULT_ERROR_RETENTION_POLICY_SETTINGS,
  );
  const [remoteLogPolicy, setRemoteLogPolicy] = useState<RemoteErrorLoggingPolicy>(() =>
    createDefaultRemoteErrorLoggingPolicy(getRemoteErrorLoggingMode()),
  );
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [selectedTenantOverrideId, setSelectedTenantOverrideId] = useState("none");
  const [selectedTenantOverrideMode, setSelectedTenantOverrideMode] = useState<RemoteErrorLoggingMode>("full");
  const [costGuardrailSnapshot, setCostGuardrailSnapshot] =
    useState<ErrorLogCostGuardrailSnapshot>(DEFAULT_COST_GUARDRAIL_SNAPSHOT);
  const focusErrorRef = searchParams.get("errorRef");

  const filterStorageKey = useMemo(() => resolveFilterStorageKey(currentUserId), [currentUserId]);
  const effectiveRemoteLogMode = useMemo(
    () => resolveEffectiveRemoteErrorLoggingMode(remoteLogPolicy),
    [remoteLogPolicy],
  );
  const tenantOverrideRows = useMemo(() => {
    return Object.entries(remoteLogPolicy.tenantOverrides || {})
      .map(([tenantId, mode]) => {
        const tenant = tenantOptions.find((item) => item.id === tenantId);
        return {
          tenantId,
          mode,
          name: tenant?.name ?? tenantId,
          code: tenant?.code ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [remoteLogPolicy.tenantOverrides, tenantOptions]);

  const loadCurrentUser = useCallback(async () => {
    try {
      setIsRetrying(false);
      const {
        data: { user },
      } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.load_current_user.get_user timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      const displayName =
        typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : typeof user?.user_metadata?.name === "string"
            ? user.user_metadata.name
            : user?.email || user?.id || null;
      setCurrentUserId(user?.id || null);
      setCurrentUserLabel(displayName);
      if (user?.id) {
        const { data: roleRows } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("user_roles")
                .select("tenant_id, role")
                .eq("user_id", user.id),
              ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
              "admin.error_logs.load_current_user.role_rows timeout",
            ),
          {
            maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        const typedRows = (roleRows || []) as Array<{ tenant_id?: string | null; role?: string | null }>;
        setCurrentUserTenantId(
          typedRows.find((row) => typeof row.tenant_id === "string" && row.tenant_id.length > 0)?.tenant_id || null,
        );
        setIsCurrentUserSuperAdmin(typedRows.some((row) => row.role === "super_admin"));
      } else {
        setCurrentUserTenantId(null);
        setIsCurrentUserSuperAdmin(false);
      }
    } catch {
      setCurrentUserId(null);
      setCurrentUserTenantId(null);
      setIsCurrentUserSuperAdmin(false);
      setCurrentUserLabel(null);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const loadAlertSettings = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", ERROR_ALERT_SETTINGS_KEY)
              .maybeSingle(),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.alert_settings.fetch timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      setAlertSettings(normalizeAlertSettings(data?.value));
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.alert_settings.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan alert realtime", errorRef));
      setAlertSettings(DEFAULT_ALERT_SETTINGS);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const loadErrorRetentionSettings = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", ERROR_RETENTION_POLICY_KEY)
              .maybeSingle(),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.retention_settings.fetch timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      setErrorRetentionSettings(normalizeErrorRetentionPolicySettings(data?.value));
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.retention_settings.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan retensi log error", errorRef));
      setErrorRetentionSettings(DEFAULT_ERROR_RETENTION_POLICY_SETTINGS);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const loadRemoteLoggingPolicy = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", ERROR_LOGGING_POLICY_KEY)
              .maybeSingle(),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.remote_log_mode.fetch timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      const nextPolicy = normalizeRemoteErrorLoggingPolicy(data?.value, getRemoteErrorLoggingMode());
      setRemoteLogPolicy(nextPolicy);
      setRemoteErrorLoggingModeOverride(null);
      setRemoteErrorLoggingPolicy(nextPolicy);
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.remote_log_mode.fetch");
      toast.error(appendErrorReference("Gagal memuat mode log error", errorRef));
      const fallback = createDefaultRemoteErrorLoggingPolicy("full");
      setRemoteLogPolicy(fallback);
      setRemoteErrorLoggingModeOverride(null);
      setRemoteErrorLoggingPolicy(fallback);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const loadTenantOptions = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .select("id, name, code")
              .order("name", { ascending: true }),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.tenants.fetch timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      setTenantOptions((data || []) as TenantOption[]);
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.tenants.fetch");
      toast.error(appendErrorReference("Gagal memuat daftar tenant", errorRef));
      setTenantOptions([]);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const applyTenantOverride = useCallback(() => {
    if (selectedTenantOverrideId === "none") return;
    setRemoteLogPolicy((prev) => ({
      ...prev,
      tenantOverrides: {
        ...prev.tenantOverrides,
        [selectedTenantOverrideId]: selectedTenantOverrideMode,
      },
    }));
  }, [selectedTenantOverrideId, selectedTenantOverrideMode]);

  const removeTenantOverride = useCallback((tenantId: string) => {
    setRemoteLogPolicy((prev) => {
      if (!prev.tenantOverrides[tenantId]) return prev;
      const nextOverrides = { ...prev.tenantOverrides };
      delete nextOverrides[tenantId];
      return { ...prev, tenantOverrides: nextOverrides };
    });
  }, []);

  const loadCentralizedLogs = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("client_error_logs" as never)
              .select("*")
              .order("occurred_at", { ascending: false })
              .limit(5000),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.fetch timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      const mapped: ErrorLogRow[] = ((data || []) as Record<string, unknown>[]).map(mapRemoteRowToEntry);

      const archivedLocalRefs = readArchivedLocalRefs();
      const localNonCriticalOverrides = readLocalNonCriticalOverrides();
      const resolvedLocalRefs = readResolvedLocalRefs();
      const localEntries = getStoredErrorLogs()
        .reverse()
        .map((entry) => ({
          ...entry,
          isArchived: archivedLocalRefs.has(entry.id),
          isResolved: resolvedLocalRefs.has(entry.id),
          isNonCritical:
            localNonCriticalOverrides[entry.id] ?? isNonCriticalClientError(entry.context, entry.message),
        }));
      const mergedMap = new Map<string, ErrorLogRow>();
      for (const entry of [...mapped, ...localEntries]) {
        if (!mergedMap.has(entry.id)) {
          mergedMap.set(entry.id, entry);
        }
      }
      const mergedEntries = Array.from(mergedMap.values()).sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
      );

      setEntries(mergedEntries);
      setDataSource(localEntries.length > 0 ? "hybrid" : "centralized");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.fetch");
      if (!options?.silent) {
        toast.error(appendErrorReference("Gagal memuat log error terpusat, menampilkan log lokal", errorRef));
      }
      const archivedLocalRefs = readArchivedLocalRefs();
      const localNonCriticalOverrides = readLocalNonCriticalOverrides();
      const resolvedLocalRefs = readResolvedLocalRefs();
      setEntries(
        getStoredErrorLogs()
          .reverse()
          .map((entry) => ({
            ...entry,
            isArchived: archivedLocalRefs.has(entry.id),
            isResolved: resolvedLocalRefs.has(entry.id),
            isNonCritical:
              localNonCriticalOverrides[entry.id] ?? isNonCriticalClientError(entry.context, entry.message),
          })),
      );
      setDataSource("local");
    } finally {
      setIsRetrying(false);
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, []);

  const loadCostGuardrailSnapshot = useCallback(async () => {
    setIsLoadingCostGuardrail(true);
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [dailyResult, weeklyResult] = await Promise.all([
        supabase
          .from("client_error_logs" as never)
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", since24h),
        supabase
          .from("client_error_logs" as never)
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", since7d),
      ]);

      if (dailyResult.error) throw dailyResult.error;
      if (weeklyResult.error) throw weeklyResult.error;

      const last24hCount = Number(dailyResult.count || 0);
      const last7dCount = Number(weeklyResult.count || 0);
      const projected30dCount = Math.max(0, Math.round(last24hCount * 30));
      const warningLevel =
        last24hCount >= 10000 || projected30dCount >= 300000
          ? "high"
          : last24hCount >= 3000 || projected30dCount >= 90000
            ? "warning"
            : "normal";

      setCostGuardrailSnapshot({
        last24hCount,
        last7dCount,
        projected30dCount,
        warningLevel,
        refreshedAt: new Date().toISOString(),
      });
    } catch (error) {
      reportError(error, "admin.error_logs.cost_guardrail.fetch");
      setCostGuardrailSnapshot(DEFAULT_COST_GUARDRAIL_SNAPSHOT);
    } finally {
      setIsLoadingCostGuardrail(false);
    }
  }, []);

  const loadCentralizedPurgePreview = useCallback(
    async (scope: CentralizedPurgeScope) => {
      if (!isCurrentUserSuperAdmin) {
        setCentralizedPurgePreviewCount(null);
        return;
      }

      setIsLoadingCentralizedPurgePreview(true);
      try {
        const { data, error } = (await withExponentialBackoff(
          () =>
            withTimeout(
              executeRpcWithAvailability<Record<string, unknown>>(
                PREVIEW_CLIENT_ERROR_LOGS_PURGE_RPC_NAME,
                () =>
                  supabase.rpc(
                    PREVIEW_CLIENT_ERROR_LOGS_PURGE_RPC_NAME as never,
                    {
                      p_scope: scope,
                    } as never,
                  ),
              ),
              ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
              "admin.error_logs.purge_centralized.preview timeout",
            ),
          {
            maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        )) as {
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        };
        if (error) throw error;
        const candidateCount = Number(data?.candidate_count || 0);
        setCentralizedPurgePreviewCount(
          Number.isFinite(candidateCount) ? Math.max(0, Math.floor(candidateCount)) : 0,
        );
      } catch (error) {
        setCentralizedPurgePreviewCount(null);
        reportError(error, "admin.error_logs.purge_centralized.preview", {
          purge_scope: scope,
        });
      } finally {
        setIsLoadingCentralizedPurgePreview(false);
        setIsRetrying(false);
      }
    },
    [isCurrentUserSuperAdmin],
  );

  useEffect(() => {
    void loadCurrentUser();
    void loadAlertSettings();
    void loadErrorRetentionSettings();
    void loadRemoteLoggingPolicy();
    void loadTenantOptions();
  }, [loadAlertSettings, loadCurrentUser, loadErrorRetentionSettings, loadRemoteLoggingPolicy, loadTenantOptions]);

  useEffect(() => {
    if (selectedTenantOverrideId === "none") {
      setSelectedTenantOverrideMode(remoteLogPolicy.mode);
      return;
    }
    const overrideMode = remoteLogPolicy.tenantOverrides[selectedTenantOverrideId];
    setSelectedTenantOverrideMode(overrideMode || "full");
  }, [remoteLogPolicy.mode, remoteLogPolicy.tenantOverrides, selectedTenantOverrideId]);

  useEffect(() => {
    void loadCentralizedLogs();
  }, [loadCentralizedLogs]);

  useEffect(() => {
    if (!currentUserId) return;
    if (!isCurrentUserSuperAdmin) {
      setCostGuardrailSnapshot(DEFAULT_COST_GUARDRAIL_SNAPSHOT);
      return;
    }
    void loadCostGuardrailSnapshot();
  }, [currentUserId, isCurrentUserSuperAdmin, loadCostGuardrailSnapshot]);

  useEffect(() => {
    if (!autoRefreshCritical || activeTab !== "critical") return;
    const timer = window.setInterval(() => {
      void loadCentralizedLogs({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeTab, autoRefreshCritical, loadCentralizedLogs]);

  useEffect(() => {
    const persisted = readPersistedFilters(filterStorageKey);
    if (persisted) {
      if (typeof persisted.search === "string") setSearch(persisted.search);
      if (persisted.activeTab) setActiveTab(persisted.activeTab);
      if (persisted.ownershipFilter) setOwnershipFilter(persisted.ownershipFilter);
      if (persisted.tenantScopeFilter) setTenantScopeFilter(persisted.tenantScopeFilter);
      if (persisted.selectedContext) setSelectedContext(persisted.selectedContext);
      // Keep 24h as the default window on each fresh page load.
      if (isValidItemsPerPage(persisted.itemsPerPage)) setItemsPerPage(persisted.itemsPerPage);
    }
    hasHydratedFiltersRef.current = true;
  }, [filterStorageKey]);

  useEffect(() => {
    if (!hasHydratedFiltersRef.current) return;
    writePersistedFilters(filterStorageKey, {
      search,
      activeTab,
      ownershipFilter,
      tenantScopeFilter,
      selectedContext,
      selectedWindow,
      itemsPerPage,
    });
  }, [activeTab, filterStorageKey, itemsPerPage, ownershipFilter, search, selectedContext, selectedWindow, tenantScopeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedContext, selectedWindow, activeTab, itemsPerPage, entries.length, ownershipFilter, tenantScopeFilter]);

  const contextOptions = useMemo(() => {
    const contexts = Array.from(new Set(entries.map((entry) => entry.context).filter(Boolean)));
    return contexts.sort((a, b) => a.localeCompare(b));
  }, [entries]);

  useEffect(() => {
    if (selectedContext === "all") return;
    if (contextOptions.includes(selectedContext)) return;
    setSelectedContext("all");
  }, [contextOptions, selectedContext]);

  const withinWindowEntries = useMemo(() => {
    const now = Date.now();
    return entries.filter((entry) => {
      const timestamp = Date.parse(entry.timestamp);
      return (
        selectedWindow === "all" ||
        (Number.isFinite(timestamp) &&
          ((selectedWindow === "24h" && now - timestamp <= 24 * 60 * 60 * 1000) ||
            (selectedWindow === "7d" && now - timestamp <= 7 * 24 * 60 * 60 * 1000) ||
            (selectedWindow === "30d" && now - timestamp <= 30 * 24 * 60 * 60 * 1000)))
      );
    });
  }, [entries, selectedWindow]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withinWindowEntries.filter((entry) => {
      const matchesOwnership =
        ownershipFilter === "all" || (ownershipFilter === "mine" && Boolean(currentUserId) && entry.userId === currentUserId);
      const matchesTenantScope =
        tenantScopeFilter === "all_tenants" ||
        (tenantScopeFilter === "my_tenant" &&
          Boolean(currentUserTenantId) &&
          entry.tenantId === currentUserTenantId) ||
        (tenantScopeFilter === "no_tenant" && !entry.tenantId);
      const matchesContext = selectedContext === "all" || entry.context === selectedContext;
      const matchesSearch =
        !q ||
        entry.id.toLowerCase().includes(q) ||
        entry.context.toLowerCase().includes(q) ||
        entry.message.toLowerCase().includes(q) ||
        (entry.route || "").toLowerCase().includes(q);
      return matchesOwnership && matchesTenantScope && matchesContext && matchesSearch;
    });
  }, [currentUserId, currentUserTenantId, ownershipFilter, search, selectedContext, tenantScopeFilter, withinWindowEntries]);

  const activeEntries = useMemo(
    () => filteredEntries.filter((entry) => !entry.isArchived),
    [filteredEntries],
  );

  const baseCriticalEntries = useMemo(() => activeEntries.filter((entry) => !isNonCriticalEntry(entry)), [activeEntries]);
  const criticalEntries = useMemo(() => baseCriticalEntries.filter((entry) => !isResolvedEntry(entry)), [baseCriticalEntries]);
  const resolvedCriticalEntries = useMemo(() => baseCriticalEntries.filter((entry) => isResolvedEntry(entry)), [baseCriticalEntries]);
  const nonCriticalEntries = useMemo(
    () => activeEntries.filter((entry) => isNonCriticalEntry(entry)),
    [activeEntries],
  );
  const archivedCriticalEntries = useMemo(
    () =>
      filteredEntries.filter(
        (entry) =>
          !isNonCriticalEntry(entry) &&
          Boolean(entry.isArchived),
      ),
    [filteredEntries],
  );
  const archivedNonCriticalEntries = useMemo(
    () =>
      filteredEntries.filter(
        (entry) =>
          isNonCriticalEntry(entry) &&
          Boolean(entry.isArchived),
      ),
    [filteredEntries],
  );
  const visibleNonCriticalEntries = useMemo(
    () => nonCriticalEntries.slice(0, NON_CRITICAL_MAX_VISIBLE),
    [nonCriticalEntries],
  );
  const tabbedEntries =
    activeTab === "critical"
      ? criticalEntries
      : activeTab === "non_critical"
        ? visibleNonCriticalEntries
        : activeTab === "resolved_critical"
          ? resolvedCriticalEntries
          : activeTab === "archived_critical"
            ? archivedCriticalEntries
            : archivedNonCriticalEntries;

  const totalPages = Math.max(1, Math.ceil(tabbedEntries.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEntries = tabbedEntries.slice(startIndex, endIndex);
  const webhookTargets = useMemo(() => toWebhookTargets(alertSettings), [alertSettings]);
  const selectedWindowLabel = selectedWindow === "24h" ? "24 Jam" : selectedWindow === "7d" ? "7 Hari" : selectedWindow === "30d" ? "30 Hari" : "Semua Waktu";
  const headerWindowCounts = useMemo(() => {
    const criticalOpen = withinWindowEntries.filter(
      (entry) => !isNonCriticalEntry(entry) && !entry.isArchived && !isResolvedEntry(entry),
    ).length;
    const nonCritical = withinWindowEntries.filter((entry) => isNonCriticalEntry(entry) && !entry.isArchived).length;
    const criticalResolved = withinWindowEntries.filter(
      (entry) => !isNonCriticalEntry(entry) && !entry.isArchived && isResolvedEntry(entry),
    ).length;
    const criticalArchived = withinWindowEntries.filter(
      (entry) => !isNonCriticalEntry(entry) && Boolean(entry.isArchived),
    ).length;
    const nonCriticalArchived = withinWindowEntries.filter(
      (entry) => isNonCriticalEntry(entry) && Boolean(entry.isArchived),
    ).length;
    return {
      total: withinWindowEntries.length,
      criticalOpen,
      nonCritical,
      criticalResolved,
      criticalArchived,
      nonCriticalArchived,
    };
  }, [withinWindowEntries]);

  const sendCriticalAlertToWebhooks = useCallback(
    async (entry: ErrorLogRow) => {
      if (!alertSettings.enableRealtimeAlerts) return;
      if (webhookTargets.length === 0) return;
      const payload = {
        event: "critical_error_log",
        source: "absensiku.admin.log_errors",
        sent_at: new Date().toISOString(),
        error: {
          ref: entry.id,
          timestamp: entry.timestamp,
          context: entry.context,
          message: entry.message,
          route: entry.route || null,
          metadata: entry.metadata ?? null,
        },
      };
      const reportPartialFailure = (failedTargets: number, totalTargets: number) => {
        const errorRef = reportError(
          new Error("Sebagian webhook alert kritis gagal dikirim"),
          "admin.error_logs.realtime_alert_webhook",
          {
            critical_error_ref: entry.id,
            failed_targets: failedTargets,
            total_targets: totalTargets,
          },
        );
        toast.warning(appendErrorReference("Sebagian alert realtime kritis gagal dikirim", errorRef));
      };

      const postDirectlyFromClient = async () => {
        const results = await Promise.allSettled(
          webhookTargets.map(async (target) => {
            const response = await withExponentialBackoff(
              () =>
                withTimeout(
                  fetch(target.url, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ ...payload, channel: target.channel }),
                  }),
                  ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
                  `admin.error_logs.direct_webhook_post timeout (${target.channel})`,
                ),
              {
                maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              },
            );
            if (!response.ok) {
              throw new Error(`${target.channel}: HTTP ${response.status}`);
            }
          }),
        );
        const failed = results.filter((result) => result.status === "rejected");
        if (failed.length > 0) {
          reportPartialFailure(failed.length, webhookTargets.length);
        }
      };

      try {
        const { data, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.functions.invoke(CRITICAL_ALERT_RELAY_FUNCTION, {
                body: payload,
              }),
              ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
              "admin.error_logs.realtime_alert_relay.invoke timeout",
            ),
          {
            maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (error) throw error;
        const response = (data || {}) as Record<string, unknown>;
        const failedTargets = Number(response.failed || 0);
        const totalTargets = Number(response.attempted || webhookTargets.length);
        if (Number.isFinite(failedTargets) && failedTargets > 0) {
          reportPartialFailure(failedTargets, totalTargets);
        }
      } catch (relayError) {
        const relayRef = reportError(relayError, "admin.error_logs.realtime_alert_relay", {
          critical_error_ref: entry.id,
          function_name: CRITICAL_ALERT_RELAY_FUNCTION,
        });
        toast.warning(
          appendErrorReference(
            "Relay alert realtime gagal, mencoba kirim langsung dari browser.",
            relayRef,
          ),
        );
        await postDirectlyFromClient();
      }
    },
    [alertSettings.enableRealtimeAlerts, webhookTargets],
  );

  const saveAlertSettings = useCallback(async () => {
    setIsSavingAlertSettings(true);
    try {
      const serialized = serializeAlertSettings(alertSettings);
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("system_settings").upsert(
              {
                key: ERROR_ALERT_SETTINGS_KEY,
                value: serialized,
                description: "Pengaturan notifikasi realtime log error kritis (webhook/slack/whatsapp/email).",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key" },
            ),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.alert_settings.save timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      toast.success("Pengaturan alert realtime berhasil disimpan.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.alert_settings.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan alert realtime", errorRef));
    } finally {
      setIsSavingAlertSettings(false);
      setIsRetrying(false);
    }
  }, [alertSettings]);

  const saveErrorRetentionSettings = useCallback(async () => {
    setIsSavingErrorRetentionSettings(true);
    try {
      const serialized = serializeErrorRetentionPolicySettings(errorRetentionSettings);
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("system_settings").upsert(
              {
                key: ERROR_RETENTION_POLICY_KEY,
                value: serialized,
                description:
                  "Kebijakan retensi log error client (hari): arsip non-kritis, hapus non-kritis, arsip kritis selesai, hapus kritis.",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key" },
            ),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.retention_settings.save timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      toast.success("Pengaturan retensi log error berhasil disimpan.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.retention_settings.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan retensi log error", errorRef));
    } finally {
      setIsSavingErrorRetentionSettings(false);
      setIsRetrying(false);
    }
  }, [errorRetentionSettings]);

  const saveRemoteLoggingPolicy = useCallback(async () => {
    setIsSavingRemoteLogMode(true);
    try {
      const serialized = serializeRemoteErrorLoggingPolicy(remoteLogPolicy);
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("system_settings").upsert(
              {
                key: ERROR_LOGGING_POLICY_KEY,
                value: serialized,
                description: "Mode pencatatan log error client + auto schedule (full/critical_only/paused).",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key" },
            ),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.remote_log_mode.save timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      setRemoteErrorLoggingModeOverride(null);
      setRemoteErrorLoggingPolicy(remoteLogPolicy);
      toast.success("Mode log error berhasil disimpan.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.remote_log_mode.save");
      toast.error(appendErrorReference("Gagal menyimpan mode log error", errorRef));
    } finally {
      setIsSavingRemoteLogMode(false);
      setIsRetrying(false);
    }
  }, [remoteLogPolicy]);

  const openTopupRequest = useCallback(
    (entry: ErrorLogRow) => {
      const topupRequestId = getTopupRequestIdFromEntry(entry);
      if (!topupRequestId) return;
      navigate(
        `/admin/billing?tab=wallet_topup&topupRequestId=${encodeURIComponent(topupRequestId)}&errorRef=${encodeURIComponent(entry.id)}`,
      );
    },
    [navigate],
  );

  useEffect(() => {
    if (!focusErrorRef) return;
    hasHandledFocusRef.current = false;
    setSelectedWindow("all");
    setSearch(focusErrorRef);
  }, [focusErrorRef]);

  useEffect(() => {
    if (!focusErrorRef || entries.length === 0 || hasHandledFocusRef.current) return;
    const matched = entries.find((entry) => entry.id === focusErrorRef);
    if (!matched) return;
    hasHandledFocusRef.current = true;
    setActiveTab(resolveTabForEntry(matched));
    setSelectedDetailEntry(matched);
  }, [entries, focusErrorRef]);

  useEffect(() => {
    if (!alertSettings.enableRealtimeAlerts) return;
    const channel = supabase
      .channel(`admin-log-errors-critical-alert-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_error_logs",
        },
        (payload) => {
          const row = (payload.new || {}) as Record<string, unknown>;
          if (!row || Boolean(row.is_non_critical)) return;
          if (Boolean(row.is_archived) || Boolean(row.is_resolved)) return;
          const entry = mapRemoteRowToEntry(row);
          if (!entry.id) return;
          if (realtimeNotifiedRefs.current.has(entry.id)) return;
          realtimeNotifiedRefs.current.add(entry.id);
          if (realtimeNotifiedRefs.current.size > 500) {
            realtimeNotifiedRefs.current.clear();
            realtimeNotifiedRefs.current.add(entry.id);
          }
          setEntries((prev) => {
            if (prev.some((item) => item.id === entry.id)) return prev;
            return [entry, ...prev];
          });
          toast.error(`Error kritis baru: ${entry.id}`, {
            description: `${entry.context} — ${entry.message.slice(0, 120)}`,
          });
          void sendCriticalAlertToWebhooks(entry);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          toast.warning("Realtime alert log error sedang bermasalah. Coba refresh halaman.");
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [alertSettings.enableRealtimeAlerts, sendCriticalAlertToWebhooks]);

  const refreshLogs = () => {
    void loadCentralizedLogs();
    if (isCurrentUserSuperAdmin) {
      void loadCostGuardrailSnapshot();
    }
  };

  const handleResetAllFilters = () => {
    setSearch("");
    setSelectedContext("all");
    setOwnershipFilter("all");
    setTenantScopeFilter("all_tenants");
    setSelectedWindow("24h");
    setItemsPerPage(25);
    setActiveTab("critical");
    setCurrentPage(1);
  };

  const handleRunRetentionNow = async () => {
    setIsRunningRetention(true);
    try {
      setIsRetrying(false);
      const { data, error } = (await withExponentialBackoff(
        () =>
          withTimeout(
            executeRpcWithAvailability<Record<string, unknown>>(
              APPLY_CLIENT_ERROR_LOGS_RETENTION_RPC_NAME,
              () => supabase.rpc(APPLY_CLIENT_ERROR_LOGS_RETENTION_RPC_NAME as never),
            ),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.retention.run timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      )) as {
        data: Record<string, unknown> | null;
        error: { message?: string } | null;
      };
      if (error) throw error;
      const archivedCount = Number(data?.archived_non_critical || 0);
      const archivedResolvedCritical = Number(data?.archived_resolved_critical || 0);
      const deletedNonCritical = Number(data?.deleted_non_critical || 0);
      const deletedCritical = Number(data?.deleted_critical || 0);
      const retentionPayload =
        data?.retention_days && typeof data.retention_days === "object"
          ? (data.retention_days as Record<string, unknown>)
          : null;
      const retentionSummary = retentionPayload
        ? ` (arsip non-kritis ${retentionPayload.non_critical_archive_days ?? "-"}h, hapus non-kritis ${retentionPayload.non_critical_delete_days ?? "-"}h, arsip kritis selesai ${retentionPayload.resolved_critical_archive_days ?? "-"}h, hapus kritis ${retentionPayload.critical_delete_days ?? "-"}h)`
        : "";
      toast.success(
        `Retensi selesai. Arsip non-kritis: ${archivedCount}, arsip kritis selesai: ${archivedResolvedCritical}, hapus non-kritis: ${deletedNonCritical}, hapus kritis: ${deletedCritical}.${retentionSummary}`,
      );
      void loadCentralizedLogs();
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.retention.run");
      toast.error(appendErrorReference("Gagal menjalankan retensi log error", errorRef));
    } finally {
      setIsRunningRetention(false);
      setIsRetrying(false);
    }
  };

  const openCentralizedPurgeDialog = () => {
    if (!isCurrentUserSuperAdmin) {
      toast.warning("Purge log terpusat hanya tersedia untuk Super Admin.");
      return;
    }
    setCentralizedPurgeScope("archived_or_resolved");
    setCentralizedPurgeSlideValue([0]);
    setCentralizedPurgePreviewCount(null);
    setIsCentralizedPurgeDialogOpen(true);
  };

  const isCentralizedPurgeConfirmationValid =
    (centralizedPurgeSlideValue[0] ?? 0) >= CENTRALIZED_PURGE_SLIDE_ARM_THRESHOLD;
  const isCentralizedPurgeAllScope = centralizedPurgeScope === "all";
  const centralizedPurgeSlideProgress = Math.min(
    CENTRALIZED_PURGE_SLIDE_MAX,
    Math.max(0, centralizedPurgeSlideValue[0] ?? 0),
  );

  const handleConfirmCentralizedPurge = async () => {
    if (!isCurrentUserSuperAdmin) {
      toast.warning("Purge log terpusat hanya tersedia untuk Super Admin.");
      return;
    }
    if (!isCentralizedPurgeConfirmationValid) {
      toast.info("Geser verifikasi sampai ujung kanan untuk mengaktifkan purge.");
      return;
    }

    setIsRunningCentralizedPurge(true);
    try {
      setIsRetrying(false);
      const { data, error } = (await withExponentialBackoff(
        () =>
          withTimeout(
            executeRpcWithAvailability<Record<string, unknown>>(
              PURGE_CLIENT_ERROR_LOGS_RPC_NAME,
              () =>
                supabase.rpc(
                  PURGE_CLIENT_ERROR_LOGS_RPC_NAME as never,
                  {
                    p_scope: centralizedPurgeScope,
                    p_confirmation: CENTRALIZED_PURGE_CONFIRMATION_PHRASE,
                  } as never,
                ),
            ),
            ADMIN_ERROR_LOGS_QUERY_TIMEOUT_MS,
            "admin.error_logs.purge_centralized.run timeout",
          ),
        {
          maxRetries: ADMIN_ERROR_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      )) as {
        data: Record<string, unknown> | null;
        error: { message?: string } | null;
      };
      if (error) throw error;
      const deletedCount = Number(data?.deleted || 0);
      const auditId = typeof data?.audit_id === "string" ? data.audit_id : null;
      toast.success(
        auditId
          ? `Purge log terpusat selesai. ${deletedCount} entri dihapus (${CENTRALIZED_PURGE_SCOPE_LABEL[centralizedPurgeScope]}). Audit: ${auditId}.`
          : `Purge log terpusat selesai. ${deletedCount} entri dihapus (${CENTRALIZED_PURGE_SCOPE_LABEL[centralizedPurgeScope]}).`,
      );
      setIsCentralizedPurgeDialogOpen(false);
      setCentralizedPurgeSlideValue([0]);
      setCentralizedPurgePreviewCount(0);
      void loadCentralizedLogs();
      void loadCostGuardrailSnapshot();
    } catch (error) {
      const rawErrorText = toErrorText(error).toLowerCase();
      const purgeMessage = resolveCentralizedPurgeErrorMessage(
        rawErrorText,
        CENTRALIZED_PURGE_CONFIRMATION_PHRASE,
      );
      const errorRef = reportError(error, "admin.error_logs.purge_centralized.run", {
        purge_scope: centralizedPurgeScope,
        error_text: rawErrorText,
      });
      toast.error(appendErrorReference(purgeMessage, errorRef));
    } finally {
      setIsRunningCentralizedPurge(false);
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    if (!isCentralizedPurgeDialogOpen) return;
    void loadCentralizedPurgePreview(centralizedPurgeScope);
  }, [centralizedPurgeScope, isCentralizedPurgeDialogOpen, loadCentralizedPurgePreview]);

  const handleClear = () => {
    const localCount = getStoredErrorLogs().length;
    if (localCount === 0) {
      toast.info("Tidak ada log lokal untuk dibersihkan. Data yang tampil saat ini berasal dari log terpusat (Supabase).");
      return;
    }
    clearStoredErrorLogs();
    writeArchivedLocalRefs(new Set());
    writeResolvedLocalRefs(new Set());
    writeLocalNonCriticalOverrides({});
    if (dataSource === "hybrid") {
      void loadCentralizedLogs();
    } else {
      setEntries([]);
    }
    toast.success(`Log error lokal berhasil dibersihkan (${localCount} entri).`);
  };

  const handleExportCsv = () => {
    if (tabbedEntries.length === 0) {
      toast.info("Tidak ada data error untuk diekspor.");
      return;
    }
    const filename = `error-logs-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
    downloadFile(filename, toCsv(tabbedEntries), "text/csv;charset=utf-8;");
    toast.success("Ekspor CSV berhasil.");
  };

  const handleExportJson = () => {
    if (tabbedEntries.length === 0) {
      toast.info("Tidak ada data error untuk diekspor.");
      return;
    }
    const filename = `error-logs-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    downloadFile(filename, JSON.stringify(tabbedEntries, null, 2), "application/json;charset=utf-8;");
    toast.success("Ekspor JSON berhasil.");
  };

  const handleArchiveCritical = async (entry: ErrorLogRow) => {
    if (!entry.rowId) {
      const refs = readArchivedLocalRefs();
      refs.add(entry.id);
      writeArchivedLocalRefs(refs);
      setEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, isArchived: true } : item)));
      toast.success("Error kritis lokal dipindahkan ke arsip.");
      return;
    }

    setArchivingRefId(entry.id);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("client_error_logs" as never)
        .update({
          is_archived: true,
          archived_at: nowIso,
        } as never)
        .eq("id", entry.rowId);
      if (error) throw error;

      setEntries((prev) =>
        prev.map((item) =>
          item.rowId === entry.rowId ? { ...item, isArchived: true, archivedAt: nowIso } : item,
        ),
      );
      toast.success("Error kritis dipindahkan ke arsip.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.archive_critical", {
        error_ref: entry.id,
        row_id: entry.rowId,
      });
      toast.error(appendErrorReference("Gagal mengarsipkan error kritis", errorRef));
    } finally {
      setArchivingRefId(null);
    }
  };

  const handleSetNonCritical = async (entry: ErrorLogRow, nextValue: boolean) => {
    if (isNonCriticalEntry(entry) === nextValue) return;

    if (!entry.rowId) {
      const overrides = readLocalNonCriticalOverrides();
      const defaultValue = isNonCriticalClientError(entry.context, entry.message);
      if (nextValue === defaultValue) {
        delete overrides[entry.id];
      } else {
        overrides[entry.id] = nextValue;
      }
      writeLocalNonCriticalOverrides(overrides);
      setEntries((prev) =>
        prev.map((item) => (item.id === entry.id ? { ...item, isNonCritical: nextValue } : item)),
      );
      toast.success(nextValue ? "Log ditandai Non Kritis." : "Log ditandai Kritis.");
      return;
    }

    setClassifyingRefId(entry.id);
    try {
      const { error } = await supabase
        .from("client_error_logs" as never)
        .update({ is_non_critical: nextValue } as never)
        .eq("id", entry.rowId);
      if (error) throw error;

      setEntries((prev) =>
        prev.map((item) => (item.rowId === entry.rowId ? { ...item, isNonCritical: nextValue } : item)),
      );
      toast.success(nextValue ? "Log ditandai Non Kritis." : "Log ditandai Kritis.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.set_non_critical", {
        error_ref: entry.id,
        row_id: entry.rowId,
        next_value: nextValue,
      });
      toast.error(appendErrorReference("Gagal mengubah klasifikasi log", errorRef));
    } finally {
      setClassifyingRefId(null);
    }
  };

  const resolvedActor = currentUserLabel || currentUserId || "super_admin";

  const handleResolveCritical = async (entry: ErrorLogRow) => {
    if (isResolvedEntry(entry)) return;

    if (!entry.rowId) {
      const refs = readResolvedLocalRefs();
      refs.add(entry.id);
      writeResolvedLocalRefs(refs);
      const nowIso = new Date().toISOString();
      setEntries((prev) =>
        prev.map((item) =>
          item.id === entry.id
            ? { ...item, isResolved: true, resolvedAt: nowIso, resolvedBy: resolvedActor }
            : item,
        ),
      );
      toast.success("Error kritis lokal ditandai selesai.");
      return;
    }

    setResolvingRefId(entry.id);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("client_error_logs" as never)
        .update({
          is_resolved: true,
          resolved_at: nowIso,
          resolved_by: resolvedActor,
        } as never)
        .eq("id", entry.rowId);
      if (error) throw error;

      setEntries((prev) =>
        prev.map((item) =>
          item.rowId === entry.rowId
            ? { ...item, isResolved: true, resolvedAt: nowIso, resolvedBy: resolvedActor }
            : item,
        ),
      );
      toast.success("Error kritis ditandai selesai.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.resolve", {
        error_ref: entry.id,
        row_id: entry.rowId,
      });
      toast.error(appendErrorReference("Gagal menandai error sebagai selesai", errorRef));
    } finally {
      setResolvingRefId(null);
    }
  };

  const handleReopenCritical = async (entry: ErrorLogRow) => {
    if (!isResolvedEntry(entry)) return;

    if (!entry.rowId) {
      const refs = readResolvedLocalRefs();
      refs.delete(entry.id);
      writeResolvedLocalRefs(refs);
      setEntries((prev) =>
        prev.map((item) =>
          item.id === entry.id
            ? { ...item, isResolved: false, resolvedAt: null, resolvedBy: null, resolutionNote: null }
            : item,
        ),
      );
      toast.success("Error lokal berhasil dibuka kembali.");
      return;
    }

    setReopeningRefId(entry.id);
    try {
      const { error } = await supabase
        .from("client_error_logs" as never)
        .update({
          is_resolved: false,
          resolved_at: null,
          resolved_by: null,
          resolution_note: null,
        } as never)
        .eq("id", entry.rowId);
      if (error) throw error;

      setEntries((prev) =>
        prev.map((item) =>
          item.rowId === entry.rowId
            ? { ...item, isResolved: false, resolvedAt: null, resolvedBy: null, resolutionNote: null }
            : item,
        ),
      );
      toast.success("Error kritis berhasil dibuka kembali.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.reopen", {
        error_ref: entry.id,
        row_id: entry.rowId,
      });
      toast.error(appendErrorReference("Gagal membuka kembali error kritis", errorRef));
    } finally {
      setReopeningRefId(null);
    }
  };

  const handleUnarchiveCritical = async (entry: ErrorLogRow) => {
    if (!entry.isArchived) return;

    if (!entry.rowId) {
      const refs = readArchivedLocalRefs();
      refs.delete(entry.id);
      writeArchivedLocalRefs(refs);
      setEntries((prev) =>
        prev.map((item) =>
          item.id === entry.id ? { ...item, isArchived: false, archivedAt: null } : item,
        ),
      );
      toast.success("Arsip error lokal berhasil dipulihkan.");
      return;
    }

    setUnarchivingRefId(entry.id);
    try {
      const { error } = await supabase
        .from("client_error_logs" as never)
        .update({
          is_archived: false,
          archived_at: null,
        } as never)
        .eq("id", entry.rowId);
      if (error) throw error;

      setEntries((prev) =>
        prev.map((item) =>
          item.rowId === entry.rowId ? { ...item, isArchived: false, archivedAt: null } : item,
        ),
      );
      toast.success("Arsip error berhasil dipulihkan.");
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.unarchive_critical", {
        error_ref: entry.id,
        row_id: entry.rowId,
      });
      toast.error(appendErrorReference("Gagal memulihkan arsip error kritis", errorRef));
    } finally {
      setUnarchivingRefId(null);
    }
  };

  const handleBulkArchiveCritical = async () => {
    const targets = paginatedEntries.filter((entry) => !entry.isArchived);
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk diarsipkan.");
      return;
    }

    setIsBulkArchiving(true);
    try {
      const nowIso = new Date().toISOString();
      const remoteRowIds = targets
        .map((entry) => entry.rowId)
        .filter((value): value is string => Boolean(value));
      if (remoteRowIds.length > 0) {
        const query = (supabase
          .from("client_error_logs" as never)
          .update({ is_archived: true, archived_at: nowIso } as never) as unknown as {
          in: (
            column: string,
            values: string[],
          ) => Promise<{ error: { message?: string } | null }>;
        }).in("id", remoteRowIds);
        const { error } = await query;
        if (error) throw error;
      }

      const localTargets = targets.filter((entry) => !entry.rowId);
      if (localTargets.length > 0) {
        const refs = readArchivedLocalRefs();
        for (const entry of localTargets) {
          refs.add(entry.id);
        }
        writeArchivedLocalRefs(refs);
      }

      const targetRefs = new Set(targets.map((entry) => entry.id));
      setEntries((prev) =>
        prev.map((entry) =>
          targetRefs.has(entry.id) ? { ...entry, isArchived: true, archivedAt: nowIso } : entry,
        ),
      );
      toast.success(`${targets.length} log pada halaman ini dipindahkan ke arsip.`);
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.bulk_archive_critical", {
        affected_count: targets.length,
      });
      toast.error(appendErrorReference("Gagal mengarsipkan log secara bulk", errorRef));
    } finally {
      setIsBulkArchiving(false);
    }
  };

  const handleBulkUnarchiveCritical = async () => {
    const targets = paginatedEntries.filter((entry) => Boolean(entry.isArchived));
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk dipulihkan.");
      return;
    }

    setIsBulkUnarchiving(true);
    try {
      const remoteRowIds = targets
        .map((entry) => entry.rowId)
        .filter((value): value is string => Boolean(value));
      if (remoteRowIds.length > 0) {
        const query = (supabase
          .from("client_error_logs" as never)
          .update({ is_archived: false, archived_at: null } as never) as unknown as {
          in: (
            column: string,
            values: string[],
          ) => Promise<{ error: { message?: string } | null }>;
        }).in("id", remoteRowIds);
        const { error } = await query;
        if (error) throw error;
      }

      const localTargets = targets.filter((entry) => !entry.rowId);
      if (localTargets.length > 0) {
        const refs = readArchivedLocalRefs();
        for (const entry of localTargets) {
          refs.delete(entry.id);
        }
        writeArchivedLocalRefs(refs);
      }

      const targetRefs = new Set(targets.map((entry) => entry.id));
      setEntries((prev) =>
        prev.map((entry) =>
          targetRefs.has(entry.id) ? { ...entry, isArchived: false, archivedAt: null } : entry,
        ),
      );
      toast.success(`${targets.length} arsip pada halaman ini dipulihkan.`);
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.bulk_unarchive_critical", {
        affected_count: targets.length,
      });
      toast.error(appendErrorReference("Gagal memulihkan arsip secara bulk", errorRef));
    } finally {
      setIsBulkUnarchiving(false);
    }
  };

  const handleBulkSetNonCritical = async (nextValue: boolean) => {
    const targets = paginatedEntries.filter((entry) => isNonCriticalEntry(entry) !== nextValue);
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk diubah.");
      return;
    }

    setIsBulkClassifying(true);
    try {
      const remoteRowIds = targets
        .map((entry) => entry.rowId)
        .filter((value): value is string => Boolean(value));
      if (remoteRowIds.length > 0) {
        const query = (supabase
          .from("client_error_logs" as never)
          .update({ is_non_critical: nextValue } as never) as unknown as {
          in: (
            column: string,
            values: string[],
          ) => Promise<{ error: { message?: string } | null }>;
        }).in("id", remoteRowIds);
        const { error } = await query;
        if (error) throw error;
      }

      const localTargets = targets.filter((entry) => !entry.rowId);
      if (localTargets.length > 0) {
        const overrides = readLocalNonCriticalOverrides();
        for (const entry of localTargets) {
          const defaultValue = isNonCriticalClientError(entry.context, entry.message);
          if (nextValue === defaultValue) {
            delete overrides[entry.id];
          } else {
            overrides[entry.id] = nextValue;
          }
        }
        writeLocalNonCriticalOverrides(overrides);
      }

      const targetRefs = new Set(targets.map((entry) => entry.id));
      setEntries((prev) =>
        prev.map((entry) =>
          targetRefs.has(entry.id) ? { ...entry, isNonCritical: nextValue } : entry,
        ),
      );
      toast.success(
        nextValue
          ? `${targets.length} log pada halaman ini ditandai Non Kritis.`
          : `${targets.length} log pada halaman ini ditandai Kritis.`,
      );
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.bulk_set_non_critical", {
        next_value: nextValue,
        affected_count: targets.length,
      });
      toast.error(appendErrorReference("Gagal mengubah klasifikasi bulk", errorRef));
    } finally {
      setIsBulkClassifying(false);
    }
  };

  const handleBulkResolveCritical = async () => {
    const targets = paginatedEntries.filter((entry) => !isResolvedEntry(entry));
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk ditandai selesai.");
      return;
    }

    setIsBulkResolving(true);
    try {
      const nowIso = new Date().toISOString();
      const remoteRowIds = targets.map((entry) => entry.rowId).filter((value): value is string => Boolean(value));
      if (remoteRowIds.length > 0) {
        const query = (supabase
          .from("client_error_logs" as never)
          .update({
            is_resolved: true,
            resolved_at: nowIso,
            resolved_by: resolvedActor,
          } as never) as unknown as {
          in: (column: string, values: string[]) => Promise<{ error: { message?: string } | null }>;
        }).in("id", remoteRowIds);
        const { error } = await query;
        if (error) throw error;
      }

      const localTargets = targets.filter((entry) => !entry.rowId);
      if (localTargets.length > 0) {
        const refs = readResolvedLocalRefs();
        for (const entry of localTargets) {
          refs.add(entry.id);
        }
        writeResolvedLocalRefs(refs);
      }

      const targetRefs = new Set(targets.map((entry) => entry.id));
      setEntries((prev) =>
        prev.map((entry) =>
          targetRefs.has(entry.id)
            ? { ...entry, isResolved: true, resolvedAt: nowIso, resolvedBy: resolvedActor }
            : entry,
        ),
      );
      toast.success(`${targets.length} log kritis pada halaman ini ditandai selesai.`);
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.bulk_resolve", {
        affected_count: targets.length,
      });
      toast.error(appendErrorReference("Gagal menandai selesai secara bulk", errorRef));
    } finally {
      setIsBulkResolving(false);
    }
  };

  const handleBulkReopenCritical = async () => {
    const targets = paginatedEntries.filter((entry) => isResolvedEntry(entry));
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk dibuka kembali.");
      return;
    }

    setIsBulkReopening(true);
    try {
      const remoteRowIds = targets.map((entry) => entry.rowId).filter((value): value is string => Boolean(value));
      if (remoteRowIds.length > 0) {
        const query = (supabase
          .from("client_error_logs" as never)
          .update({
            is_resolved: false,
            resolved_at: null,
            resolved_by: null,
            resolution_note: null,
          } as never) as unknown as {
          in: (column: string, values: string[]) => Promise<{ error: { message?: string } | null }>;
        }).in("id", remoteRowIds);
        const { error } = await query;
        if (error) throw error;
      }

      const localTargets = targets.filter((entry) => !entry.rowId);
      if (localTargets.length > 0) {
        const refs = readResolvedLocalRefs();
        for (const entry of localTargets) {
          refs.delete(entry.id);
        }
        writeResolvedLocalRefs(refs);
      }

      const targetRefs = new Set(targets.map((entry) => entry.id));
      setEntries((prev) =>
        prev.map((entry) =>
          targetRefs.has(entry.id)
            ? { ...entry, isResolved: false, resolvedAt: null, resolvedBy: null, resolutionNote: null }
            : entry,
        ),
      );
      toast.success(`${targets.length} log kritis pada halaman ini dibuka kembali.`);
    } catch (error) {
      const errorRef = reportError(error, "admin.error_logs.bulk_reopen", {
        affected_count: targets.length,
      });
      toast.error(appendErrorReference("Gagal membuka kembali data secara bulk", errorRef));
    } finally {
      setIsBulkReopening(false);
    }
  };

  const handleCopyRef = async (errorRef: string) => {
    try {
      await navigator.clipboard.writeText(errorRef);
      toast.success("Ref error berhasil disalin.");
    } catch {
      toast.error("Gagal menyalin ref error.");
    }
  };

  const dataSourceLabel =
    dataSource === "centralized" ? "Terpusat" : dataSource === "hybrid" ? "Terpusat + Lokal" : "Lokal";
  const isBulkDialogOpen = bulkConfirmDialog !== null;
  const openBulkArchiveConfirmDialog = () => {
    const targets = paginatedEntries.filter((entry) => !entry.isArchived);
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk diarsipkan.");
      return;
    }
    setBulkConfirmDialog({ action: "archive", count: targets.length });
  };
  const openBulkUnarchiveConfirmDialog = () => {
    const targets = paginatedEntries.filter((entry) => Boolean(entry.isArchived));
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk dipulihkan.");
      return;
    }
    setBulkConfirmDialog({ action: "unarchive", count: targets.length });
  };
  const openBulkResolveConfirmDialog = () => {
    const targets = paginatedEntries.filter((entry) => !isResolvedEntry(entry));
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk ditandai selesai.");
      return;
    }
    setBulkConfirmDialog({ action: "resolve", count: targets.length });
  };
  const openBulkReopenConfirmDialog = () => {
    const targets = paginatedEntries.filter((entry) => isResolvedEntry(entry));
    if (targets.length === 0) {
      toast.info("Tidak ada data pada halaman ini untuk dibuka kembali.");
      return;
    }
    setBulkConfirmDialog({ action: "reopen", count: targets.length });
  };
  const handleConfirmBulkDialog = async () => {
    const action = bulkConfirmDialog?.action;
    setBulkConfirmDialog(null);
    if (action === "archive") {
      await handleBulkArchiveCritical();
      return;
    }
    if (action === "unarchive") {
      await handleBulkUnarchiveCritical();
      return;
    }
    if (action === "resolve") {
      await handleBulkResolveCritical();
      return;
    }
    if (action === "reopen") {
      await handleBulkReopenCritical();
    }
  };

  const renderRowActions = (entry: ErrorLogRow) => {
    const isActionBusy =
      classifyingRefId === entry.id ||
      resolvingRefId === entry.id ||
      reopeningRefId === entry.id ||
      archivingRefId === entry.id ||
      unarchivingRefId === entry.id ||
      isBulkClassifying ||
      isBulkArchiving ||
      isBulkUnarchiving ||
      isBulkResolving ||
      isBulkReopening;

    return (
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDetailEntry(entry)}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          Rincian
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {getTopupRequestIdFromEntry(entry) ? (
              <DropdownMenuItem onClick={() => openTopupRequest(entry)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Buka Topup
              </DropdownMenuItem>
            ) : null}
            {activeTab === "critical" ? (
              <>
                <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleSetNonCritical(entry, true)}>
                  Tandai Non Kritis
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleResolveCritical(entry)}>
                  Tandai Selesai
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleArchiveCritical(entry)}>
                  Arsipkan
                </DropdownMenuItem>
              </>
            ) : null}
            {activeTab === "non_critical" ? (
              <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleSetNonCritical(entry, false)}>
                Tandai Kritis
              </DropdownMenuItem>
            ) : null}
            {activeTab === "resolved_critical" ? (
              <>
                <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleReopenCritical(entry)}>
                  Buka Lagi
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleArchiveCritical(entry)}>
                  Arsipkan
                </DropdownMenuItem>
              </>
            ) : null}
            {activeTab === "archived_critical" ? (
              <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleUnarchiveCritical(entry)}>
                Pulihkan
              </DropdownMenuItem>
            ) : null}
            {activeTab === "archived_non_critical" ? (
              <>
                <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleSetNonCritical(entry, false)}>
                  Tandai Kritis
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isActionBusy} onClick={() => void handleUnarchiveCritical(entry)}>
                  Pulihkan
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <SuperAdminLayout title="Log Error" subtitle="Catatan error/gagal muat data berdasarkan nomor referensi">
      <div className="space-y-6">
        <Card className="border-amber-300 bg-amber-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              Informasi
            </CardTitle>
            <CardDescription className="text-amber-800">
              Menampilkan log error terpusat lintas pengguna. Jika koneksi gagal, sistem otomatis fallback ke log lokal browser.
              Error jaringan sementara seperti <code>fetch.network_error</code> diklasifikasikan sebagai Non Kritis.
              Status <code>resolved</code> digunakan untuk menandai insiden yang sudah ditindaklanjuti.
              Tombol <code>Bersihkan Cache Log Browser</code> hanya menghapus log di browser ini, tidak menghapus data terpusat di Supabase.
              Untuk menghapus data di Supabase, gunakan <code>Zona Berbahaya</code> dan buka dialog <code>Purge Log Terpusat</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refreshLogs}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Muat Ulang
            </Button>
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-2" />
              Ekspor CSV
            </Button>
            <Button variant="outline" onClick={handleExportJson}>
              <Download className="h-4 w-4 mr-2" />
              Ekspor JSON
            </Button>
            <Button variant="outline" onClick={() => void handleRunRetentionNow()} disabled={isRunningRetention}>
              <Clock3 className="h-4 w-4 mr-2" />
              {isRunningRetention ? "Menjalankan Retensi..." : "Retensi Sekarang"}
            </Button>
          </CardContent>
        </Card>
        {isCurrentUserSuperAdmin ? (
          <Card>
          <CardHeader>
            <CardTitle>Guardrail Biaya Log</CardTitle>
            <CardDescription>
              Pantau volume log terpusat untuk kontrol biaya Supabase/Vercel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Volume 24 Jam</p>
                <p className="text-xl font-semibold">{costGuardrailSnapshot.last24hCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Volume 7 Hari</p>
                <p className="text-xl font-semibold">{costGuardrailSnapshot.last7dCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Proyeksi 30 Hari</p>
                <p className="text-xl font-semibold">{costGuardrailSnapshot.projected30dCount}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={
                  costGuardrailSnapshot.warningLevel === "high"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : costGuardrailSnapshot.warningLevel === "warning"
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-emerald-300 bg-emerald-50 text-emerald-700"
                }
              >
                Status:{" "}
                {costGuardrailSnapshot.warningLevel === "high"
                  ? "Tinggi"
                  : costGuardrailSnapshot.warningLevel === "warning"
                    ? "Waspada"
                    : "Aman"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {isLoadingCostGuardrail
                  ? "Memuat snapshot biaya..."
                  : costGuardrailSnapshot.refreshedAt
                    ? `Update ${format(new Date(costGuardrailSnapshot.refreshedAt), "dd MMM yyyy HH:mm:ss", { locale: id })}`
                    : "Snapshot belum tersedia"}
              </span>
            </div>
          </CardContent>
          </Card>
        ) : null}
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang koneksi data log error...
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Mode Pencatatan Log Error</CardTitle>
            <CardDescription>
              Gunakan mode ini untuk menghemat biaya Supabase/Vercel. Saat mode <code>paused</code>, log error baru tidak dikirim ke
              <code>client_error_logs</code> sampai diaktifkan kembali.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Select
                  value={remoteLogPolicy.mode}
                  onValueChange={(value) =>
                    setRemoteLogPolicy((prev) => ({ ...prev, mode: value as RemoteErrorLoggingMode }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih mode log error" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full (semua error)</SelectItem>
                    <SelectItem value="critical_only">Critical Only (hanya kritis)</SelectItem>
                    <SelectItem value="paused">Paused (matikan sementara)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Bawaan: {remoteLogPolicy.mode}</Badge>
                <Badge variant="secondary">Efektif: {effectiveRemoteLogMode}</Badge>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Auto Schedule Mode</p>
                  <p className="text-xs text-muted-foreground">
                    Otomatis ganti mode antara jam kerja dan luar jam kerja untuk menekan volume log.
                  </p>
                </div>
                <Switch
                  checked={remoteLogPolicy.schedule.enabled}
                  onCheckedChange={(checked) =>
                    setRemoteLogPolicy((prev) => ({
                      ...prev,
                      schedule: { ...prev.schedule, enabled: checked },
                    }))
                  }
                />
              </div>
              {remoteLogPolicy.schedule.enabled ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Timezone</p>
                    <Input
                      value={remoteLogPolicy.schedule.timezone}
                      onChange={(event) =>
                        setRemoteLogPolicy((prev) => ({
                          ...prev,
                          schedule: { ...prev.schedule, timezone: event.target.value },
                        }))
                      }
                      placeholder="Asia/Jakarta"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Jam Mulai Kerja</p>
                    <Input
                      type="time"
                      value={remoteLogPolicy.schedule.businessStart}
                      onChange={(event) =>
                        setRemoteLogPolicy((prev) => ({
                          ...prev,
                          schedule: { ...prev.schedule, businessStart: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Jam Selesai Kerja</p>
                    <Input
                      type="time"
                      value={remoteLogPolicy.schedule.businessEnd}
                      onChange={(event) =>
                        setRemoteLogPolicy((prev) => ({
                          ...prev,
                          schedule: { ...prev.schedule, businessEnd: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Mode Jam Kerja</p>
                    <Select
                      value={remoteLogPolicy.schedule.businessMode}
                      onValueChange={(value) =>
                        setRemoteLogPolicy((prev) => ({
                          ...prev,
                          schedule: {
                            ...prev.schedule,
                            businessMode: value as RemoteErrorLoggingMode,
                          },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Mode jam kerja" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full</SelectItem>
                        <SelectItem value="critical_only">Critical Only</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Mode Luar Jam Kerja</p>
                    <Select
                      value={remoteLogPolicy.schedule.offHoursMode}
                      onValueChange={(value) =>
                        setRemoteLogPolicy((prev) => ({
                          ...prev,
                          schedule: {
                            ...prev.schedule,
                            offHoursMode: value as RemoteErrorLoggingMode,
                          },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Mode luar jam kerja" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full</SelectItem>
                        <SelectItem value="critical_only">Critical Only</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Override Tenant (Atas Permintaan)</p>
                  <p className="text-xs text-muted-foreground">
                    Gunakan untuk mengaktifkan log error tenant tertentu saat mode global dipause atau dibatasi.
                  </p>
                </div>
                <Badge variant="outline">
                  {tenantOverrideRows.length} override
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Select value={selectedTenantOverrideId} onValueChange={setSelectedTenantOverrideId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pilih tenant...</SelectItem>
                    {tenantOptions.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} {tenant.code ? `(${tenant.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedTenantOverrideMode}
                  onValueChange={(value) => setSelectedTenantOverrideMode(value as RemoteErrorLoggingMode)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mode override" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full</SelectItem>
                    <SelectItem value="critical_only">Critical Only</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={applyTenantOverride}
                  disabled={selectedTenantOverrideId === "none"}
                >
                  Simpan Override
                </Button>
              </div>

              {tenantOverrideRows.length > 0 ? (
                <div className="space-y-2">
                  {tenantOverrideRows.map((row) => (
                    <div
                      key={row.tenantId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-muted-foreground">
                          {row.code ? row.code : row.tenantId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{row.mode}</Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeTenantOverride(row.tenantId)}
                        >
                          Hapus Override
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Belum ada override tenant. Semua tenant mengikuti mode global.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveRemoteLoggingPolicy()} disabled={isSavingRemoteLogMode}>
                {isSavingRemoteLogMode ? "Menyimpan..." : "Simpan Mode Log"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void loadRemoteLoggingPolicy()} disabled={isSavingRemoteLogMode}>
                Muat Ulang Mode
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Retensi Auto Delete Log Error</CardTitle>
            <CardDescription>
              Atur umur data log error agar database tetap ringan. Nilai menggunakan satuan hari dan dipakai oleh cron harian serta tombol
              <code> Retensi Sekarang</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Arsip Non Kritis Setelah (hari)</p>
                <Input
                  type="number"
                  min={1}
                  value={errorRetentionSettings.nonCriticalArchiveDays}
                  onChange={(event) =>
                    setErrorRetentionSettings((prev) => ({
                      ...prev,
                      nonCriticalArchiveDays: toPositiveInteger(event.target.value, prev.nonCriticalArchiveDays),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Hapus Non Kritis Setelah (hari)</p>
                <Input
                  type="number"
                  min={1}
                  value={errorRetentionSettings.nonCriticalDeleteDays}
                  onChange={(event) =>
                    setErrorRetentionSettings((prev) => ({
                      ...prev,
                      nonCriticalDeleteDays: toPositiveInteger(event.target.value, prev.nonCriticalDeleteDays),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Arsip Kritis Selesai Setelah (hari)</p>
                <Input
                  type="number"
                  min={1}
                  value={errorRetentionSettings.resolvedCriticalArchiveDays}
                  onChange={(event) =>
                    setErrorRetentionSettings((prev) => ({
                      ...prev,
                      resolvedCriticalArchiveDays: toPositiveInteger(event.target.value, prev.resolvedCriticalArchiveDays),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Hapus Kritis Setelah (hari)</p>
                <Input
                  type="number"
                  min={1}
                  value={errorRetentionSettings.criticalDeleteDays}
                  onChange={(event) =>
                    setErrorRetentionSettings((prev) => ({
                      ...prev,
                      criticalDeleteDays: toPositiveInteger(event.target.value, prev.criticalDeleteDays),
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveErrorRetentionSettings()} disabled={isSavingErrorRetentionSettings}>
                {isSavingErrorRetentionSettings ? "Menyimpan..." : "Simpan Retensi"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadErrorRetentionSettings()}
                disabled={isSavingErrorRetentionSettings}
              >
                Muat Ulang Retensi
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-destructive/90">
              Gunakan area ini hanya untuk pembersihan manual.
              <code> Bersihkan Cache Log Browser</code> hanya berdampak pada browser ini,
              sedangkan <code> Purge Log Terpusat</code> menghapus data di tabel <code>client_error_logs</code> pada Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-destructive/30 bg-background/80 p-3 text-xs text-muted-foreground">
              Rekomendasi: mulai dari <strong>Retensi Sekarang</strong> atau scope <strong>Arsip + Selesai</strong>.
              Gunakan scope <strong>Semua Log</strong> hanya saat reset penuh atau insiden storage yang sudah disetujui.
            </div>
            <div className="flex flex-wrap gap-2">
              {isCurrentUserSuperAdmin ? (
                <Button variant="destructive" onClick={openCentralizedPurgeDialog} disabled={isRunningCentralizedPurge}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isRunningCentralizedPurge ? "Memproses Purge..." : "Kelola Purge Log Terpusat"}
                </Button>
              ) : null}
              <Button variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Bersihkan Cache Log Browser
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              Alert Realtime Kritis
            </CardTitle>
            <CardDescription>
              Simpan endpoint webhook untuk notifikasi realtime error kritis (webhook umum, Slack, WhatsApp, Email).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Aktifkan alert realtime kritis</p>
                <p className="text-xs text-muted-foreground">
                  Saat aktif, setiap log kritis baru akan mengirim notifikasi ke endpoint yang terisi.
                </p>
              </div>
              <Switch
                checked={alertSettings.enableRealtimeAlerts}
                onCheckedChange={(checked) => setAlertSettings((prev) => ({ ...prev, enableRealtimeAlerts: checked }))}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Input
                value={alertSettings.webhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, webhookUrl: event.target.value }))}
                placeholder="Webhook Umum (https://...)"
              />
              <Input
                value={alertSettings.slackWebhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, slackWebhookUrl: event.target.value }))}
                placeholder="Slack Webhook (https://...)"
              />
              <Input
                value={alertSettings.whatsappWebhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, whatsappWebhookUrl: event.target.value }))}
                placeholder="WhatsApp Webhook (https://...)"
              />
              <Input
                value={alertSettings.emailWebhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, emailWebhookUrl: event.target.value }))}
                placeholder="Email Webhook (https://...)"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveAlertSettings()} disabled={isSavingAlertSettings}>
                {isSavingAlertSettings ? "Menyimpan..." : "Simpan Pengaturan Alert"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void loadAlertSettings()} disabled={isSavingAlertSettings}>
                Muat Ulang Pengaturan
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Error</CardTitle>
            <CardDescription>
              {tabbedEntries.length} error tercatat • Sumber: {dataSourceLabel}
            </CardDescription>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Rentang: {selectedWindowLabel}</Badge>
              <Badge className="border-red-300 bg-red-50 text-red-700">Kritis: {headerWindowCounts.criticalOpen}</Badge>
              <Badge className="border-amber-300 bg-amber-50 text-amber-700">Non Kritis: {headerWindowCounts.nonCritical}</Badge>
              <Badge className="border-blue-300 bg-blue-50 text-blue-700">Selesai: {headerWindowCounts.criticalResolved}</Badge>
              <Badge className="border-slate-300 bg-slate-100 text-slate-700">Arsip Kritis: {headerWindowCounts.criticalArchived}</Badge>
              <Badge className="border-zinc-300 bg-zinc-100 text-zinc-700">Arsip Non Kritis: {headerWindowCounts.nonCriticalArchived}</Badge>
              <Badge variant="secondary">Total: {headerWindowCounts.total}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SeverityTab)}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="min-w-max h-auto flex-nowrap gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                  <TabsTrigger value="critical" className="whitespace-nowrap">
                    Kritis ({criticalEntries.length})
                  </TabsTrigger>
                  <TabsTrigger value="non_critical" className="whitespace-nowrap">
                    Non Kritis ({nonCriticalEntries.length})
                  </TabsTrigger>
                  <TabsTrigger value="resolved_critical" className="whitespace-nowrap">
                    Selesai ({resolvedCriticalEntries.length})
                  </TabsTrigger>
                  <TabsTrigger value="archived_critical" className="whitespace-nowrap">
                    Arsip Kritis ({archivedCriticalEntries.length})
                  </TabsTrigger>
                  <TabsTrigger value="archived_non_critical" className="whitespace-nowrap">
                    Arsip Non Kritis ({archivedNonCriticalEntries.length})
                  </TabsTrigger>
                </TabsList>
              </div>
            </Tabs>

            {(activeTab === "critical" ||
              activeTab === "non_critical" ||
              activeTab === "resolved_critical" ||
              activeTab === "archived_critical" ||
              activeTab === "archived_non_critical") && (
              <div className="flex justify-end">
                {activeTab === "critical" ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleBulkSetNonCritical(true)}
                      disabled={isBulkClassifying || isBulkArchiving || paginatedEntries.length === 0}
                    >
                      Tandai Halaman Ini Non Kritis
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBulkResolveConfirmDialog}
                      disabled={
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkResolving ||
                        isBulkReopening ||
                        paginatedEntries.length === 0
                      }
                    >
                      Tandai Halaman Ini Selesai
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBulkArchiveConfirmDialog}
                      disabled={
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkResolving ||
                        isBulkReopening ||
                        paginatedEntries.length === 0
                      }
                    >
                      Arsipkan Halaman Ini
                    </Button>
                  </div>
                ) : activeTab === "non_critical" ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleBulkSetNonCritical(false)}
                      disabled={
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkUnarchiving ||
                        isBulkResolving ||
                        isBulkReopening ||
                        paginatedEntries.length === 0
                      }
                    >
                      Tandai Halaman Ini Kritis
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBulkArchiveConfirmDialog}
                      disabled={
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkUnarchiving ||
                        isBulkResolving ||
                        isBulkReopening ||
                        paginatedEntries.length === 0
                      }
                    >
                      Arsipkan Halaman Ini
                    </Button>
                  </div>
                ) : activeTab === "resolved_critical" ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBulkReopenConfirmDialog}
                      disabled={
                        isBulkReopening ||
                        isBulkResolving ||
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkUnarchiving ||
                        paginatedEntries.length === 0
                      }
                    >
                      Buka Lagi Halaman Ini
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBulkArchiveConfirmDialog}
                      disabled={
                        isBulkReopening ||
                        isBulkResolving ||
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkUnarchiving ||
                        paginatedEntries.length === 0
                      }
                    >
                      Arsipkan Halaman Ini
                    </Button>
                  </div>
                ) : activeTab === "archived_critical" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openBulkUnarchiveConfirmDialog}
                    disabled={
                      isBulkUnarchiving ||
                      isBulkClassifying ||
                      isBulkArchiving ||
                      isBulkResolving ||
                      isBulkReopening ||
                      paginatedEntries.length === 0
                    }
                  >
                    Pulihkan Halaman Ini
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleBulkSetNonCritical(false)}
                      disabled={
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkUnarchiving ||
                        isBulkResolving ||
                        isBulkReopening ||
                        paginatedEntries.length === 0
                      }
                    >
                      Tandai Halaman Ini Kritis
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBulkUnarchiveConfirmDialog}
                      disabled={
                        isBulkUnarchiving ||
                        isBulkClassifying ||
                        isBulkArchiving ||
                        isBulkResolving ||
                        isBulkReopening ||
                        paginatedEntries.length === 0
                      }
                    >
                      Pulihkan Halaman Ini
                    </Button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "non_critical" && nonCriticalEntries.length > NON_CRITICAL_MAX_VISIBLE && (
              <p className="text-xs text-muted-foreground">
                Menampilkan {NON_CRITICAL_MAX_VISIBLE} data non-kritis terbaru dari {nonCriticalEntries.length} total.
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Cari berdasarkan Ref, context, pesan, atau route..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Select value={selectedContext} onValueChange={setSelectedContext}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter konteks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Konteks</SelectItem>
                  {contextOptions.map((context) => (
                    <SelectItem key={context} value={context}>
                      {context}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedWindow} onValueChange={(value) => setSelectedWindow(value as TimeWindow)}>
                <SelectTrigger>
                  <SelectValue placeholder="Rentang waktu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 Jam</SelectItem>
                  <SelectItem value="7d">7 Hari</SelectItem>
                  <SelectItem value="30d">30 Hari</SelectItem>
                  <SelectItem value="all">Semua Waktu</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={handleResetAllFilters}>
                Reset Semua Filter
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Select value={ownershipFilter} onValueChange={(value) => setOwnershipFilter(value as OwnershipFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pemilik log" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Pengguna</SelectItem>
                  <SelectItem value="mine">Hanya Saya</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tenantScopeFilter} onValueChange={(value) => setTenantScopeFilter(value as TenantScopeFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Scope tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_tenants">Semua Tenant</SelectItem>
                  <SelectItem value="my_tenant">Tenant Saya</SelectItem>
                  <SelectItem value="no_tenant">Tanpa Tenant</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground rounded-md border px-3 py-2">
                Filter cepat: <strong>Hanya Saya</strong>, <strong>Semua/Tenant Saya</strong>, dan konteks.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Auto-refresh hanya aktif pada tab Kritis untuk memantau error baru setiap 15 detik.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Auto-refresh Kritis (15 dtk)</span>
                <Switch
                  checked={autoRefreshCritical}
                  onCheckedChange={setAutoRefreshCritical}
                  disabled={activeTab !== "critical"}
                />
              </div>
            </div>

            {selectedWindow !== "all" &&
              (activeTab === "resolved_critical" ||
                activeTab === "archived_critical" ||
                activeTab === "archived_non_critical") && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Filter waktu aktif ({selectedWindow.toUpperCase()}). Data tab Selesai/Arsip di luar rentang ini
                tidak ditampilkan.
                <Button
                  type="button"
                  variant="link"
                  className="ml-1 h-auto p-0 text-xs text-amber-900 underline"
                  onClick={() => setSelectedWindow("all")}
                >
                  Tampilkan semua waktu
                </Button>
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref Error</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Konteks</TableHead>
                    <TableHead>Pesan</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <TableRow key={`loading-row-${idx}`}>
                        <TableCell colSpan={6}>
                          <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : paginatedEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Belum ada log error.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {entry.id}
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => void handleCopyRef(entry.id)}
                              title="Copy ref error"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(entry.timestamp), "dd MMM yyyy HH:mm:ss", { locale: id })}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.context}</TableCell>
                        <TableCell className="max-w-[380px] truncate" title={entry.message}>
                          {entry.message}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.route || "-"}</TableCell>
                        <TableCell className="text-right">{renderRowActions(entry)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Menampilkan {tabbedEntries.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, tabbedEntries.length)} dari {tabbedEntries.length} data
              </div>
              <div className="flex items-center gap-3">
                <Select value={String(itemsPerPage)} onValueChange={(value) => setItemsPerPage(Number(value))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / halaman</SelectItem>
                    <SelectItem value="50">50 / halaman</SelectItem>
                    <SelectItem value="100">100 / halaman</SelectItem>
                  </SelectContent>
                </Select>

                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (safePage > 1) setCurrentPage(safePage - 1);
                        }}
                        className={safePage <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, index) => index + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - safePage) <= 1)
                      .map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            isActive={page === safePage}
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
                          if (safePage < totalPages) setCurrentPage(safePage + 1);
                        }}
                        className={safePage >= totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          </CardContent>
        </Card>

        <PageGlossarySection preset="admin_error_logs" />
      </div>
      <AlertDialog
        open={isBulkDialogOpen}
        onOpenChange={(open) => {
          if (!open) setBulkConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirmDialog?.action === "archive"
                ? activeTab === "non_critical"
                  ? "Arsipkan Log Non Kritis Halaman Ini?"
                  : "Arsipkan Log Kritis Halaman Ini?"
                : bulkConfirmDialog?.action === "unarchive"
                  ? activeTab === "archived_non_critical"
                    ? "Pulihkan Arsip Non Kritis Halaman Ini?"
                    : "Pulihkan Arsip Kritis Halaman Ini?"
                  : bulkConfirmDialog?.action === "resolve"
                    ? "Tandai Log Kritis Selesai?"
                    : "Buka Kembali Log Kritis Selesai?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirmDialog?.action === "archive"
                ? activeTab === "non_critical"
                  ? `Sebanyak ${bulkConfirmDialog.count} log non-kritis pada halaman ini akan dipindahkan ke arsip.`
                  : `Sebanyak ${bulkConfirmDialog.count} log kritis pada halaman ini akan dipindahkan ke arsip.`
                : bulkConfirmDialog?.action === "unarchive"
                  ? activeTab === "archived_non_critical"
                    ? `Sebanyak ${bulkConfirmDialog?.count ?? 0} arsip non-kritis pada halaman ini akan dipulihkan ke daftar non-kritis.`
                    : `Sebanyak ${bulkConfirmDialog?.count ?? 0} arsip kritis pada halaman ini akan dipulihkan ke daftar kritis.`
                  : bulkConfirmDialog?.action === "resolve"
                    ? `Sebanyak ${bulkConfirmDialog?.count ?? 0} log kritis pada halaman ini akan ditandai selesai.`
                    : `Sebanyak ${bulkConfirmDialog?.count ?? 0} log selesai pada halaman ini akan dibuka kembali.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>
              Tindakan massal hanya berlaku untuk data pada halaman ini.
            </DialogActionHint>
            <AlertDialogCancel className="bg-white">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmBulkDialog();
              }}
              disabled={isBulkArchiving || isBulkUnarchiving || isBulkResolving || isBulkReopening}
            >
              {bulkConfirmDialog?.action === "archive"
                ? "Ya, Arsipkan"
                : bulkConfirmDialog?.action === "unarchive"
                  ? "Ya, Pulihkan"
                  : bulkConfirmDialog?.action === "resolve"
                    ? "Ya, Tandai Selesai"
                    : "Ya, Buka Lagi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={isCentralizedPurgeDialogOpen}
        onOpenChange={(open) => {
          if (isRunningCentralizedPurge) return;
          setIsCentralizedPurgeDialogOpen(open);
          if (!open) {
            setCentralizedPurgeSlideValue([0]);
            setCentralizedPurgePreviewCount(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isCentralizedPurgeAllScope ? "Purge Semua Log Terpusat?" : "Purge Log Terpusat?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini menghapus log pada tabel <code>client_error_logs</code> sesuai scope yang dipilih.
              Gunakan hanya saat pembersihan terjadwal atau insiden biaya storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Scope purge</p>
              <Select
                value={centralizedPurgeScope}
                onValueChange={(value) => {
                  setCentralizedPurgeScope(normalizeCentralizedPurgeScope(value));
                  setCentralizedPurgeSlideValue([0]);
                }}
                disabled={isRunningCentralizedPurge}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih scope purge" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="archived_or_resolved">Arsip + Selesai (Rekomendasi)</SelectItem>
                  <SelectItem value="non_critical">Semua Non Kritis</SelectItem>
                  <SelectItem value="all">Semua Log (termasuk kritis aktif)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Geser verifikasi ke kanan sampai penuh untuk mengaktifkan tombol purge.
              </p>
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Mulai dari kiri</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-700 shadow-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Target kanan
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-300/80 bg-slate-100/90 px-4 py-4">
                  <div className="pointer-events-none absolute inset-y-3 left-3 right-3 rounded-[18px] border border-dashed border-slate-300/80" />
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.7),transparent_38%),radial-gradient(circle_at_80%_50%,rgba(16,185,129,0.12),transparent_30%)]" />
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                    <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/95 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                      Match
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center">
                    <span
                      className="text-sm font-medium tracking-[0.02em] text-slate-500 transition-opacity duration-200"
                      style={{ opacity: isCentralizedPurgeConfirmationValid ? 0.35 : Math.max(0.18, 1 - centralizedPurgeSlideProgress / 90) }}
                    >
                      Geser ke kanan untuk verifikasi purge
                    </span>
                  </div>
                  <Slider
                    value={centralizedPurgeSlideValue}
                    min={0}
                    max={CENTRALIZED_PURGE_SLIDE_MAX}
                    step={1}
                    disabled={isRunningCentralizedPurge}
                    aria-label="Geser untuk konfirmasi purge log terpusat"
                    onValueChange={(value) => {
                      const nextValue = value[0] ?? 0;
                      setCentralizedPurgeSlideValue([
                        nextValue >= CENTRALIZED_PURGE_SLIDE_ARM_THRESHOLD ? CENTRALIZED_PURGE_SLIDE_MAX : nextValue,
                      ]);
                    }}
                    onValueCommit={(value) => {
                      const nextValue = value[0] ?? 0;
                      setCentralizedPurgeSlideValue([
                        nextValue >= CENTRALIZED_PURGE_SLIDE_ARM_THRESHOLD ? CENTRALIZED_PURGE_SLIDE_MAX : 0,
                      ]);
                    }}
                    className="py-3"
                    trackClassName="h-16 rounded-[20px] border border-slate-300/80 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-50 shadow-inner"
                    rangeClassName="bg-gradient-to-r from-amber-100 via-slate-200 to-emerald-200"
                    thumbClassName="flex h-12 w-14 items-center justify-center rounded-2xl border-slate-400 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.18)]"
                    thumbContent={<ChevronRight className="h-5 w-5 text-slate-600" />}
                  />
                </div>
                <div className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs">
                  {isCentralizedPurgeConfirmationValid ? (
                    <span className="font-medium text-emerald-700">Verifikasi siap. Tombol purge sudah aktif.</span>
                  ) : (
                    <span className="text-muted-foreground">Belum aktif. Geser sampai ujung kanan lalu lepaskan.</span>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Scope aktif: {CENTRALIZED_PURGE_SCOPE_LABEL[centralizedPurgeScope]}.
            </div>
            {isCentralizedPurgeAllScope ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Scope <strong>Semua Log</strong> akan menghapus seluruh data, termasuk log kritis aktif yang belum diarsipkan atau belum ditandai selesai.
                Pastikan export sudah dilakukan jika data masih diperlukan untuk audit atau investigasi.
              </div>
            ) : null}
            <div className="rounded-md border border-blue-300/70 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {isLoadingCentralizedPurgePreview
                ? "Menghitung kandidat purge..."
                : centralizedPurgePreviewCount === null
                  ? "Pratinjau purge belum tersedia."
                  : `Pratinjau: ${centralizedPurgePreviewCount} entri akan terhapus pada scope ini.`}
            </div>
          </div>
          <AlertDialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>
              Purge tidak dapat dibatalkan. Pastikan export sudah dilakukan jika data perlu arsip eksternal.
            </DialogActionHint>
            <AlertDialogCancel className="bg-white" disabled={isRunningCentralizedPurge}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmCentralizedPurge();
              }}
              disabled={!isCentralizedPurgeConfirmationValid || isRunningCentralizedPurge}
            >
              {isRunningCentralizedPurge
                ? "Memproses..."
                : isCentralizedPurgeAllScope
                  ? "Ya, Hapus Semua Log Terpusat"
                  : "Ya, Purge Terpusat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={Boolean(selectedDetailEntry)} onOpenChange={(open) => !open && setSelectedDetailEntry(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Rincian Log Error</DialogTitle>
            <DialogDescription>
              Rincian teknis untuk triase insiden berdasarkan Ref Error.
            </DialogDescription>
          </DialogHeader>
          {selectedDetailEntry ? (
            <div className="space-y-3 text-sm">
              {getTopupRequestIdFromEntry(selectedDetailEntry) ? (
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => openTopupRequest(selectedDetailEntry)}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Buka Request Topup
                  </Button>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div><span className="text-muted-foreground">Ref:</span> <code>{selectedDetailEntry.id}</code></div>
                <div><span className="text-muted-foreground">Waktu:</span> {format(new Date(selectedDetailEntry.timestamp), "dd MMM yyyy HH:mm:ss", { locale: id })}</div>
                <div><span className="text-muted-foreground">Konteks:</span> <code>{selectedDetailEntry.context}</code></div>
                <div><span className="text-muted-foreground">Route:</span> <code>{selectedDetailEntry.route || "-"}</code></div>
                <div><span className="text-muted-foreground">User ID:</span> <code>{selectedDetailEntry.userId || "-"}</code></div>
                <div><span className="text-muted-foreground">Tenant ID:</span> <code>{selectedDetailEntry.tenantId || "-"}</code></div>
                <div><span className="text-muted-foreground">Sumber:</span> <code>{selectedDetailEntry.source || "-"}</code></div>
                <div><span className="text-muted-foreground">Status:</span> {isNonCriticalEntry(selectedDetailEntry) ? "Non Kritis" : "Kritis"}{selectedDetailEntry.isResolved ? " • Selesai" : ""}{selectedDetailEntry.isArchived ? " • Arsip" : ""}</div>
              </div>
              <div className="rounded-md border p-3">
                <p className="mb-1 text-xs text-muted-foreground">Pesan</p>
                <pre className="whitespace-pre-wrap break-words text-xs">{selectedDetailEntry.message}</pre>
              </div>
              {selectedDetailEntry.stack ? (
                <div className="rounded-md border p-3">
                  <p className="mb-1 text-xs text-muted-foreground">Stack</p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{selectedDetailEntry.stack}</pre>
                </div>
              ) : null}
              <div className="rounded-md border p-3">
                <p className="mb-1 text-xs text-muted-foreground">Metadata</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(selectedDetailEntry.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}
