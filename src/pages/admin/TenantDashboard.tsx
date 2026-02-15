import { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  Users, 
  MapPin,
  Calendar,
  Clock,
  LogOut,
  Settings,
  FileText,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Home,
  ClipboardList,
  Download
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { id } from "date-fns/locale";

interface TenantInfo {
  id: string;
  name: string;
  code: string;
  organization_type: string;
  email: string | null;
}

interface SubscriptionInfo {
  status: string;
  max_employees: number;
  start_date: string | null;
  end_date: string | null;
}

interface ApkInfo {
  url: string;
  version: string;
  updated_at: string;
}

interface DashboardStats {
  totalEmployees: number;
  totalOffices: number;
  todayPresent: number;
  pendingLeaves: number;
}

export default function TenantDashboard() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    totalOffices: 0,
    todayPresent: 0,
    pendingLeaves: 0,
  });
  const [userName, setUserName] = useState("");
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/org/login");
        return;
      }

      // Check if user is admin_instansi
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id)
        .in("role", ["admin_instansi", "super_admin"])
        .single();

      if (!roleData) {
        toast.error("Akses ditolak. Anda bukan Admin.");
        navigate("/org/login");
        return;
      }

      // If super_admin, redirect to super admin dashboard
      if (roleData.role === "super_admin") {
        navigate("/admin");
        return;
      }

      // Fetch tenant info
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", roleData.tenant_id)
        .single();

      if (tenantData) {
        setTenant(tenantData);
      }

      // Fetch subscription
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", roleData.tenant_id)
        .single();

      if (subData) {
        setSubscription(subData);
      }

      // Fetch employee info for name
      const { data: empData } = await supabase
        .from("employees")
        .select("name")
        .eq("user_id", user.id)
        .single();

      if (empData) {
        setUserName(empData.name);
      }

      // Fetch stats
      const today = new Date().toISOString().split('T')[0];

      const [employeesRes, officesRes, attendanceRes, leavesRes, apkSettings] = await Promise.all([
        supabase
          .from("employees")
          .select("id", { count: "exact" })
          .eq("tenant_id", roleData.tenant_id)
          .eq("is_active", true),
        supabase
          .from("offices")
          .select("id", { count: "exact" })
          .eq("tenant_id", roleData.tenant_id)
          .eq("is_active", true),
        supabase
          .from("attendance_records_partitioned")
          .select("id", { count: "exact" })
          .eq("date", today),
        supabase
          .from("leave_requests")
          .select("id", { count: "exact" })
          .eq("status", "menunggu"),
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "apk_settings")
          .maybeSingle(),
      ]);

      setStats({
        totalEmployees: employeesRes.count || 0,
        totalOffices: officesRes.count || 0,
        todayPresent: attendanceRes.count || 0,
        pendingLeaves: leavesRes.count || 0,
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
      console.error("Error fetching dashboard:", error);
      toast.error("Gagal memuat data dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/org/login");
  };

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

  const getOrganizationTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      pemerintah_daerah: "Pemerintah Daerah",
      instansi_pemerintah: "Instansi Pemerintah",
      perusahaan: "Perusahaan",
      sekolah: "Sekolah/Pendidikan",
    };
    return types[type] || type;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const status = getSubscriptionStatus();
  const daysRemaining = getDaysRemaining();
  const employeeUsage = getEmployeeUsagePercent();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{tenant?.name || "Dashboard"}</h1>
                <p className="text-sm text-muted-foreground">
                  {tenant?.organization_type && getOrganizationTypeLabel(tenant.organization_type)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status.variant}>{status.label}</Badge>
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/settings")}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Welcome & Trial Warning */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">Selamat datang, {userName}!</h2>
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
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
                    Upgrade Sekarang
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                onClick={() => navigate("/admin/master/employees")}
              >
                <UserPlus className="h-6 w-6 text-primary" />
                <span>Kelola Pegawai</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/admin/master/offices")}
              >
                <MapPin className="h-6 w-6 text-primary" />
                <span>Kelola Kantor</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/admin/leave-approvals")}
              >
                <ClipboardList className="h-6 w-6 text-primary" />
                <span>Approval Cuti</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/admin/reports")}
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
      </main>
    </div>
  );
}
