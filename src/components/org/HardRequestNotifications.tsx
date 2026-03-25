import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  BellRing,
  Briefcase,
  CalendarCheck2,
  FileText,
  Home,
  Loader2,
  MapPinOff,
  RefreshCw,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isEarlyLeavePermissionReason, isLatePermissionReason } from "@/lib/latePermissionRequest";
import { getTenantEmployeeIds } from "@/lib/orgTenantContext";

type RequestType = "leave" | "wfh" | "overtime" | "flexible" | "mutation";

interface PendingCounts {
  leave: number;
  wfh: number;
  overtime: number;
  flexible: number;
  mutation: number;
}

interface RecentSubmission {
  id: string;
  employee_id: string | null;
  created_at: string;
  requestType: RequestType;
  requestLabel?: string | null;
}

interface RecentSubmissionView extends RecentSubmission {
  employee_name: string;
}

interface RequestMeta {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface HardRequestSummaryRow {
  pending_leave?: number;
  pending_wfh?: number;
  pending_overtime?: number;
  pending_flexible?: number;
  pending_mutation?: number;
  latest?: unknown;
}

const REQUEST_ORDER: RequestType[] = ["leave", "wfh", "overtime", "flexible", "mutation"];

const REQUEST_META: Record<RequestType, RequestMeta> = {
  leave: {
    label: "Izin/Cuti",
    path: "/org/leave/requests",
    icon: FileText,
  },
  wfh: {
    label: "WFH",
    path: "/org/leave/wfh",
    icon: Home,
  },
  overtime: {
    label: "Lembur",
    path: "/org/leave/overtime",
    icon: Briefcase,
  },
  flexible: {
    label: "Absensi Khusus",
    path: "/org/leave/flexible",
    icon: MapPinOff,
  },
  mutation: {
    label: "Mutasi/Perubahan Data",
    path: "/org/employees/mutations",
    icon: UserCog,
  },
};

const EMPTY_COUNTS: PendingCounts = {
  leave: 0,
  wfh: 0,
  overtime: 0,
  flexible: 0,
  mutation: 0,
};

const DAILY_SESSION_KEY_PREFIX = "org:hard-request-notif:seen";
const FETCH_ERROR_SESSION_KEY_PREFIX = "org:hard-request-notif:fetch-error";
const REALTIME_ERROR_SESSION_KEY_PREFIX = "org:hard-request-notif:realtime-error";
const ACCESS_WARNING_SESSION_KEY_PREFIX = "org:hard-request-notif:access-warning";
const NETWORK_WARNING_SESSION_KEY_PREFIX = "org:hard-request-notif:network-warning";
const REALTIME_ERROR_LOG_THROTTLE_MS = 5 * 60 * 1000;
const PENDING_COUNT_MODE = "exact" as const;

function showToastOncePerSession(
  sessionKey: string,
  cb: () => void,
) {
  try {
    if (sessionStorage.getItem(sessionKey) === "1") return;
    cb();
    sessionStorage.setItem(sessionKey, "1");
  } catch {
    cb();
  }
}

function isAccessRestrictedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string; status?: number };
  const text = `${candidate.message || ""} ${candidate.details || ""} ${candidate.hint || ""}`.toLowerCase();
  return (
    candidate.code === "42501" ||
    candidate.status === 401 ||
    candidate.status === 403 ||
    text.includes("permission denied") ||
    text.includes("insufficient privilege") ||
    text.includes("row level security") ||
    text.includes("not authorized") ||
    text.includes("forbidden")
  );
}

function toErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name || ""} ${error.message || ""}`.trim();
  if (!error || typeof error !== "object") return "";

  const candidate = error as { name?: string; message?: unknown; details?: unknown; hint?: unknown; error?: unknown };
  const chunks: string[] = [];
  if (typeof candidate.name === "string") chunks.push(candidate.name);
  if (typeof candidate.message === "string") chunks.push(candidate.message);
  if (typeof candidate.details === "string") chunks.push(candidate.details);
  if (typeof candidate.hint === "string") chunks.push(candidate.hint);
  if (typeof candidate.error === "string") chunks.push(candidate.error);

  if (typeof candidate.message === "string") {
    const raw = candidate.message.trim();
    if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const key of ["message", "details", "hint", "error", "code"]) {
          const value = parsed[key];
          if (typeof value === "string") chunks.push(value);
        }
      } catch {
        // Ignore parse error and continue with raw string chunks only.
      }
    }
  }

  if (chunks.length > 0) return chunks.join(" ");
  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

function isTransientNetworkError(error: unknown): boolean {
  const text = toErrorText(error).toLowerCase();
  if (!text) return false;
  return (
    text.includes("networkerror when attempting to fetch resource") ||
    text.includes("typeerror: networkerror") ||
    text.includes("networkerror") ||
    text.includes("failed to fetch") ||
    text.includes("network request failed") ||
    text.includes("network error") ||
    text.includes("network timeout") ||
    text.includes("connection timed out")
  );
}

type RealtimePayloadLike = {
  eventType: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
};

function pickRealtimeField(payload: RealtimePayloadLike, field: string): string | null {
  const fromNew = payload.new?.[field];
  if (typeof fromNew === "string" && fromNew.length > 0) return fromNew;

  const fromOld = payload.old?.[field];
  if (typeof fromOld === "string" && fromOld.length > 0) return fromOld;

  return null;
}

function isPendingStatusForType(requestType: RequestType, status: string | null): boolean {
  if (!status) return false;
  if (requestType === "overtime") {
    return status === "pending" || status === "menunggu";
  }
  return status === "menunggu";
}

const getTodayDateKey = (): string => format(new Date(), "yyyy-MM-dd");

async function fetchPendingCount(tenantId: string, requestType: RequestType): Promise<number> {
  const today = getTodayDateKey();
  switch (requestType) {
    case "leave": {
      const { count, error } = await supabase
        .from("leave_requests")
        .select("id, employees!leave_requests_employee_id_fkey!inner(id)", { count: PENDING_COUNT_MODE, head: true })
        .eq("employees.tenant_id", tenantId)
        .eq("status", "menunggu")
        .gte("start_date", today);
      if (error) throw error;
      return count || 0;
    }
    case "wfh": {
      const { count, error } = await supabase
        .from("wfh_requests")
        .select("id, employees!wfh_requests_employee_id_fkey!inner(id)", { count: PENDING_COUNT_MODE, head: true })
        .eq("employees.tenant_id", tenantId)
        .eq("status", "menunggu")
        .gte("request_date", today);
      if (error) throw error;
      return count || 0;
    }
    case "overtime": {
      const { count, error } = await supabase
        .from("overtime_requests")
        .select("id", { count: PENDING_COUNT_MODE, head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "menunggu"]);
      if (error) throw error;
      return count || 0;
    }
    case "flexible": {
      const { count, error } = await supabase
        .from("flexible_attendance_requests")
        .select("id", { count: PENDING_COUNT_MODE, head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu");
      if (error) throw error;
      return count || 0;
    }
    case "mutation": {
      const { count, error } = await supabase
        .from("mutation_requests")
        .select("id", { count: PENDING_COUNT_MODE, head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu");
      if (error) throw error;
      return count || 0;
    }
    default:
      return 0;
  }
}

async function fetchLatestSubmissions(tenantId: string, requestType: RequestType): Promise<RecentSubmission[]> {
  const today = getTodayDateKey();
  switch (requestType) {
    case "leave": {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, employee_id, created_at, leave_type, reason, employees!leave_requests_employee_id_fkey!inner(id)")
        .eq("employees.tenant_id", tenantId)
        .eq("status", "menunggu")
        .gte("start_date", today)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        created_at: row.created_at,
        requestType,
        requestLabel:
          row.leave_type === "izin" && isLatePermissionReason(row.reason)
            ? "Izin Terlambat"
            : row.leave_type === "izin" && isEarlyLeavePermissionReason(row.reason)
              ? "Izin Pulang Cepat"
              : null,
      }));
    }
    case "wfh": {
      const { data, error } = await supabase
        .from("wfh_requests")
        .select("id, employee_id, created_at, employees!wfh_requests_employee_id_fkey!inner(id)")
        .eq("employees.tenant_id", tenantId)
        .eq("status", "menunggu")
        .gte("request_date", today)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    case "overtime": {
      const { data, error } = await supabase
        .from("overtime_requests")
        .select("id, employee_id, created_at")
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "menunggu"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    case "flexible": {
      const { data, error } = await supabase
        .from("flexible_attendance_requests")
        .select("id, employee_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    case "mutation": {
      const { data, error } = await supabase
        .from("mutation_requests")
        .select("id, employee_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    default:
      return [];
  }
}

export function HardRequestNotifications({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
  const [recentItems, setRecentItems] = useState<RecentSubmissionView[]>([]);
  const [accessRestrictedTypes, setAccessRestrictedTypes] = useState<RequestType[]>([]);
  const [networkIssueTypes, setNetworkIssueTypes] = useState<RequestType[]>([]);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const lastRealtimeErrorLogAtRef = useRef(0);
  const isBootstrappedRef = useRef(false);
  const tenantEmployeeIdsRef = useRef<Set<string>>(new Set());
  const tenantEmployeeScopeReadyRef = useRef(false);

  const totalPending = useMemo(
    () => counts.leave + counts.wfh + counts.overtime + counts.flexible + counts.mutation,
    [counts]
  );

  const refreshTenantEmployeeScope = useCallback(async () => {
    if (!tenantId) {
      tenantEmployeeIdsRef.current = new Set();
      tenantEmployeeScopeReadyRef.current = false;
      return;
    }

    try {
      const employeeIds = await getTenantEmployeeIds(tenantId);
      tenantEmployeeIdsRef.current = new Set(employeeIds);
      tenantEmployeeScopeReadyRef.current = true;
    } catch (error) {
      tenantEmployeeScopeReadyRef.current = false;
      if (!isAccessRestrictedError(error) && !isTransientNetworkError(error)) {
        reportError(error, "org.hard_request_notifications.refresh_employee_scope", {
          tenant_id: tenantId,
        });
      }
    }
  }, [tenantId]);

  const fetchAlerts = useCallback(
    async (opts?: { forceOpen?: boolean }) => {
      if (!tenantId) {
        setCounts(EMPTY_COUNTS);
        setRecentItems([]);
        setAccessRestrictedTypes([]);
        setNetworkIssueTypes([]);
        isBootstrappedRef.current = true;
        setIsBootstrapped(true);
        return;
      }

      setIsLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setCounts(EMPTY_COUNTS);
          setRecentItems([]);
          setAccessRestrictedTypes([]);
          setNetworkIssueTypes([]);
          isBootstrappedRef.current = true;
          setIsBootstrapped(true);
          return;
        }

        const perType = await Promise.all(
          REQUEST_ORDER.map(async (type) => {
            const [countResult, latestResult] = await Promise.allSettled([
              fetchPendingCount(tenantId, type),
              fetchLatestSubmissions(tenantId, type),
            ]);

            if (countResult.status === "rejected") {
              if (!isAccessRestrictedError(countResult.reason) && !isTransientNetworkError(countResult.reason)) {
                reportError(countResult.reason, "org.hard_request_notifications.fetch_count", {
                  tenant_id: tenantId,
                  request_type: type,
                });
              }
            }
            if (latestResult.status === "rejected") {
              if (!isAccessRestrictedError(latestResult.reason) && !isTransientNetworkError(latestResult.reason)) {
                reportError(latestResult.reason, "org.hard_request_notifications.fetch_latest", {
                  tenant_id: tenantId,
                  request_type: type,
                });
              }
            }

            const accessRestricted =
              (countResult.status === "rejected" && isAccessRestrictedError(countResult.reason)) ||
              (latestResult.status === "rejected" && isAccessRestrictedError(latestResult.reason));
            const networkTransient =
              (countResult.status === "rejected" && isTransientNetworkError(countResult.reason)) ||
              (latestResult.status === "rejected" && isTransientNetworkError(latestResult.reason));

            return {
              type,
              count: countResult.status === "fulfilled" ? countResult.value || 0 : 0,
              latest: latestResult.status === "fulfilled" ? latestResult.value || [] : [],
              hasError:
                countResult.status === "rejected" ||
                latestResult.status === "rejected",
              accessRestricted,
              networkTransient,
            };
          })
        );

        const nextCounts: PendingCounts = {
          leave: perType.find((item) => item.type === "leave")?.count || 0,
          wfh: perType.find((item) => item.type === "wfh")?.count || 0,
          overtime: perType.find((item) => item.type === "overtime")?.count || 0,
          flexible: perType.find((item) => item.type === "flexible")?.count || 0,
          mutation: perType.find((item) => item.type === "mutation")?.count || 0,
        };

        const merged = perType
          .flatMap((item) => item.latest)
          .flat()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20);

        const mergedEmployeeIds = Array.from(new Set(merged.map((row) => row.employee_id).filter(Boolean))) as string[];
        const employeeNameMap = new Map<string, string>();

        if (mergedEmployeeIds.length > 0) {
          const { data: employees, error: employeesError } = await supabase
            .from("employees")
            .select("id, name")
            .in("id", mergedEmployeeIds);
          if (employeesError) throw employeesError;
          (employees || []).forEach((row) => {
            employeeNameMap.set(row.id, row.name || "Pegawai");
          });
        }

        const viewItems: RecentSubmissionView[] = merged.map((row) => ({
          ...row,
          employee_name: (row.employee_id && employeeNameMap.get(row.employee_id)) || "Pegawai",
        }));

        const nextTotal =
          nextCounts.leave +
          nextCounts.wfh +
          nextCounts.overtime +
          nextCounts.flexible +
          nextCounts.mutation;

        setCounts(nextCounts);
        setRecentItems(viewItems);
        setAccessRestrictedTypes(
          perType.filter((item) => item.accessRestricted).map((item) => item.type)
        );
        setNetworkIssueTypes(
          perType.filter((item) => item.networkTransient).map((item) => item.type)
        );

        const todayKey = `${DAILY_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
        if (!isBootstrappedRef.current) {
          isBootstrappedRef.current = true;
          setIsBootstrapped(true);
          try {
            const alreadySeen = sessionStorage.getItem(todayKey) === "1";
            if (nextTotal > 0 && !alreadySeen) {
              setIsOpen(true);
              sessionStorage.setItem(todayKey, "1");
            }
          } catch {
            if (nextTotal > 0) setIsOpen(true);
          }
        }

        if (opts?.forceOpen && nextTotal > 0) {
          setIsOpen(true);
        }

        const partialFailures = perType.filter((item) => item.hasError);
        const accessFailures = partialFailures.filter((item) => item.accessRestricted);
        const networkFailures = partialFailures.filter((item) => item.networkTransient);
        const systemFailures = partialFailures.filter((item) => !item.accessRestricted && !item.networkTransient);

        if (accessFailures.length > 0) {
          showToastOncePerSession(
            `${ACCESS_WARNING_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
            () =>
              toast.warning(
                "Sebagian notifikasi pengajuan tidak ditampilkan karena akses role terbatas."
              )
          );
        }

        if (networkFailures.length > 0) {
          showToastOncePerSession(
            `${NETWORK_WARNING_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
            () =>
              toast.warning(
                "Koneksi jaringan tidak stabil. Sebagian notifikasi pengajuan belum termuat."
              )
          );
        }

        if (systemFailures.length > 0) {
          const errorRef = reportError(new Error("Sebagian sumber notifikasi pengajuan gagal dimuat"), "org.hard_request_notifications.partial_failure", {
            tenant_id: tenantId,
            failed_types: systemFailures.map((item) => item.type),
            access_restricted_types: accessFailures.map((item) => item.type),
          });
          showToastOncePerSession(
            `${FETCH_ERROR_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
            () =>
              toast.warning(
                appendErrorReference(
                  "Sebagian notifikasi pengajuan tidak dapat dimuat. Data yang tersedia tetap ditampilkan.",
                  errorRef
                )
              )
          );
        }
      } catch (error) {
        if (isTransientNetworkError(error)) {
          setNetworkIssueTypes(REQUEST_ORDER);
          showToastOncePerSession(
            `${NETWORK_WARNING_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
            () =>
              toast.warning(
                "Koneksi jaringan tidak stabil. Sebagian notifikasi pengajuan belum termuat."
              )
          );
          return;
        }
        const errorRef = reportError(error, "org.hard_request_notifications.fetch", {
          tenant_id: tenantId,
        });
        showToastOncePerSession(
          `${FETCH_ERROR_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
          () => toast.error(appendErrorReference("Gagal memuat notifikasi pengajuan keras", errorRef))
        );
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    isBootstrappedRef.current = isBootstrapped;
  }, [isBootstrapped]);

  useEffect(() => {
    if (!tenantId || !isPageVisible || !isOnline) return;
    void refreshTenantEmployeeScope();
  }, [tenantId, isPageVisible, isOnline, refreshTenantEmployeeScope]);

  useEffect(() => {
    if (!tenantId || !isPageVisible || !isOnline) return;
    isBootstrappedRef.current = false;
    setIsBootstrapped(false);
    void fetchAlerts();
  }, [tenantId, fetchAlerts, isPageVisible, isOnline]);

  useEffect(() => {
    if (!tenantId || !isPageVisible || !isOnline) return;

    const channel = supabase.channel(`org-hard-request-alert-${tenantId}`);
    const isPayloadRelevant = (requestType: RequestType, payload: RealtimePayloadLike) => {
      if (requestType === "leave" || requestType === "wfh") {
        const employeeId = pickRealtimeField(payload, "employee_id");
        if (!employeeId) return !tenantEmployeeScopeReadyRef.current;
        if (!tenantEmployeeScopeReadyRef.current) return true;
        return tenantEmployeeIdsRef.current.has(employeeId);
      }

      const payloadTenantId = pickRealtimeField(payload, "tenant_id");
      if (!payloadTenantId) return true;
      return payloadTenantId === tenantId;
    };

    const register = (
      table: string,
      requestType: RequestType,
      filter: string | undefined,
    ) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter,
        },
        (payload) => {
          const realtimePayload = payload as RealtimePayloadLike;
          if (!isPayloadRelevant(requestType, realtimePayload)) return;

          const status = pickRealtimeField(realtimePayload, "status");
          const shouldForceOpen =
            realtimePayload.eventType === "INSERT" &&
            isPendingStatusForType(requestType, status);

          void fetchAlerts({ forceOpen: shouldForceOpen });
          if (shouldForceOpen) {
            const meta = REQUEST_META[requestType];
            toast.warning(`Pengajuan baru: ${meta.label}`, {
              description: "Perlu verifikasi Admin Organisasi.",
              duration: 5000,
            });
          }
        }
      );
    };

    register("leave_requests", "leave", undefined);
    register("wfh_requests", "wfh", undefined);
    register("overtime_requests", "overtime", `tenant_id=eq.${tenantId}`);
    register("flexible_attendance_requests", "flexible", `tenant_id=eq.${tenantId}`);
    register("mutation_requests", "mutation", `tenant_id=eq.${tenantId}`);

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        const now = Date.now();
        const shouldLogToRemote = now - lastRealtimeErrorLogAtRef.current >= REALTIME_ERROR_LOG_THROTTLE_MS;
        const errorRef = shouldLogToRemote
          ? reportError(new Error(`Realtime channel ${status.toLowerCase()}`), "org.hard_request_notifications.realtime", {
              tenant_id: tenantId,
              realtime_status: status,
            })
          : undefined;
        if (shouldLogToRemote) {
          lastRealtimeErrorLogAtRef.current = now;
        }
        showToastOncePerSession(
          `${REALTIME_ERROR_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
          () =>
            toast.warning(
              appendErrorReference(
                "Realtime notifikasi pengajuan bermasalah. Silakan gunakan tombol Refresh sementara.",
                errorRef
              )
            )
        );
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts, tenantId, isOnline, isPageVisible]);

  if (!tenantId) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 h-12 rounded-full px-4 shadow-lg"
        variant={totalPending > 0 ? "destructive" : "default"}
      >
        <BellRing className="mr-2 h-4 w-4" />
        Alert Pengajuan
        <Badge className="ml-2 bg-white/20 text-white border-none">{totalPending}</Badge>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="max-w-3xl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Notifikasi Keras Pengajuan/Permohonan
            </DialogTitle>
            <DialogDescription>
              Monitor seluruh pengajuan aktif yang perlu tindakan admin organisasi secepatnya.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {REQUEST_ORDER.map((type) => {
                const meta = REQUEST_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      navigate(meta.path);
                    }}
                    className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Badge variant={counts[type] > 0 ? "destructive" : "secondary"}>{counts[type]}</Badge>
                    </div>
                    <p className="text-xs font-medium leading-tight">{meta.label}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
                Total pending: <span className="text-foreground">{totalPending}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchAlerts()}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>

            {accessRestrictedTypes.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Sebagian sumber notifikasi tidak dapat diakses oleh role Anda:{" "}
                {accessRestrictedTypes.map((type) => REQUEST_META[type].label).join(", ")}.
              </div>
            )}

            {networkIssueTypes.length > 0 && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                Koneksi sedang tidak stabil untuk: {networkIssueTypes.map((type) => REQUEST_META[type].label).join(", ")}.
                Coba klik Refresh beberapa saat lagi.
              </div>
            )}

            <div className="rounded-lg border">
              <div className="border-b px-3 py-2 text-sm font-medium">Pengajuan Terbaru</div>
              <ScrollArea className="h-72">
                <div className="divide-y">
                  {recentItems.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Tidak ada pengajuan pending saat ini.</p>
                  ) : (
                    recentItems.map((row) => {
                      const meta = REQUEST_META[row.requestType];
                      return (
                        <div key={`${row.requestType}-${row.id}`} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{row.employee_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.requestLabel || meta.label} •{" "}
                              {formatDistanceToNow(new Date(row.created_at), {
                                addSuffix: true,
                                locale: localeId,
                              })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsOpen(false);
                              navigate(meta.path);
                            }}
                          >
                            Buka
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setIsOpen(false)}>
                Saya Mengerti
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
