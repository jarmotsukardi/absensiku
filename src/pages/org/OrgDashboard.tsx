import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Users, 
  MapPin,
  Clock,
  CheckCircle2,
  UserCheck,
  UserX,
  TrendingUp,
  Sparkles,
  UserPlus,
  ClipboardList,
  FileText,
  Calendar,
  Download,
  AlertTriangle,
  CreditCard,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { id } from "date-fns/locale";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OverdueRequestsOverlay } from "@/components/org/OverdueRequestsOverlay";
import { StabilityStreakWidget } from "@/components/dashboard/StabilityStreakWidget";
import { FloatingBugReport } from "@/components/common/FloatingBugReport";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface SubscriptionInfo {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

interface DashboardStats {
  totalEmployees: number;
  linkedEmployees: number;
  totalOffices: number;
  todayPresent: number;
  pendingOvertime: number;
  pendingLeaves: number;
  pendingWfh: number;
  expiredInvitations: number;
}

interface AttendanceTrendPoint {
  date: string;
  label: string;
  present: number;
  absent: number;
  coveragePct: number;
}

interface ApprovalPerformance {
  avgApprovalHours: number;
  processedCount: number;
  approvedCount: number;
  rejectedCount: number;
}

interface ApkInfo {
  url: string;
  version: string;
  updated_at: string;
}

interface BillingAlertNotification {
  id: string;
  title: string | null;
  message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface OrgDashboardTrendCount {
  date: string;
  present: number;
}

interface OrgDashboardSnapshotPayload {
  stats: DashboardStats;
  attendance_trend_counts: OrgDashboardTrendCount[];
  approval_performance: ApprovalPerformance;
}

interface OrgDashboardSnapshotRow {
  payload: unknown;
  computed_at: string | null;
  source: string | null;
  count_mode: string | null;
}

const DASHBOARD_FETCH_TIMEOUT_MS = 30000;
const DASHBOARD_LOADING_WATCHDOG_MS = 70000;
const ORG_ACTIVE_TENANT_STORAGE_KEY = "org_active_tenant_id";
const ORG_DASHBOARD_SNAPSHOT_MAX_AGE_SECONDS = 180;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeUuid = (value: string | null): string | null => {
  if (!value) return null;
  return UUID_PATTERN.test(value) ? value : null;
};

const isSnapshotStats = (value: unknown): value is DashboardStats => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.totalEmployees === "number" &&
    typeof v.linkedEmployees === "number" &&
    typeof v.totalOffices === "number" &&
    typeof v.todayPresent === "number" &&
    typeof v.pendingOvertime === "number" &&
    typeof v.pendingLeaves === "number" &&
    typeof v.pendingWfh === "number" &&
    typeof v.expiredInvitations === "number"
  );
};

const isSnapshotApproval = (value: unknown): value is ApprovalPerformance => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.avgApprovalHours === "number" &&
    typeof v.processedCount === "number" &&
    typeof v.approvedCount === "number" &&
    typeof v.rejectedCount === "number"
  );
};

const parseSnapshotTrendCounts = (value: unknown): OrgDashboardTrendCount[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const date = typeof row.date === "string" ? row.date : "";
      const present = typeof row.present === "number" ? row.present : Number(row.present ?? 0);
      if (!date || Number.isNaN(present)) return null;
      return { date, present };
    })
    .filter((row): row is OrgDashboardTrendCount => Boolean(row));
};

export default function OrgDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTenantId = sanitizeUuid(searchParams.get("tenant_id"));
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    linkedEmployees: 0,
    totalOffices: 0,
    todayPresent: 0,
    pendingOvertime: 0,
    pendingLeaves: 0,
    pendingWfh: 0,
    expiredInvitations: 0,
  });
  const [userName, setUserName] = useState("");
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrendPoint[]>([]);
  const [approvalPerformance, setApprovalPerformance] = useState<ApprovalPerformance>({
    avgApprovalHours: 0,
    processedCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  });
  const [billingAlerts, setBillingAlerts] = useState<BillingAlertNotification[]>([]);
  const [isBillingOverlayOpen, setIsBillingOverlayOpen] = useState(false);
  const [billingAlertsErrorRef, setBillingAlertsErrorRef] = useState<string | null>(null);
  const [billingAlertsErrorReason, setBillingAlertsErrorReason] = useState<string | null>(null);
  const [dashboardPartialRef, setDashboardPartialRef] = useState<string | null>(null);
  const [dashboardPartialScopes, setDashboardPartialScopes] = useState<string[]>([]);
  const [snapshotSource, setSnapshotSource] = useState<"fresh" | "cache" | "legacy" | "peak_cache" | null>(null);
  const [snapshotCountMode, setSnapshotCountMode] = useState<string | null>(null);
  const [snapshotComputedAt, setSnapshotComputedAt] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    let resolvedTenantIdForLog: string | null = null;
    try {
      const { data: { user } } = await withTimeout(
        Promise.resolve(supabase.auth.getUser()),
        DASHBOARD_FETCH_TIMEOUT_MS,
        "Timeout verifikasi sesi dashboard organisasi"
      );
      
      if (!user) {
        navigate("/org/login");
        return;
      }

      // Resolve tenant context from roles and optional query param.
      let isSuperAdmin = false;
      let resolvedTenantId: string | null = null;
      const { data: roleRows, error: roleRowsError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("user_roles")
            .select("role, tenant_id")
            .eq("user_id", user.id)
            .in("role", ["admin_instansi", "super_admin"])
        ),
        DASHBOARD_FETCH_TIMEOUT_MS,
        "Timeout membaca role pengguna organisasi"
      );
      if (roleRowsError) throw roleRowsError;

      const adminRole = roleRows?.find((r) => r.role === "admin_instansi" && r.tenant_id);
      isSuperAdmin = roleRows?.some((r) => r.role === "super_admin") || false;
      resolvedTenantId = adminRole?.tenant_id || (isSuperAdmin ? queryTenantId : null);
      resolvedTenantIdForLog = resolvedTenantId;

      if (!resolvedTenantId) {
        if (isSuperAdmin) {
          toast.info("Pilih organisasi dari menu admin terlebih dahulu.");
          navigate("/admin/organizations");
          return;
        }
        toast.error("Akses ditolak. Anda bukan Admin Organisasi.");
        navigate("/org/login");
        return;
      }

      try {
        sessionStorage.setItem(ORG_ACTIVE_TENANT_STORAGE_KEY, resolvedTenantId);
      } catch {
        // Ignore storage failures.
      }

      setTenantId(resolvedTenantId);

      // Fetch subscription
      const { data: subData, error: subError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("subscriptions")
            .select("*")
            .eq("tenant_id", resolvedTenantId)
            .order("created_at", { ascending: false })
            .limit(1)
        ),
        DASHBOARD_FETCH_TIMEOUT_MS,
        "Timeout membaca data langganan organisasi"
      );
      if (subError) {
        const subRef = reportError(subError, "org.dashboard.fetch_subscription", { tenant_id: resolvedTenantId });
        toast.warning(appendErrorReference("Data langganan belum dapat dimuat penuh.", subRef));
        setSubscription(null);
      } else {
        setSubscription((subData as SubscriptionInfo[] | null)?.[0] || null);
      }

      // Fetch display name (tenant name for super admin context, otherwise employee name).
      if (isSuperAdmin && queryTenantId) {
        const { data: tenantData, error: tenantDataError } = await withTimeout(
          Promise.resolve(
            supabase
              .from("tenants")
              .select("name")
              .eq("id", queryTenantId)
              .maybeSingle()
          ),
          DASHBOARD_FETCH_TIMEOUT_MS,
          "Timeout membaca tenant dashboard organisasi"
        );
        if (tenantDataError) throw tenantDataError;
        setUserName(tenantData?.name || "Admin Organisasi");
      } else {
        const { data: empData, error: empDataError } = await withTimeout(
          Promise.resolve(
            supabase
              .from("employees")
              .select("name")
              .eq("user_id", user.id)
              .eq("tenant_id", resolvedTenantId)
              .order("updated_at", { ascending: false })
              .limit(1)
          ),
          DASHBOARD_FETCH_TIMEOUT_MS,
          "Timeout membaca profil admin organisasi"
        );
        if (empDataError) {
          const empRef = reportError(empDataError, "org.dashboard.fetch_org_admin_profile", { tenant_id: resolvedTenantId });
          toast.warning(appendErrorReference("Profil admin organisasi belum sinkron.", empRef));
          setUserName("Admin Organisasi");
        } else if ((empData as Array<{ name?: string }> | null)?.[0]?.name) {
          setUserName(((empData as Array<{ name?: string }>)[0].name as string) || "Admin Organisasi");
        } else {
          setUserName("Admin Organisasi");
        }
      }

      // Fetch stats
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const sevenDaysAgoDate = new Date(now);
      sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 6);
      const sevenDaysAgo = format(sevenDaysAgoDate, "yyyy-MM-dd");
      const thirtyDaysAgoIso = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();

      let snapshotApplied = false;
      try {
        const { data: snapshotData, error: snapshotError } = await withTimeout(
          Promise.resolve(
            supabase.rpc("get_org_dashboard_snapshot", {
              p_tenant_id: resolvedTenantId,
              p_force_refresh: false,
              p_max_age_seconds: ORG_DASHBOARD_SNAPSHOT_MAX_AGE_SECONDS,
            })
          ),
          DASHBOARD_FETCH_TIMEOUT_MS,
          "Timeout membaca snapshot dashboard organisasi"
        );
        if (snapshotError) throw snapshotError;

        const snapshotRow = (Array.isArray(snapshotData) ? snapshotData[0] : null) as OrgDashboardSnapshotRow | null;
        const snapshotPayload = (snapshotRow?.payload && typeof snapshotRow.payload === "object")
          ? (snapshotRow.payload as Partial<OrgDashboardSnapshotPayload>)
          : null;

        if (snapshotPayload && isSnapshotStats(snapshotPayload.stats) && isSnapshotApproval(snapshotPayload.approval_performance)) {
          const trendRows = parseSnapshotTrendCounts(snapshotPayload.attendance_trend_counts);
          const attendanceByDate = new Map(trendRows.map((row) => [row.date, row.present]));
          const trendPoints: AttendanceTrendPoint[] = [];
          for (let index = 0; index < 7; index += 1) {
            const pointDate = new Date(sevenDaysAgoDate);
            pointDate.setDate(sevenDaysAgoDate.getDate() + index);
            const dateKey = format(pointDate, "yyyy-MM-dd");
            const present = attendanceByDate.get(dateKey) || 0;
            const absent = Math.max(0, snapshotPayload.stats.totalEmployees - present);
            const coveragePct = snapshotPayload.stats.totalEmployees > 0
              ? Math.min(100, Math.round((present / snapshotPayload.stats.totalEmployees) * 100))
              : 0;
            trendPoints.push({
              date: dateKey,
              label: format(pointDate, "EEE, d MMM", { locale: id }),
              present,
              absent,
              coveragePct,
            });
          }

          setStats(snapshotPayload.stats);
          setAttendanceTrend(trendPoints);
          setApprovalPerformance(snapshotPayload.approval_performance);
          setDashboardPartialRef(null);
          setDashboardPartialScopes([]);
          setSnapshotSource(
            snapshotRow?.source === "peak_cache"
              ? "peak_cache"
              : snapshotRow?.source === "cache"
                ? "cache"
                : "fresh"
          );
          setSnapshotCountMode(snapshotRow?.count_mode || "snapshot");
          setSnapshotComputedAt(snapshotRow?.computed_at || new Date().toISOString());
          snapshotApplied = true;
        } else {
          throw new Error("Invalid org dashboard snapshot payload");
        }
      } catch (snapshotError) {
        reportError(snapshotError, "org.dashboard.fetch_snapshot", { tenant_id: resolvedTenantId });
      }

      if (snapshotApplied) {
        const { data: apkSettings, error: apkSettingsError } = await withTimeout(
          Promise.resolve(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", "apk_settings")
              .maybeSingle()
          ),
          DASHBOARD_FETCH_TIMEOUT_MS,
          "Timeout membaca konfigurasi APK organisasi"
        );
        if (!apkSettingsError && apkSettings?.value && typeof apkSettings.value === "object") {
          const apkData = apkSettings.value as Record<string, unknown>;
          if (apkData.url) {
            setApkInfo({
              url: apkData.url as string,
              version: apkData.version as string || "1.0.0",
              updated_at: apkData.updated_at as string || "",
            });
          }
        }
        return;
      }

      setSnapshotSource("legacy");
      setSnapshotCountMode("planned");
      setSnapshotComputedAt(new Date().toISOString());

      const { data: officeRows, error: officeRowsError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("offices")
            .select("id")
            .eq("tenant_id", resolvedTenantId)
        ),
        DASHBOARD_FETCH_TIMEOUT_MS,
        "Timeout membaca daftar kantor organisasi"
      );
      if (officeRowsError) {
        const officeRef = reportError(officeRowsError, "org.dashboard.fetch_offices", { tenant_id: resolvedTenantId });
        toast.warning(appendErrorReference("Sebagian data lokasi belum dapat dimuat.", officeRef));
      }
      const officeIds = (officeRows || []).map((row) => row.id);
      const attendancePromise = officeIds.length > 0
        ? supabase
          .from("attendance_records_partitioned")
          .select("id", { count: "exact", head: true })
          .in("office_id", officeIds)
          .eq("date", today)
        : Promise.resolve({ count: 0 as number | null, error: null });
      const attendanceTrendPromise = officeIds.length > 0
        ? supabase
          .from("attendance_records_partitioned")
          .select("date")
          .in("office_id", officeIds)
          .gte("date", sevenDaysAgo)
          .lte("date", today)
        : Promise.resolve({ data: [] as { date: string }[], error: null });

      const { data: tenantEmployeeRows, error: tenantEmployeeRowsError } = await supabase
        .from("employees")
        .select("id")
        .eq("tenant_id", resolvedTenantId);
      if (tenantEmployeeRowsError) {
        throw tenantEmployeeRowsError;
      }
      const tenantEmployeeIds = (tenantEmployeeRows || []).map((row) => row.id);
      const leavePendingPromise = tenantEmployeeIds.length > 0
        ? supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .in("employee_id", tenantEmployeeIds)
          .eq("status", "menunggu")
        : Promise.resolve({ count: 0 as number | null, error: null });
      const wfhPendingPromise = tenantEmployeeIds.length > 0
        ? supabase
          .from("wfh_requests")
          .select("id", { count: "exact", head: true })
          .in("employee_id", tenantEmployeeIds)
          .eq("status", "menunggu")
        : Promise.resolve({ count: 0 as number | null, error: null });
      const leaveApprovalsPromise = tenantEmployeeIds.length > 0
        ? supabase
          .from("leave_requests")
          .select("created_at, approved_at, status")
          .in("employee_id", tenantEmployeeIds)
          .gte("created_at", thirtyDaysAgoIso)
        : Promise.resolve({ data: [] as { created_at: string | null; approved_at: string | null; status: string | null }[], error: null });
      const wfhApprovalsPromise = tenantEmployeeIds.length > 0
        ? supabase
          .from("wfh_requests")
          .select("created_at, approved_at, status")
          .in("employee_id", tenantEmployeeIds)
          .gte("created_at", thirtyDaysAgoIso)
        : Promise.resolve({ data: [] as { created_at: string | null; approved_at: string | null; status: string | null }[], error: null });

      const [employeesRes, linkedEmployeesRes, officesRes, attendanceRes, attendanceTrendRes, leavesRes, wfhRes, overtimeRes, leaveApprovalsRes, wfhApprovalsRes, overtimeApprovalsRes, invitationsRes, apkSettings] = await withTimeout(
        Promise.all([
          supabase
            .from("employees")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("is_active", true),
          supabase
            .from("employees")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("is_active", true)
            .not("user_id", "is", null),
          supabase
            .from("offices")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("is_active", true),
          attendancePromise,
          attendanceTrendPromise,
          leavePendingPromise,
          wfhPendingPromise,
          supabase
            .from("overtime_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("status", "pending"),
          leaveApprovalsPromise,
          wfhApprovalsPromise,
          supabase
            .from("overtime_requests")
            .select("created_at, approved_at, status")
            .eq("tenant_id", resolvedTenantId)
            .gte("created_at", thirtyDaysAgoIso),
          supabase
            .from("employee_invitations")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("status", "pending")
            .lt("expires_at", new Date().toISOString()),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "apk_settings")
            .maybeSingle(),
        ]),
        DASHBOARD_FETCH_TIMEOUT_MS,
        "Timeout memuat statistik dashboard organisasi"
      );

      const queryScopes: Array<[string, unknown]> = [
        ["employees", employeesRes.error],
        ["linked_employees", linkedEmployeesRes.error],
        ["offices", officesRes.error],
        ["attendance_today", attendanceRes.error],
        ["attendance_trend", attendanceTrendRes.error],
        ["leave_requests", leavesRes.error],
        ["wfh_requests", wfhRes.error],
        ["overtime_requests", overtimeRes.error],
        ["leave_approvals", leaveApprovalsRes.error],
        ["wfh_approvals", wfhApprovalsRes.error],
        ["overtime_approvals", overtimeApprovalsRes.error],
        ["expired_invitations", invitationsRes.error],
        ["apk_settings", apkSettings.error],
      ];
      const failedScopes = queryScopes
        .filter(([, error]) => Boolean(error))
        .map(([scope]) => scope);

      if (failedScopes.length > 0) {
        const partialRef = reportError(new Error("Partial org dashboard data failure"), "org.dashboard.fetch_partial", {
          tenant_id: resolvedTenantId,
          failed_scopes: failedScopes,
        });
        setDashboardPartialRef(partialRef);
        setDashboardPartialScopes(failedScopes);
      } else {
        setDashboardPartialRef(null);
        setDashboardPartialScopes([]);
      }

      const totalEmployees = employeesRes.error ? 0 : (employeesRes.count || 0);
      const linkedEmployees = linkedEmployeesRes.error ? 0 : (linkedEmployeesRes.count || 0);
      const totalOffices = officesRes.error ? 0 : (officesRes.count || 0);
      const todayPresent = attendanceRes.error ? 0 : (attendanceRes.count || 0);
      const pendingOvertime = overtimeRes.error ? 0 : (overtimeRes.count || 0);
      const pendingLeaves = leavesRes.error ? 0 : (leavesRes.count || 0);
      const pendingWfh = wfhRes.error ? 0 : (wfhRes.count || 0);
      const expiredInvitations = invitationsRes.error ? 0 : (invitationsRes.count || 0);

      setStats({
        totalEmployees,
        linkedEmployees,
        totalOffices,
        todayPresent,
        pendingOvertime,
        pendingLeaves,
        pendingWfh,
        expiredInvitations,
      });

      const attendanceByDate = new Map<string, number>();
      for (const row of attendanceTrendRes.error ? [] : (attendanceTrendRes.data || [])) {
        const dateKey = row.date;
        attendanceByDate.set(dateKey, (attendanceByDate.get(dateKey) || 0) + 1);
      }
      const trendPoints: AttendanceTrendPoint[] = [];
      for (let index = 0; index < 7; index += 1) {
        const pointDate = new Date(sevenDaysAgoDate);
        pointDate.setDate(sevenDaysAgoDate.getDate() + index);
        const dateKey = format(pointDate, "yyyy-MM-dd");
        const present = attendanceByDate.get(dateKey) || 0;
        const absent = Math.max(0, totalEmployees - present);
        const coveragePct = totalEmployees > 0
          ? Math.min(100, Math.round((present / totalEmployees) * 100))
          : 0;
        trendPoints.push({
          date: dateKey,
          label: format(pointDate, "EEE, d MMM", { locale: id }),
          present,
          absent,
          coveragePct,
        });
      }
      setAttendanceTrend(trendPoints);

      const normalizeStatus = (value: unknown) => String(value || "").toLowerCase();
      const approvedStatuses = new Set(["approved", "disetujui"]);
      const rejectedStatuses = new Set(["rejected", "ditolak"]);
      const approvalRows = [
        ...(leaveApprovalsRes.error ? [] : (leaveApprovalsRes.data || [])),
        ...(wfhApprovalsRes.error ? [] : (wfhApprovalsRes.data || [])),
        ...(overtimeApprovalsRes.error ? [] : (overtimeApprovalsRes.data || [])),
      ] as { created_at: string | null; approved_at: string | null; status: string | null }[];

      let approvedCount = 0;
      let rejectedCount = 0;
      let processedCount = 0;
      let totalApprovalHours = 0;
      for (const row of approvalRows) {
        const status = normalizeStatus(row.status);
        if (!approvedStatuses.has(status) && !rejectedStatuses.has(status)) continue;
        if (!row.created_at || !row.approved_at) continue;

        const createdAt = new Date(row.created_at).getTime();
        const approvedAt = new Date(row.approved_at).getTime();
        if (Number.isNaN(createdAt) || Number.isNaN(approvedAt) || approvedAt < createdAt) continue;

        const approvalHours = (approvedAt - createdAt) / (1000 * 60 * 60);
        totalApprovalHours += approvalHours;
        processedCount += 1;
        if (approvedStatuses.has(status)) approvedCount += 1;
        if (rejectedStatuses.has(status)) rejectedCount += 1;
      }
      setApprovalPerformance({
        avgApprovalHours: processedCount > 0 ? Number((totalApprovalHours / processedCount).toFixed(1)) : 0,
        processedCount,
        approvedCount,
        rejectedCount,
      });

      // Set APK info
      if (!apkSettings.error && apkSettings?.data?.value && typeof apkSettings.data.value === "object") {
        const apkData = apkSettings.data.value as Record<string, unknown>;
        if (apkData.url) {
          setApkInfo({
            url: apkData.url as string,
            version: apkData.version as string || "1.0.0",
            updated_at: apkData.updated_at as string || "",
          });
        }
      }

    } catch (error) {
      const errorRef = reportError(error, "org.dashboard.fetch", {
        tenant_id: resolvedTenantIdForLog ?? queryTenantId ?? null,
        reason: (error as { message?: string; code?: string; details?: string; hint?: string })?.message ?? null,
        supabase_code: (error as { code?: string })?.code ?? null,
        supabase_details: (error as { details?: string })?.details ?? null,
        supabase_hint: (error as { hint?: string })?.hint ?? null,
      });
      toast.error(appendErrorReference("Gagal memuat data dashboard", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [navigate, queryTenantId]);

  const fetchBillingAlerts = useCallback(async () => {
    if (!tenantId) return;
    try {
      setBillingAlertsErrorRef(null);
      setBillingAlertsErrorReason(null);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, created_at, metadata")
        .eq("user_id", userId)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;

      const filtered = (data || []).filter((row) => {
        const metadata = (row.metadata && typeof row.metadata === "object")
          ? (row.metadata as Record<string, unknown>)
          : null;
        const source = String(metadata?.source || "").toLowerCase();
        const title = String(row.title || "").toLowerCase();
        const message = String(row.message || "").toLowerCase();
        return source === "billing_grace_notifier"
          || title.includes("tagihan")
          || title.includes("grace")
          || message.includes("tagihan")
          || message.includes("grace")
          || message.includes("pembayaran");
      }) as BillingAlertNotification[];

      setBillingAlerts(filtered);
      if (filtered.length > 0) {
        const sessionKey = `org_billing_overlay_seen_${tenantId}_${format(new Date(), "yyyy-MM-dd")}`;
        const hasSeenToday = sessionStorage.getItem(sessionKey);
        if (!hasSeenToday) {
          setIsBillingOverlayOpen(true);
          sessionStorage.setItem(sessionKey, "1");
        }
      }
    } catch (error) {
      const err = error as {
        code?: string;
        details?: string;
        hint?: string;
        message?: string;
        status?: number;
      };
      const reason = String(err?.message || "Unknown billing alert error");
      const errorRef = reportError(error, "org.dashboard.billing_alerts.fetch", {
        tenant_id: tenantId,
        supabase_code: err?.code ?? null,
        supabase_details: err?.details ?? null,
        supabase_hint: err?.hint ?? null,
        supabase_status: err?.status ?? null,
        reason,
      });
      setBillingAlertsErrorRef(errorRef);
      setBillingAlertsErrorReason(reason);
      toast.warning(appendErrorReference("Peringatan tagihan belum dapat dimuat penuh.", errorRef));
    }
  }, [tenantId]);

  const markBillingAlertsAsRead = useCallback(async () => {
    if (billingAlerts.length === 0) return;
    const ids = billingAlerts.map((row) => row.id);
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", ids);
      if (error) throw error;
      setBillingAlerts([]);
      setIsBillingOverlayOpen(false);
      toast.success("Peringatan tagihan ditandai sudah dibaca.");
    } catch (error) {
      const errorRef = reportError(error, "org.dashboard.billing_alerts.mark_read", { tenant_id: tenantId, ids_count: ids.length });
      toast.error(appendErrorReference("Gagal menandai peringatan tagihan.", errorRef));
    }
  }, [billingAlerts, tenantId]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    void fetchBillingAlerts();
  }, [fetchBillingAlerts]);

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => {
      const errorRef = reportError(new Error("Org dashboard loading watchdog timeout"), "org.dashboard.loading_watchdog", {
        tenant_id: tenantId ?? queryTenantId ?? null,
      });
      toast.error(appendErrorReference("Memuat dashboard terlalu lama. Coba muat ulang halaman.", errorRef));
      setIsLoading(false);
    }, DASHBOARD_LOADING_WATCHDOG_MS);

    return () => window.clearTimeout(timer);
  }, [isLoading, queryTenantId, tenantId]);

  const getSubscriptionStatus = () => {
    if (!subscription) return { label: "Tidak Aktif", variant: "destructive" as const };
    
    switch (subscription.status) {
      case "trial":
        return { label: "Trial", variant: "secondary" as const };
      case "active":
        return { label: "Aktif", variant: "default" as const };
      case "expired":
        return { label: "Expired", variant: "destructive" as const };
      default:
        return { label: subscription.status, variant: "outline" as const };
    }
  };

  const getDaysRemaining = () => {
    if (!subscription?.end_date) return 0;
    return Math.max(0, differenceInDays(new Date(subscription.end_date), new Date()));
  };

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </OrganizationLayout>
    );
  }

  const status = getSubscriptionStatus();
  const daysRemaining = getDaysRemaining();
  const totalPendingRequests = stats.pendingLeaves + stats.pendingWfh + stats.pendingOvertime;
  const unlinkedEmployees = Math.max(0, stats.totalEmployees - stats.linkedEmployees);
  const todayAbsent = Math.max(0, stats.totalEmployees - stats.todayPresent);
  const attendanceCoveragePct = stats.totalEmployees > 0
    ? Math.min(100, Math.round((stats.todayPresent / stats.totalEmployees) * 100))
    : 0;
  return (
    <OrganizationLayout>
      <OverdueRequestsOverlay tenantId={tenantId} />
      <div className="space-y-6">
        {/* Welcome & Trial Warning */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">Selamat datang, {userName || "Admin"}!</h2>
            <p className="text-muted-foreground">Kelola absensi organisasi Anda dengan mudah</p>
          </div>

          {subscription?.status === "trial" && (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-amber-700">Masa Trial</p>
                      <p className="text-sm text-muted-foreground">
                        {daysRemaining > 0 
                          ? `${daysRemaining} hari tersisa` 
                          : "Trial telah berakhir"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={() => navigate("/org/activation")}
                  >
                    Upgrade Sekarang
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {billingAlerts.length > 0 && (
            <Card className="border-red-500/60 bg-red-500/10">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-red-700">Peringatan Keras Tagihan</p>
                      <p className="text-sm text-muted-foreground">
                        {billingAlerts.length} notifikasi billing membutuhkan tindakan segera
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setIsBillingOverlayOpen(true)}
                  >
                    Buka Overlay
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {billingAlertsErrorRef && (
            <Card className="border-amber-500/60 bg-amber-500/10">
              <CardContent className="py-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-700">Debug Notifikasi Billing</p>
                  <p className="text-xs text-muted-foreground">
                    Query notifikasi billing gagal. Ref: <span className="font-mono">{billingAlertsErrorRef}</span>
                  </p>
                  {billingAlertsErrorReason && (
                    <p className="text-xs text-muted-foreground">Reason: {billingAlertsErrorReason}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {dashboardPartialRef && (
            <Card className="border-amber-400/60 bg-amber-500/5">
              <CardContent className="py-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-700">Mode Parsial Dashboard Aktif</p>
                  <p className="text-xs text-muted-foreground">
                    Sebagian data sedang fallback. Ref: <span className="font-mono">{dashboardPartialRef}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Scope: {dashboardPartialScopes.join(", ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {snapshotSource && (
            <Card className="border-blue-400/50 bg-blue-500/5">
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-blue-700">Snapshot Dashboard:</span>
                  <Badge variant="outline" className="text-[10px]">
                    {snapshotSource === "peak_cache" ? "peak-hour cache" : snapshotSource}
                  </Badge>
                  {snapshotCountMode && (
                    <Badge variant="outline" className="text-[10px]">
                      count {snapshotCountMode}
                    </Badge>
                  )}
                  {snapshotComputedAt && (
                    <span>
                      sync {new Date(snapshotComputedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stability Streak Widget */}
          {tenantId && (
            <StabilityStreakWidget
              tenantId={tenantId}
              tenantName={userName}
              currentEmployeeCount={stats.totalEmployees}
              subscriptionId={subscription?.id}
            />
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card
            className="cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => navigate("/org/employees/active")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Pegawai
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <p className="text-xs text-muted-foreground mt-2">Akses berbasis kebijakan streak</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => navigate("/org/employees/active")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Akun Terhubung
              </CardTitle>
              <UserCheck className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.linkedEmployees}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {unlinkedEmployees > 0 ? `${unlinkedEmployees} belum terhubung` : "Semua akun aktif terhubung"}
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => navigate("/org/master/work-locations")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Kantor
              </CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOffices}</div>
              <p className="text-xs text-muted-foreground mt-2">Lokasi absensi aktif</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => navigate("/org/reports/attendance")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hadir Hari Ini
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todayPresent}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {attendanceCoveragePct}% cakupan hadir • {format(new Date(), "EEEE, d MMMM yyyy", { locale: id })}
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => navigate("/org/reports/attendance")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Belum Hadir Hari Ini
              </CardTitle>
              <UserX className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayAbsent}</div>
              <p className="text-xs text-muted-foreground mt-2">Perlu pemantauan jam masuk</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => navigate("/org/leave/requests")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pengajuan Pending
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPendingRequests}</div>
              <p className="text-xs text-muted-foreground mt-2">
                Cuti {stats.pendingLeaves} • WFH {stats.pendingWfh} • Lembur {stats.pendingOvertime}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Operational Insight */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tren Kehadiran 7 Hari</CardTitle>
              <CardDescription>Pantau cakupan hadir harian dalam seminggu terakhir</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attendanceTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada data kehadiran 7 hari terakhir.</p>
              ) : (
                attendanceTrend.map((point) => (
                  <div key={point.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{point.label}</span>
                      <span className="font-medium">
                        {point.present}/{stats.totalEmployees} hadir ({point.coveragePct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${point.coveragePct}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performa Persetujuan (30 Hari)</CardTitle>
              <CardDescription>Rata-rata waktu proses pengajuan cuti, WFH, dan lembur</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Rata-rata Proses</p>
                  <p className="text-lg font-semibold">{approvalPerformance.avgApprovalHours} jam</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Request Diproses</p>
                  <p className="text-lg font-semibold">{approvalPerformance.processedCount}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">Disetujui</p>
                  <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                    {approvalPerformance.approvedCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-red-200/60 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10">
                  <p className="text-xs text-red-700 dark:text-red-300">Ditolak</p>
                  <p className="text-lg font-semibold text-red-700 dark:text-red-300">
                    {approvalPerformance.rejectedCount}
                  </p>
                </div>
              </div>

              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-2">Pending saat ini</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Cuti {stats.pendingLeaves}</Badge>
                  <Badge variant="secondary">WFH {stats.pendingWfh}</Badge>
                  <Badge variant="secondary">Lembur {stats.pendingOvertime}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Perlu Perhatian */}
        {(stats.pendingLeaves > 0 || stats.pendingWfh > 0 || stats.pendingOvertime > 0 || stats.expiredInvitations > 0 || unlinkedEmployees > 0 || (subscription?.status === "expired")) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Perlu Perhatian
              </CardTitle>
              <CardDescription>Item yang membutuhkan tindakan segera</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {subscription?.status === "expired" && (
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                  onClick={() => navigate("/org/activation")}
                >
                  <CreditCard className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">
                      Langganan telah berakhir
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70">
                      Perpanjang sekarang untuk melanjutkan layanan
                    </p>
                  </div>
                </div>
              )}
              
              {stats.pendingLeaves > 0 && (
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                  onClick={() => navigate("/org/leave/requests")}
                >
                  <ClipboardList className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {stats.pendingLeaves} pengajuan cuti menunggu
                    </p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
                      Klik untuk mereview
                    </p>
                  </div>
                </div>
              )}

              {stats.pendingWfh > 0 && (
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                  onClick={() => navigate("/org/leave/wfh")}
                >
                  <Users className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      {stats.pendingWfh} pengajuan WFH menunggu
                    </p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                      Klik untuk mereview
                    </p>
                  </div>
                </div>
              )}

              {stats.pendingOvertime > 0 && (
                <div
                  className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors"
                  onClick={() => navigate("/org/leave/overtime")}
                >
                  <Timer className="h-5 w-5 text-purple-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-purple-700 dark:text-purple-400">
                      {stats.pendingOvertime} pengajuan lembur menunggu
                    </p>
                    <p className="text-xs text-purple-600/70 dark:text-purple-400/70">
                      Klik untuk proses persetujuan lembur
                    </p>
                  </div>
                </div>
              )}

              {stats.expiredInvitations > 0 && (
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-500/10 border border-gray-200 dark:border-gray-500/20 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500/20 transition-colors"
                  onClick={() => navigate("/org/invitations")}
                >
                  <UserPlus className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
                      {stats.expiredInvitations} undangan kedaluwarsa
                    </p>
                    <p className="text-xs text-gray-600/70 dark:text-gray-400/70">
                      Perlu dihapus atau diperpanjang
                    </p>
                  </div>
                </div>
              )}

              {unlinkedEmployees > 0 && (
                <div
                  className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                  onClick={() => navigate("/org/employees/active")}
                >
                  <UserCheck className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      {unlinkedEmployees} pegawai belum terhubung akun
                    </p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                      Aktivasi akun agar notifikasi & akses dashboard tersedia
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Menu Cepat
            </CardTitle>
            <CardDescription>Akses fitur-fitur utama dengan cepat</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/org/employees/active")}
              >
                <UserPlus className="h-6 w-6 text-primary" />
                <span>Kelola Pegawai</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/org/master/work-locations")}
              >
                <MapPin className="h-6 w-6 text-primary" />
                <span>Kelola Lokasi</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/org/leave/requests")}
              >
                <ClipboardList className="h-6 w-6 text-primary" />
                <span>Approval Cuti</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/org/reports/attendance")}
              >
                <FileText className="h-6 w-6 text-primary" />
                <span>Laporan Absensi</span>
              </Button>

              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/org/onboarding")}
              >
                <Sparkles className="h-6 w-6 text-primary" />
                <span>Setup Awal</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Informasi Langganan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div
                className="cursor-pointer rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted"
                onClick={() => navigate("/org/activation")}
              >
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={status.variant} className="mt-1">{status.label}</Badge>
              </div>
              <div
                className="cursor-pointer rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted"
                onClick={() => navigate("/org/activation")}
              >
                <p className="text-sm text-muted-foreground">Kebijakan Akses</p>
                <p className="font-semibold mt-1">Streak Monitoring</p>
              </div>
              <div
                className="cursor-pointer rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted"
                onClick={() => navigate("/org/activation")}
              >
                <p className="text-sm text-muted-foreground">Berakhir</p>
                <p className="font-semibold mt-1">
                  {subscription?.end_date 
                    ? format(new Date(subscription.end_date), "d MMMM yyyy", { locale: id })
                    : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* App Download */}
        {apkInfo?.url && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Download className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Aplikasi Absensi</p>
                    <p className="text-sm text-muted-foreground">
                      Versi {apkInfo.version} • Bagikan ke pegawai untuk melakukan absensi
                    </p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => window.open(apkInfo.url, "_blank")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Unduh Aplikasi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <PageGlossarySection preset="org_dashboard" />
      </div>

      {/* Floating Bug Report */}
      {tenantId && (
        <FloatingBugReport
          tenantId={tenantId}
          reporterName={userName}
          reporterRole="admin_organisasi"
        />
      )}

      <Dialog open={isBillingOverlayOpen} onOpenChange={setIsBillingOverlayOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Peringatan Keras Tagihan
            </DialogTitle>
            <DialogDescription>
              Notifikasi ini terkait masa tenggang/grace period pembayaran langganan. Segera tindak lanjuti agar layanan tetap aktif.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {billingAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada notifikasi billing yang belum dibaca.</p>
            ) : (
              billingAlerts.map((row) => {
                const metadata = row.metadata || {};
                const reason = String(metadata.reason || metadata.trigger || "billing_alert").replaceAll("_", " ");
                return (
                  <div key={row.id} className="rounded-lg border border-red-200 bg-red-50/70 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                        {row.title || "Peringatan Tagihan"}
                      </p>
                      <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300">
                        {reason}
                      </Badge>
                    </div>
                    <p className="text-sm text-red-900/80 dark:text-red-200/80">{row.message || "-"}</p>
                    <p className="mt-2 text-xs text-red-700/70 dark:text-red-300/70">
                      {format(new Date(row.created_at), "d MMM yyyy, HH:mm", { locale: id })}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => navigate("/org/notifications")}>
              Lihat Riwayat Notifikasi
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/org/activation")}>
                Buka Aktivasi
              </Button>
              <Button variant="destructive" onClick={() => void markBillingAlertsAsRead()}>
                Tandai Sudah Dibaca
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
