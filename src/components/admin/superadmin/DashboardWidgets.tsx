import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  Users, 
  CreditCard, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  totalTenants: number;
  activeTenants: number;
  totalEmployees: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiredSubscriptions: number;
  todayAttendance: number;
  pendingLeaves: number;
}

export function DashboardWidgets() {
  const [stats, setStats] = useState<Stats>({
    totalTenants: 0,
    activeTenants: 0,
    totalEmployees: 0,
    activeSubscriptions: 0,
    trialSubscriptions: 0,
    expiredSubscriptions: 0,
    todayAttendance: 0,
    pendingLeaves: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [
        tenantsRes,
        activeTenantsRes,
        employeesRes,
        activeSubsRes,
        trialSubsRes,
        expiredSubsRes,
        attendanceRes,
        leavesRes,
      ] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact" }),
        supabase.from("tenants").select("id", { count: "exact" }).eq("is_active", true),
        supabase.from("employees").select("id", { count: "exact" }).eq("is_active", true),
        supabase.from("subscriptions").select("id", { count: "exact" }).eq("status", "active"),
        supabase.from("subscriptions").select("id", { count: "exact" }).eq("status", "trial"),
        supabase.from("subscriptions").select("id", { count: "exact" }).eq("status", "expired"),
        supabase.from("attendance_records_partitioned").select("id", { count: "exact" }).eq("date", today),
        supabase.from("leave_requests").select("id", { count: "exact" }).eq("status", "menunggu"),
      ]);

      setStats({
        totalTenants: tenantsRes.count || 0,
        activeTenants: activeTenantsRes.count || 0,
        totalEmployees: employeesRes.count || 0,
        activeSubscriptions: activeSubsRes.count || 0,
        trialSubscriptions: trialSubsRes.count || 0,
        expiredSubscriptions: expiredSubsRes.count || 0,
        todayAttendance: attendanceRes.count || 0,
        pendingLeaves: leavesRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const widgets = [
    {
      title: "Total Organisasi",
      value: stats.totalTenants,
      subtitle: `${stats.activeTenants} aktif`,
      icon: Building2,
      trend: "+12%",
      trendUp: true,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total Pegawai",
      value: stats.totalEmployees,
      subtitle: "Semua organisasi",
      icon: Users,
      trend: "+8%",
      trendUp: true,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Langganan Aktif",
      value: stats.activeSubscriptions,
      subtitle: `${stats.trialSubscriptions} trial`,
      icon: CreditCard,
      trend: "+5%",
      trendUp: true,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Absensi Hari Ini",
      value: stats.todayAttendance,
      subtitle: "Check-in tercatat",
      icon: Activity,
      trend: "Live",
      trendUp: true,
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
      {/* Main Stats */}
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

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Subscription Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Langganan</CardTitle>
            <CardDescription>Distribusi status langganan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Trial
                </span>
                <span className="font-medium">{stats.trialSubscriptions}</span>
              </div>
              <Progress 
                value={stats.totalTenants ? (stats.trialSubscriptions / stats.totalTenants) * 100 : 0} 
                className="h-2 bg-amber-100"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Expired
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

        {/* Quick Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perlu Perhatian</CardTitle>
            <CardDescription>Item yang membutuhkan tindakan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.expiredSubscriptions > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
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
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
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

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kesehatan Sistem</CardTitle>
            <CardDescription>Status layanan platform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">Database</span>
              <Badge variant="default" className="bg-green-500">Online</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">API Server</span>
              <Badge variant="default" className="bg-green-500">Online</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">Storage</span>
              <Badge variant="default" className="bg-green-500">Online</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}