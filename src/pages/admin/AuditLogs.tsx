import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  FileText, 
  Search,
  UserPlus,
  Settings,
  XCircle,
  Activity,
  Calendar,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { id } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { toast } from "sonner";
import {
  clearRpcUnavailableMark,
  executeRpcWithAvailability,
  isRpcMissingFunctionError,
} from "@/lib/rpcAvailability";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface AuditLog {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  employee: {
    name: string;
    email: string;
  } | null;
  tenant: {
    name: string;
  } | null;
}

interface TenantOption {
  id: string;
  name: string;
  code: string | null;
}

interface OrgActivityLoggingPolicy {
  retentionDays: number;
  defaultOrgLoggingEnabled: boolean;
  tenantOverrides: Record<string, boolean>;
}

interface MatchingActivityMonth {
  value: string;
  label: string;
}

interface MatchingActivityMonthRpcRow {
  month_value: string;
  latest_created_at: string;
}

interface AuditActivityPolicySummaryRpcRow {
  setting_id: string | null;
  policy: Record<string, unknown> | null;
  effective_retention_days: number | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface SaveAuditActivityPolicyRpcRow extends AuditActivityPolicySummaryRpcRow {
  audit_id: string | null;
}

const actionIcons: Record<string, typeof Activity> = {
  INSERT: UserPlus,
  UPDATE: Settings,
  DELETE: XCircle,
};

const actionLabels: Record<string, { label: string; color: string }> = {
  INSERT: { label: "Create", color: "bg-green-500" },
  UPDATE: { label: "Update", color: "bg-blue-500" },
  DELETE: { label: "Delete", color: "bg-red-500" },
};

const tableLabels: Record<string, string> = {
  system_settings: "Pengaturan Sistem",
  tenants: "Organisasi",
  employees: "Pegawai",
  subscriptions: "Langganan",
  leave_requests: "Pengajuan Cuti",
  attendance_records: "Absensi",
  attendance_records_partitioned: "Absensi",
  offices: "Kantor",
  holidays: "Hari Libur",
  user_roles: "Peran Pengguna",
  work_hours: "Jam Kerja",
  opd: "OPD",
  work_units: "Satuan Kerja",
};

const ITEMS_PER_PAGE = 20;
const AUDIT_LOGS_QUERY_TIMEOUT_MS = 12000;
const AUDIT_LOGS_QUERY_RETRY_MAX = 2;
const AUDIT_ACTIVITY_POLICY_KEY = "audit_logs_activity_policy";
const AUDIT_RETENTION_RPC_NAME = "get_audit_logs_retention_days";
const AUDIT_ACTIVITY_MONTHS_RPC_NAME = "get_audit_log_activity_months";
const AUDIT_ACTIVITY_POLICY_SUMMARY_RPC_NAME = "get_audit_activity_policy_summary";
const SAVE_AUDIT_ACTIVITY_POLICY_RPC_NAME = "save_audit_activity_policy";
const ALL_ORGANIZATIONS_OVERRIDE_VALUE = "all_organizations";
const RECENT_MATCHING_ACTIVITY_LIMIT = 24;
const DEFAULT_AUDIT_ACTIVITY_POLICY: OrgActivityLoggingPolicy = {
  retentionDays: 60,
  defaultOrgLoggingEnabled: true,
  tenantOverrides: {},
};

const toPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(1, parsed);
  }
  return fallback;
};

const normalizeOrgActivityLoggingPolicy = (value: unknown): OrgActivityLoggingPolicy => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_AUDIT_ACTIVITY_POLICY;
  }
  const raw = value as Record<string, unknown>;
  const overridesRaw =
    raw.tenant_overrides && typeof raw.tenant_overrides === "object" && !Array.isArray(raw.tenant_overrides)
      ? (raw.tenant_overrides as Record<string, unknown>)
      : {};
  const tenantOverrides: Record<string, boolean> = {};
  for (const [tenantId, flag] of Object.entries(overridesRaw)) {
    if (typeof flag === "boolean") {
      tenantOverrides[tenantId] = flag;
    }
  }
  return {
    retentionDays: toPositiveInteger(raw.retention_days, DEFAULT_AUDIT_ACTIVITY_POLICY.retentionDays),
    defaultOrgLoggingEnabled:
      typeof raw.default_org_logging_enabled === "boolean"
        ? raw.default_org_logging_enabled
        : DEFAULT_AUDIT_ACTIVITY_POLICY.defaultOrgLoggingEnabled,
    tenantOverrides,
  };
};

const serializeOrgActivityLoggingPolicy = (value: OrgActivityLoggingPolicy) => ({
  retention_days: Math.max(1, value.retentionDays),
  default_org_logging_enabled: value.defaultOrgLoggingEnabled,
  tenant_overrides: value.tenantOverrides,
});

// Buat opsi bulan untuk 12 bulan terakhir
const getMonthOptions = () => {
  const options = [];
  for (let i = 0; i < 12; i++) {
    const date = subMonths(new Date(), i);
    options.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy", { locale: id }),
    });
  }
  return options;
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [tableFilter, setTableFilter] = useState("all");
  const [activeQuickFilter, setActiveQuickFilter] = useState<"none" | "faq_sync">("none");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [latestMatchingActivityAt, setLatestMatchingActivityAt] = useState<string | null>(null);
  const [matchingActivityMonths, setMatchingActivityMonths] = useState<MatchingActivityMonth[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSavingActivityPolicy, setIsSavingActivityPolicy] = useState(false);
  const [isRunningActivityCleanup, setIsRunningActivityCleanup] = useState(false);
  const [activityPolicy, setActivityPolicy] = useState<OrgActivityLoggingPolicy>(DEFAULT_AUDIT_ACTIVITY_POLICY);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [selectedTenantOverrideId, setSelectedTenantOverrideId] = useState("none");
  const [selectedTenantOverrideEnabled, setSelectedTenantOverrideEnabled] = useState(false);
  const [serverRetentionDays, setServerRetentionDays] = useState<number | null>(null);
  const [serverRetentionStatus, setServerRetentionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [serverRetentionError, setServerRetentionError] = useState<string | null>(null);

  const monthOptions = getMonthOptions();

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      // Parse month filter
      const [year, month] = monthFilter.split("-").map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      const escapedQuery = searchQuery.trim().replace(/[%_]/g, "\\$&");
      const isUuidQuery = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        escapedQuery
      );
      const searchParts = [
        `action.ilike.%${escapedQuery}%`,
        `table_name.ilike.%${escapedQuery}%`,
        `ip_address.ilike.%${escapedQuery}%`,
      ];
      if (isUuidQuery) {
        searchParts.push(`record_id.eq.${escapedQuery}`);
      }

      const buildCountQuery = () => {
        let countQuery = supabase
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        if (actionFilter !== "all") {
          countQuery = countQuery.eq("action", actionFilter);
        }

        if (tableFilter !== "all") {
          countQuery = countQuery.eq("table_name", tableFilter);
        }

        if (escapedQuery) {
          countQuery = countQuery.or(searchParts.join(","));
        }

        return countQuery;
      };

      const buildRecentMatchingQuery = () => {
        let recentQuery = supabase
          .from("audit_logs")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(RECENT_MATCHING_ACTIVITY_LIMIT);

        if (actionFilter !== "all") {
          recentQuery = recentQuery.eq("action", actionFilter);
        }

        if (tableFilter !== "all") {
          recentQuery = recentQuery.eq("table_name", tableFilter);
        }

        if (escapedQuery) {
          recentQuery = recentQuery.or(searchParts.join(","));
        }

        return recentQuery;
      };

      const mapMatchingMonths = (
        rows: Array<{ created_at?: string | null } | MatchingActivityMonthRpcRow>,
      ): MatchingActivityMonth[] => {
        const monthMap = new Map<string, MatchingActivityMonth>();
        for (const row of rows) {
          const createdAt =
            "latest_created_at" in row
              ? row.latest_created_at
              : typeof row.created_at === "string"
                ? row.created_at
                : null;
          if (!createdAt) continue;
          const rowDate = new Date(createdAt);
          const monthValue = "month_value" in row ? row.month_value : format(rowDate, "yyyy-MM");
          if (!monthMap.has(monthValue)) {
            monthMap.set(monthValue, {
              value: monthValue,
              label: format(rowDate, "MMMM yyyy", { locale: id }),
            });
          }
          if (monthMap.size >= 4) break;
        }
        return Array.from(monthMap.values());
      };

      const { count, error: countError } = await withExponentialBackoff(
        () =>
          withTimeout(
            buildCountQuery(),
            AUDIT_LOGS_QUERY_TIMEOUT_MS,
            "admin.audit_logs.fetch.count timeout"
          ),
        {
          maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (countError) throw countError;

      const safeCount = count || 0;
      setTotalCount(safeCount);

      const { data: matchingMonthsData, error: matchingMonthsError } = await executeRpcWithAvailability<MatchingActivityMonthRpcRow[]>(
        AUDIT_ACTIVITY_MONTHS_RPC_NAME,
        () =>
          withExponentialBackoff(
            () =>
              withTimeout(
                supabase.rpc(AUDIT_ACTIVITY_MONTHS_RPC_NAME as never, {
                  p_action: actionFilter === "all" ? null : actionFilter,
                  p_table_name: tableFilter === "all" ? null : tableFilter,
                  p_search: escapedQuery || null,
                  p_limit: 4,
                } as never),
                AUDIT_LOGS_QUERY_TIMEOUT_MS,
                "admin.audit_logs.fetch.activity_months timeout"
              ),
            {
              maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          ) as Promise<{ data: MatchingActivityMonthRpcRow[] | null; error: unknown | null }>,
      );
      if (matchingMonthsError) {
        if (!isRpcMissingFunctionError(matchingMonthsError)) throw matchingMonthsError;
        const { data: recentMatchingData, error: recentMatchingError } = await withExponentialBackoff(
          () =>
            withTimeout(
              buildRecentMatchingQuery(),
              AUDIT_LOGS_QUERY_TIMEOUT_MS,
              "admin.audit_logs.fetch.recent_matching timeout"
            ),
          {
            maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (recentMatchingError) throw recentMatchingError;

        const fallbackRows = (Array.isArray(recentMatchingData) ? recentMatchingData : []) as Array<{ created_at?: string | null }>;
        setMatchingActivityMonths(mapMatchingMonths(fallbackRows));
        const latestFallbackRow = fallbackRows[0];
        setLatestMatchingActivityAt(
          latestFallbackRow && typeof latestFallbackRow.created_at === "string" ? latestFallbackRow.created_at : null
        );
      } else {
        const rpcRows = (Array.isArray(matchingMonthsData) ? matchingMonthsData : []) as MatchingActivityMonthRpcRow[];
        setMatchingActivityMonths(mapMatchingMonths(rpcRows));
        setLatestMatchingActivityAt(rpcRows[0]?.latest_created_at ?? null);
      }

      // Fetch paginated data
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const buildDataQuery = () => {
        let dataQuery = supabase
          .from("audit_logs")
          .select(`
            *,
            employee:employees!audit_logs_employee_id_fkey(name, email),
            tenant:tenants!audit_logs_tenant_id_fkey(name)
          `)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString())
          .order("created_at", { ascending: false })
          .range(from, to);

        if (actionFilter !== "all") {
          dataQuery = dataQuery.eq("action", actionFilter);
        }

        if (tableFilter !== "all") {
          dataQuery = dataQuery.eq("table_name", tableFilter);
        }

        if (escapedQuery) {
          dataQuery = dataQuery.or(searchParts.join(","));
        }

        return dataQuery;
      };

      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            buildDataQuery(),
            AUDIT_LOGS_QUERY_TIMEOUT_MS,
            "admin.audit_logs.fetch.data timeout"
          ),
        {
          maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setLogs((data as unknown as AuditLog[]) || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.audit_logs.fetch", {
        month_filter: monthFilter,
        action_filter: actionFilter,
        table_filter: tableFilter,
        search: searchQuery,
        page: currentPage,
      });
      const message = appendErrorReference("Gagal memuat audit log", errorRef);
      toast.error(message);
      setLoadError(message);
      setLogs([]);
      setTotalCount(0);
      setLatestMatchingActivityAt(null);
      setMatchingActivityMonths([]);
    } finally {
      setIsLoading(false);
    }
  }, [monthFilter, currentPage, actionFilter, tableFilter, searchQuery]);

  const loadActivityPolicy = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("system_settings").select("value").eq("key", AUDIT_ACTIVITY_POLICY_KEY).maybeSingle(),
            AUDIT_LOGS_QUERY_TIMEOUT_MS,
            "admin.audit_logs.activity_policy.fetch timeout",
          ),
        {
          maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      setActivityPolicy(normalizeOrgActivityLoggingPolicy(data?.value));
    } catch (error) {
      const errorRef = reportError(error, "admin.audit_logs.activity_policy.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan log aktivitas", errorRef));
      setActivityPolicy(DEFAULT_AUDIT_ACTIVITY_POLICY);
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
            supabase.from("tenants").select("id, name, code").order("name", { ascending: true }),
            AUDIT_LOGS_QUERY_TIMEOUT_MS,
            "admin.audit_logs.tenants.fetch timeout",
          ),
        {
          maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      setTenantOptions((data || []) as TenantOption[]);
    } catch (error) {
      const errorRef = reportError(error, "admin.audit_logs.tenants.fetch");
      toast.error(appendErrorReference("Gagal memuat daftar organisasi", errorRef));
      setTenantOptions([]);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const applyActivityPolicySummary = useCallback(
    (row: AuditActivityPolicySummaryRpcRow | null, options?: { silent?: boolean }) => {
      setActivityPolicy(normalizeOrgActivityLoggingPolicy(row?.policy));

      const parsedRetention = Number(row?.effective_retention_days);
      if (Number.isFinite(parsedRetention) && parsedRetention > 0) {
        setServerRetentionDays(Math.floor(parsedRetention));
        setServerRetentionStatus("ready");
        setServerRetentionError(null);
        clearRpcUnavailableMark(AUDIT_RETENTION_RPC_NAME);
      } else {
        setServerRetentionDays(null);
        setServerRetentionStatus("error");
        setServerRetentionError("Retensi efektif server belum bisa diverifikasi.");
      }

      if (!options?.silent && !Number.isFinite(parsedRetention)) {
        setServerRetentionStatus("error");
      }
    },
    [],
  );

  const loadActivityPolicySummary = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setServerRetentionStatus("loading");
    }
    setServerRetentionError(null);
    try {
      setIsRetrying(false);
      const { data, error } = await executeRpcWithAvailability<AuditActivityPolicySummaryRpcRow[]>(
        AUDIT_ACTIVITY_POLICY_SUMMARY_RPC_NAME,
        () => withExponentialBackoff(
          () =>
            withTimeout(
              supabase.rpc(AUDIT_ACTIVITY_POLICY_SUMMARY_RPC_NAME as never),
              AUDIT_LOGS_QUERY_TIMEOUT_MS,
              "admin.audit_logs.activity_policy.summary timeout",
            ),
          {
            maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ) as Promise<{
          data: AuditActivityPolicySummaryRpcRow[] | null;
          error: unknown | null;
        }>,
      );
      const typedData = data as AuditActivityPolicySummaryRpcRow[] | null;
      const typedError = error as unknown | null;
      if (typedError) throw typedError;
      const summaryRow = Array.isArray(typedData) ? (typedData[0] ?? null) : null;
      applyActivityPolicySummary(summaryRow, options);
      return true;
    } catch (error) {
      if (isRpcMissingFunctionError(error)) {
        return false;
      }
      const errorRef = reportError(error, "admin.audit_logs.activity_policy.summary");
      toast.error(appendErrorReference("Gagal memuat ringkasan pengaturan log aktivitas", errorRef));
      setActivityPolicy(DEFAULT_AUDIT_ACTIVITY_POLICY);
      setServerRetentionDays(null);
      setServerRetentionStatus("error");
      setServerRetentionError(appendErrorReference("Retensi efektif server belum bisa diverifikasi.", errorRef));
      return true;
    } finally {
      setIsRetrying(false);
    }
  }, [applyActivityPolicySummary]);

  const loadEffectiveServerRetentionDays = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setServerRetentionStatus("loading");
    }
    setServerRetentionError(null);
    try {
      setIsRetrying(false);
      const { data, error } = await executeRpcWithAvailability<number>(
        AUDIT_RETENTION_RPC_NAME,
        () => withExponentialBackoff(
          () =>
            withTimeout(
              supabase.rpc(AUDIT_RETENTION_RPC_NAME as never),
              AUDIT_LOGS_QUERY_TIMEOUT_MS,
              "admin.audit_logs.server_retention.fetch timeout",
            ),
          {
            maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ) as Promise<{
          data: number | null;
          error: unknown | null;
        }>,
      );
      if (error) throw error;
      const parsed = Number(data);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Nilai retensi server tidak valid.");
      }
      clearRpcUnavailableMark(AUDIT_RETENTION_RPC_NAME);
      setServerRetentionDays(Math.floor(parsed));
      setServerRetentionStatus("ready");
    } catch (error) {
      if (isRpcMissingFunctionError(error)) {
        setServerRetentionDays(null);
        setServerRetentionStatus("error");
        setServerRetentionError("Fungsi retensi server belum tersedia. Pastikan migrasi terbaru sudah diterapkan.");
        return;
      }
      const rawMessage = error instanceof Error ? error.message : "";
      const errorRef = reportError(error, "admin.audit_logs.server_retention.fetch");
      const friendlyMessage = rawMessage.toLowerCase().includes("get_audit_logs_retention_days")
        ? "Fungsi retensi server belum tersedia. Pastikan migrasi terbaru sudah diterapkan."
        : "Retensi efektif server belum bisa diverifikasi.";
      setServerRetentionDays(null);
      setServerRetentionStatus("error");
      setServerRetentionError(appendErrorReference(friendlyMessage, errorRef));
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const saveActivityPolicy = useCallback(async () => {
    setIsSavingActivityPolicy(true);
    try {
      setIsRetrying(false);
      const { data, error } = await executeRpcWithAvailability<SaveAuditActivityPolicyRpcRow[]>(
        SAVE_AUDIT_ACTIVITY_POLICY_RPC_NAME,
        () => withExponentialBackoff(
          () =>
            withTimeout(
              supabase.rpc(SAVE_AUDIT_ACTIVITY_POLICY_RPC_NAME as never, {
                p_policy: serializeOrgActivityLoggingPolicy(activityPolicy),
              } as never),
              AUDIT_LOGS_QUERY_TIMEOUT_MS,
              "admin.audit_logs.activity_policy.save_rpc timeout",
            ),
          {
            maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ) as Promise<{
          data: SaveAuditActivityPolicyRpcRow[] | null;
          error: unknown | null;
        }>,
      );
      if (error) {
        if (!isRpcMissingFunctionError(error)) throw error;
        const { error: fallbackError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("system_settings").upsert(
                {
                  key: "audit_logs_activity_policy",
                  value: serializeOrgActivityLoggingPolicy(activityPolicy),
                  description:
                    "Kebijakan log aktivitas organisasi: retensi (hari), status logging organisasi bawaan, dan override per tenant.",
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "key" },
              ),
              AUDIT_LOGS_QUERY_TIMEOUT_MS,
              "admin.audit_logs.activity_policy.save timeout",
            ),
          {
            maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (fallbackError) throw fallbackError;
      } else {
        const savedRow = Array.isArray(data) ? (data[0] ?? null) : null;
        applyActivityPolicySummary(savedRow, { silent: true });
      }
      toast.success("Pengaturan log aktivitas berhasil disimpan.");
      const summaryLoaded = await loadActivityPolicySummary({ silent: true });
      if (!summaryLoaded) {
        await loadActivityPolicy();
        await loadEffectiveServerRetentionDays({ silent: true });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.audit_logs.activity_policy.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan log aktivitas", errorRef));
    } finally {
      setIsSavingActivityPolicy(false);
      setIsRetrying(false);
    }
  }, [activityPolicy, applyActivityPolicySummary, loadActivityPolicy, loadActivityPolicySummary, loadEffectiveServerRetentionDays]);

  const runActivityCleanupNow = useCallback(async () => {
    setIsRunningActivityCleanup(true);
    try {
      setIsRetrying(false);
      const { data, error } = (await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("cleanup_old_audit_logs"),
            AUDIT_LOGS_QUERY_TIMEOUT_MS,
            "admin.audit_logs.cleanup.run timeout",
          ),
        {
          maxRetries: AUDIT_LOGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      )) as {
        data: Record<string, unknown> | null;
        error: { message?: string } | null;
      };
      if (error) throw error;
      const deletedCount = Number(data?.deleted_count || 0);
      const rawRetentionDays = Number(data?.retention_days);
      const retentionDays =
        Number.isFinite(rawRetentionDays) && rawRetentionDays > 0 ? Math.floor(rawRetentionDays) : null;
      if (retentionDays) {
        setServerRetentionDays(retentionDays);
        setServerRetentionStatus("ready");
      }
      if (retentionDays && retentionDays !== activityPolicy.retentionDays) {
        toast.warning(
          `Retensi efektif server ${retentionDays} hari, berbeda dari input ${activityPolicy.retentionDays} hari. Pastikan migrasi terbaru sudah diterapkan.`,
        );
      }
      toast.success(
        retentionDays
          ? `Cleanup audit log selesai. ${deletedCount} data dihapus (retensi server ${retentionDays} hari).`
          : `Cleanup audit log selesai. ${deletedCount} data dihapus (retensi server tidak terbaca).`,
      );
      await fetchLogs();
      const summaryLoaded = await loadActivityPolicySummary({ silent: true });
      if (!summaryLoaded) {
        await loadEffectiveServerRetentionDays({ silent: true });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.audit_logs.cleanup.run");
      toast.error(appendErrorReference("Gagal menjalankan cleanup audit log", errorRef));
    } finally {
      setIsRunningActivityCleanup(false);
      setIsRetrying(false);
    }
  }, [activityPolicy.retentionDays, fetchLogs, loadActivityPolicySummary, loadEffectiveServerRetentionDays]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    void loadTenantOptions();
    void (async () => {
      const summaryLoaded = await loadActivityPolicySummary();
      if (!summaryLoaded) {
        await loadActivityPolicy();
        await loadEffectiveServerRetentionDays();
      }
    })();
  }, [loadActivityPolicy, loadActivityPolicySummary, loadTenantOptions, loadEffectiveServerRetentionDays]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, actionFilter, tableFilter, monthFilter]);

  useEffect(() => {
    if (selectedTenantOverrideId === "none") {
      setSelectedTenantOverrideEnabled(activityPolicy.defaultOrgLoggingEnabled);
      return;
    }
    const overrideValue = activityPolicy.tenantOverrides[selectedTenantOverrideId];
    if (typeof overrideValue === "boolean") {
      setSelectedTenantOverrideEnabled(overrideValue);
      return;
    }
    setSelectedTenantOverrideEnabled(activityPolicy.defaultOrgLoggingEnabled);
  }, [activityPolicy.defaultOrgLoggingEnabled, activityPolicy.tenantOverrides, selectedTenantOverrideId]);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const pageStart = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const visiblePages = Array.from({ length: Math.min(3, totalPages) }, (_, idx) => pageStart + idx).filter(
    (page) => page <= totalPages
  );
  const currentMonthLabel = monthOptions.find((m) => m.value === monthFilter)?.label ?? monthFilter;
  const latestMatchingMonthValue = latestMatchingActivityAt ? format(new Date(latestMatchingActivityAt), "yyyy-MM") : null;
  const latestMatchingMonthLabel = latestMatchingActivityAt
    ? format(new Date(latestMatchingActivityAt), "MMMM yyyy", { locale: id })
    : null;
  const suggestedMatchingMonths = matchingActivityMonths.filter((month) => month.value !== monthFilter);
  const shouldSuggestLatestMatchingMonth =
    totalCount === 0 &&
    latestMatchingMonthValue !== null &&
    latestMatchingMonthValue !== monthFilter;
  const isFaqSyncQuickFilterActive = activeQuickFilter === "faq_sync";

  const applyFaqSyncQuickFilter = () => {
    setActiveQuickFilter("faq_sync");
    setActionFilter("UPDATE");
    setTableFilter("system_settings");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const resetQuickFilter = () => {
    setActiveQuickFilter("none");
    setActionFilter("all");
    setTableFilter("all");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const tenantOptionsById = new Map(tenantOptions.map((tenant) => [tenant.id, tenant]));
  const isServerRetentionMismatch =
    serverRetentionStatus === "ready" &&
    serverRetentionDays !== null &&
    serverRetentionDays !== activityPolicy.retentionDays;
  const tenantOverrideRows = Object.entries(activityPolicy.tenantOverrides)
    .map(([tenantId, enabled]) => ({
      tenantId,
      enabled,
      tenant: tenantOptionsById.get(tenantId) || null,
    }))
    .sort((a, b) => {
      const nameA = a.tenant?.name || a.tenantId;
      const nameB = b.tenant?.name || b.tenantId;
      return nameA.localeCompare(nameB);
    });

  const applyTenantOverride = () => {
    if (selectedTenantOverrideId === "none") {
      toast.info("Pilih organisasi terlebih dahulu.");
      return;
    }
    if (selectedTenantOverrideId === ALL_ORGANIZATIONS_OVERRIDE_VALUE) {
      if (tenantOptions.length === 0) {
        toast.info("Belum ada organisasi untuk diterapkan.");
        return;
      }
      setActivityPolicy((prev) => {
        const nextOverrides = { ...prev.tenantOverrides };
        for (const tenant of tenantOptions) {
          nextOverrides[tenant.id] = selectedTenantOverrideEnabled;
        }
        return {
          ...prev,
          tenantOverrides: nextOverrides,
        };
      });
      return;
    }
    setActivityPolicy((prev) => ({
      ...prev,
      tenantOverrides: {
        ...prev.tenantOverrides,
        [selectedTenantOverrideId]: selectedTenantOverrideEnabled,
      },
    }));
  };

  const removeTenantOverride = (tenantId: string) => {
    setActivityPolicy((prev) => {
      const nextOverrides = { ...prev.tenantOverrides };
      delete nextOverrides[tenantId];
      return {
        ...prev,
        tenantOverrides: nextOverrides,
      };
    });
  };

  const resetAllTenantOverrides = () => {
    if (Object.keys(activityPolicy.tenantOverrides).length === 0) {
      toast.info("Belum ada override yang perlu direset.");
      return;
    }
    setActivityPolicy((prev) => ({
      ...prev,
      tenantOverrides: {},
    }));
    setSelectedTenantOverrideId("none");
    setSelectedTenantOverrideEnabled(activityPolicy.defaultOrgLoggingEnabled);
    toast.success("Semua override sudah direset ke bawaan. Klik Simpan Pengaturan Aktivitas untuk menerapkan.");
  };

  return (
    <SuperAdminLayout title="Log Audit" subtitle="Riwayat aktivitas sistem">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Log Aktivitas Organisasi</CardTitle>
            <CardDescription>
              Atur retensi hapus otomatis log audit dan aktif/nonaktif pencatatan aktivitas per organisasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Retensi Log Audit (hari)</p>
                <Input
                  type="number"
                  min={1}
                  value={activityPolicy.retentionDays}
                  onChange={(event) =>
                    setActivityPolicy((prev) => ({
                      ...prev,
                      retentionDays: toPositiveInteger(event.target.value, prev.retentionDays),
                    }))
                  }
                />
              </div>
              <div className="rounded-md border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Bawaan Log Aktivitas Organisasi</p>
                  <p className="text-xs text-muted-foreground">
                    Berlaku untuk semua org yang belum punya override khusus.
                  </p>
                </div>
                <Switch
                  checked={activityPolicy.defaultOrgLoggingEnabled}
                  onCheckedChange={(checked) =>
                    setActivityPolicy((prev) => ({
                      ...prev,
                      defaultOrgLoggingEnabled: checked,
                    }))
                  }
                />
              </div>
            </div>

            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                serverRetentionStatus === "error"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : isServerRetentionMismatch
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
              }`}
            >
              {serverRetentionStatus === "loading"
                ? "Memeriksa retensi efektif di server..."
                : serverRetentionStatus === "error"
                  ? serverRetentionError || "Retensi efektif server belum bisa diverifikasi."
                  : serverRetentionDays === null
                    ? "Retensi efektif server belum terbaca."
                    : isServerRetentionMismatch
                      ? `Retensi efektif server ${serverRetentionDays} hari, berbeda dari input ${activityPolicy.retentionDays} hari. Klik Simpan Pengaturan Aktivitas dan pastikan migrasi terbaru sudah diterapkan.`
                      : `Retensi efektif server: ${serverRetentionDays} hari (sinkron).`}
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Override Per Organisasi</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select value={selectedTenantOverrideId} onValueChange={setSelectedTenantOverrideId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih organisasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pilih organisasi</SelectItem>
                    <SelectItem value={ALL_ORGANIZATIONS_OVERRIDE_VALUE}>Semua organisasi</SelectItem>
                    {tenantOptions.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}{tenant.code ? ` (${tenant.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-md border p-3 flex items-center justify-between gap-3">
                  <span className="text-sm">Aktifkan logging</span>
                  <Switch
                    checked={selectedTenantOverrideEnabled}
                    onCheckedChange={setSelectedTenantOverrideEnabled}
                    disabled={selectedTenantOverrideId === "none"}
                  />
                </div>
                <Button type="button" variant="outline" onClick={applyTenantOverride} disabled={selectedTenantOverrideId === "none"}>
                  Terapkan Override
                </Button>
              </div>

              {tenantOverrideRows.length > 0 ? (
                <div className="space-y-2">
                  {tenantOverrideRows.map((row) => (
                    <div key={row.tenantId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{row.tenant?.name || row.tenantId}</p>
                        <p className="text-xs text-muted-foreground">{row.tenant?.code || row.tenantId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={row.enabled ? "default" : "destructive"}>
                          {row.enabled ? "Aktif" : "Nonaktif"}
                        </Badge>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeTenantOverride(row.tenantId)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Belum ada override organisasi.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveActivityPolicy()} disabled={isSavingActivityPolicy}>
                {isSavingActivityPolicy ? "Menyimpan..." : "Simpan Pengaturan Aktivitas"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetAllTenantOverrides}
                disabled={Object.keys(activityPolicy.tenantOverrides).length === 0 || isSavingActivityPolicy}
              >
                Reset Semua Override
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void (async () => {
                  const summaryLoaded = await loadActivityPolicySummary();
                  if (!summaryLoaded) {
                    await Promise.all([loadActivityPolicy(), loadEffectiveServerRetentionDays()]);
                  }
                })()}
                disabled={isSavingActivityPolicy}
              >
                Muat Ulang Pengaturan
              </Button>
              <Button type="button" variant="outline" onClick={() => void runActivityCleanupNow()} disabled={isRunningActivityCleanup}>
                {isRunningActivityCleanup ? "Menjalankan Cleanup..." : "Cleanup Aktivitas Sekarang"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari aktivitas..."
                  value={searchQuery}
                  onChange={(e) => {
                    setActiveQuickFilter("none");
                    setSearchQuery(e.target.value);
                  }}
                  className="pl-9"
                />
              </div>
              <Select value={monthFilter} onValueChange={(v) => { setActiveQuickFilter("none"); setMonthFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Bulan" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={(value) => {
                setActiveQuickFilter("none");
                setActionFilter(value);
              }}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder="Aksi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Aksi</SelectItem>
                  <SelectItem value="INSERT">Buat</SelectItem>
                  <SelectItem value="UPDATE">Ubah</SelectItem>
                  <SelectItem value="DELETE">Hapus</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tableFilter} onValueChange={(value) => {
                setActiveQuickFilter("none");
                setTableFilter(value);
              }}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Tabel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tabel</SelectItem>
                  {Object.entries(tableLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => void fetchLogs()} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={isFaqSyncQuickFilterActive ? "default" : "outline"}
                onClick={applyFaqSyncQuickFilter}
              >
                Filter Cepat: Sinkronisasi FAQ
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetQuickFilter} disabled={!isFaqSyncQuickFilterActive}>
                Reset Filter Cepat
              </Button>
              <span className="text-xs text-muted-foreground">
                {isFaqSyncQuickFilterActive
                  ? "Menampilkan jejak perubahan FAQ di `system_settings` (aksi update)."
                  : "Filter cepat FAQ bersifat opsional dan tidak aktif secara default."}
              </span>
            </div>
          </CardContent>
        </Card>

        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang memuat audit log...
          </div>
        )}
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void fetchLogs()}>
              Coba Lagi
            </Button>
          </div>
        )}
        {!loadError && shouldSuggestLatestMatchingMonth && latestMatchingMonthValue && latestMatchingMonthLabel && (
          <div className="flex flex-col gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <span>
                Tidak ada aktivitas yang cocok pada {currentMonthLabel}. Aktivitas terbaru dengan filter saat ini ada di {latestMatchingMonthLabel}.
              </span>
              {suggestedMatchingMonths.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestedMatchingMonths.map((month) => (
                    <Button
                      key={month.value}
                      type="button"
                      size="sm"
                      variant={month.value === latestMatchingMonthValue ? "default" : "outline"}
                      className={month.value === latestMatchingMonthValue ? "" : "bg-white"}
                      onClick={() => {
                        setMonthFilter(month.value);
                        setCurrentPage(1);
                      }}
                    >
                      {month.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-white"
              onClick={() => {
                setMonthFilter(latestMatchingMonthValue);
                setCurrentPage(1);
              }}
            >
              Buka {latestMatchingMonthLabel}
            </Button>
          </div>
        )}

        {/* Logs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Log Aktivitas
                </CardTitle>
                <CardDescription>
                  {totalCount} aktivitas pada {currentMonthLabel}
                </CardDescription>
              </div>
              <span className="text-sm text-muted-foreground">
                Halaman {currentPage} / {totalPages}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-start gap-4 animate-pulse">
                    <div className="h-10 w-10 rounded-full bg-muted"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-64"></div>
                      <div className="h-3 bg-muted rounded w-40"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Tidak ada log ditemukan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => {
                  const Icon = actionIcons[log.action] || Activity;
                  const actionStyle = actionLabels[log.action];
                  
                  return (
                    <div key={log.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className={`p-2 rounded-full ${actionStyle?.color || 'bg-gray-500'}`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium">
                              {log.employee?.name || "Sistem"}
                              <span className="text-muted-foreground font-normal">
                                {" "}melakukan {actionStyle?.label || log.action} pada{" "}
                              </span>
                              <Badge variant="outline" className="ml-1">
                                {tableLabels[log.table_name] || log.table_name}
                              </Badge>
                            </div>
                            {log.tenant && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Organisasi: {log.tenant.name}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-sm text-muted-foreground whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: id })}
                            </div>
                          </div>
                        </div>
                        {log.ip_address && (
                          <p className="text-xs text-muted-foreground mt-2">
                            IP: {log.ip_address}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-6 pt-4 border-t">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className={currentPage === 1 || isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {visiblePages.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === currentPage}
                          onClick={() => setCurrentPage(page)}
                          className={isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages || isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="admin_audit_logs" />
      </div>
    </SuperAdminLayout>
  );
}
