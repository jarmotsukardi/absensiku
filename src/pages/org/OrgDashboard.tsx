import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  MapPin,
  Clock,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  UserPlus,
  ClipboardList,
  FileText,
  Calendar,
  Download,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { id } from "date-fns/locale";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OverdueRequestsOverlay } from "@/components/org/OverdueRequestsOverlay";
import { StabilityStreakWidget } from "@/components/dashboard/StabilityStreakWidget";
import { FloatingBugReport } from "@/components/common/FloatingBugReport";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface SubscriptionInfo {
  id: string;
  status: string;
  max_employees: number;
  start_date: string | null;
  end_date: string | null;
}

interface DashboardStats {
  totalEmployees: number;
  totalOffices: number;
  todayPresent: number;
  pendingLeaves: number;
  pendingWfh: number;
  expiredInvitations: number;
}

interface ApkInfo {
  url: string;
  version: string;
  updated_at: string;
}

const DASHBOARD_FETCH_TIMEOUT_MS = 15000;
const DASHBOARD_LOADING_WATCHDOG_MS = 25000;
const ORG_ACTIVE_TENANT_STORAGE_KEY = "org_active_tenant_id";

export default function OrgDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenant_id");
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    totalOffices: 0,
    todayPresent: 0,
    pendingLeaves: 0,
    pendingWfh: 0,
    expiredInvitations: 0,
  });
  const [userName, setUserName] = useState("");
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);

  const fetchDashboardData = useCallback(async () => {
    let resolvedTenantIdForLog: string | null = null;
    try {
      const cachedTenantId = (() => {
        try {
          return sessionStorage.getItem(ORG_ACTIVE_TENANT_STORAGE_KEY);
        } catch {
          return null;
        }
      })();

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
      let resolvedTenantId = cachedTenantId;

      if (!resolvedTenantId || queryTenantId) {
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
      }
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
            .maybeSingle()
        ),
        DASHBOARD_FETCH_TIMEOUT_MS,
        "Timeout membaca data langganan organisasi"
      );
      if (subError) throw subError;

      if (subData) {
        setSubscription(subData);
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
              .maybeSingle()
          ),
          DASHBOARD_FETCH_TIMEOUT_MS,
          "Timeout membaca profil admin organisasi"
        );
        if (empDataError) throw empDataError;
        if (empData?.name) {
          setUserName(empData.name);
        }
      }

      // Fetch stats
      const today = new Date().toISOString().split('T')[0];
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
      if (officeRowsError) throw officeRowsError;
      const officeIds = (officeRows || []).map((row) => row.id);
      const attendancePromise = officeIds.length > 0
        ? supabase
          .from("attendance_records_partitioned")
          .select("id", { count: "exact", head: true })
          .in("office_id", officeIds)
          .eq("date", today)
        : Promise.resolve({ count: 0 as number | null, error: null });

      const [employeesRes, officesRes, attendanceRes, leavesRes, wfhRes, invitationsRes, apkSettings] = await withTimeout(
        Promise.all([
          supabase
            .from("employees")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("is_active", true),
          supabase
            .from("offices")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("is_active", true),
          attendancePromise,
          supabase
            .from("leave_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("status", "menunggu"),
          supabase
            .from("wfh_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", resolvedTenantId)
            .eq("status", "pending"),
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

      if (
        employeesRes.error ||
        officesRes.error ||
        attendanceRes.error ||
        leavesRes.error ||
        wfhRes.error ||
        invitationsRes.error ||
        apkSettings.error
      ) {
        throw (
          employeesRes.error ||
          officesRes.error ||
          attendanceRes.error ||
          leavesRes.error ||
          wfhRes.error ||
          invitationsRes.error ||
          apkSettings.error
        );
      }

      setStats({
        totalEmployees: employeesRes.count || 0,
        totalOffices: officesRes.count || 0,
        todayPresent: attendanceRes.count || 0,
        pendingLeaves: leavesRes.count || 0,
        pendingWfh: wfhRes.count || 0,
        expiredInvitations: invitationsRes.count || 0,
      });

      // Set APK info
      if (apkSettings?.data?.value && typeof apkSettings.data.value === 'object') {
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
      });
      toast.error(appendErrorReference("Gagal memuat data dashboard", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [navigate, queryTenantId]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

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

  const getEmployeeUsagePercent = () => {
    if (!subscription?.max_employees) return 0;
    return Math.min(100, (stats.totalEmployees / subscription.max_employees) * 100);
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
  const employeeUsage = getEmployeeUsagePercent();

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Pegawai
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Kuota terpakai</span>
                  <span>{stats.totalEmployees}/{subscription?.max_employees || 0}</span>
                </div>
                <Progress value={employeeUsage} className="h-1.5" />
              </div>
            </CardContent>
          </Card>

          <Card>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hadir Hari Ini
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todayPresent}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {format(new Date(), "EEEE, d MMMM yyyy", { locale: id })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pengajuan Pending
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingLeaves}</div>
              <p className="text-xs text-muted-foreground mt-2">Menunggu persetujuan</p>
            </CardContent>
          </Card>
        </div>

        {/* Perlu Perhatian */}
        {(stats.pendingLeaves > 0 || stats.pendingWfh > 0 || stats.expiredInvitations > 0 || (subscription?.status === "expired")) && (
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={status.variant} className="mt-1">{status.label}</Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Maksimal Pegawai</p>
                <p className="font-semibold mt-1">{subscription?.max_employees || 0} orang</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
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
      </div>

      {/* Floating Bug Report */}
      {tenantId && (
        <FloatingBugReport
          tenantId={tenantId}
          reporterName={userName}
          reporterRole="admin_organisasi"
        />
      )}
    </OrganizationLayout>
  );
}
