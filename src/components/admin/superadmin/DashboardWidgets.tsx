import { useEffect, useState } from "react";
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
}

export function DashboardWidgets() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
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
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const nowIso = new Date().toISOString();
      const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
      ] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact" }),
        supabase.from("tenants").select("id", { count: "exact" }).eq("is_active", true),
        supabase.from("employees").select("id", { count: "exact" }).eq("is_active", true),
        supabase.from("subscriptions").select("id", { count: "exact" }).eq("status", "active"),
        supabase.from("subscriptions").select("id", { count: "exact" }).eq("status", "trial"),
        supabase.from("subscriptions").select("id", { count: "exact" }).eq("status", "expired"),
        supabase.from("attendance_records_partitioned").select("id", { count: "exact" }).eq("date", today),
        supabase.from("leave_requests").select("id", { count: "exact" }).eq("status", "menunggu"),
        supabase.from("stability_streaks").select("id", { count: "exact" }).eq("status", "ready_for_invoicing"),
        supabase.from("invoices").select("id", { count: "exact" }).eq("status", "PENDING"),
        supabase.from("invoices").select("id", { count: "exact" }).eq("status", "AWAITING_VERIFICATION"),
        supabase
          .from("invoices")
          .select("id", { count: "exact" })
          .in("status", ["PENDING", "AWAITING_VERIFICATION"])
          .lt("due_date", today),
        supabase
          .from("cron_job_logs")
          .select("id", { count: "exact" })
          .gte("started_at", dayAgoIso)
          .or("status.ilike.%fail%,status.ilike.%error%"),
        supabase.from("feedback_reports").select("id", { count: "exact" }).eq("status", "open"),
        supabase.from("feedback_reports").select("id", { count: "exact" }).eq("status", "open").eq("feedback_type", "bug"),
        supabase.from("rate_limit_otp").select("id", { count: "exact" }).gt("locked_until", nowIso),
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
        readyForInvoicing: readyForInvoicingRes.count || 0,
        pendingInvoices: (pendingInvoicesRes.count || 0) + (awaitingInvoicesRes.count || 0),
        overdueInvoices: overdueInvoicesRes.count || 0,
        failedCronRuns24h: failedCronRunsRes.count || 0,
        openFeedbacks: openFeedbackRes.count || 0,
        openBugs: openBugsRes.count || 0,
        lockedOtpUsers: lockedOtpRes.count || 0,
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

        {/* Streak & Billing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Streak & Billing</CardTitle>
            <CardDescription>Status billing berbasis streak</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Ready for invoicing
              </span>
              <Badge variant="outline">{stats.readyForInvoicing}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-500" />
                Invoice pending
              </span>
              <Badge variant="outline">{stats.pendingInvoices}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Invoice overdue
              </span>
              <Badge variant={stats.overdueInvoices > 0 ? "destructive" : "outline"}>{stats.overdueInvoices}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Operations & Security */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operasional & Security</CardTitle>
            <CardDescription>Monitoring cron, feedback, dan lock login</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-500" />
                Cron gagal (24 jam)
              </span>
              <Badge variant={stats.failedCronRuns24h > 0 ? "destructive" : "outline"}>{stats.failedCronRuns24h}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-500" />
                Feedback terbuka
              </span>
              <Badge variant="outline">{stats.openFeedbacks} ({stats.openBugs} bug)</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                OTP lock aktif
              </span>
              <Badge variant={stats.lockedOtpUsers > 0 ? "destructive" : "outline"}>{stats.lockedOtpUsers}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aksi Cepat Super Admin</CardTitle>
            <CardDescription>Pintasan ke area prioritas operasional</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/streak-monitoring")}>
              <Flame className="h-4 w-4 mr-2" />
              Buka Streak Monitoring
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/billing")}>
              <CreditCard className="h-4 w-4 mr-2" />
              Review Billing
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/cron-jobs")}>
              <Wrench className="h-4 w-4 mr-2" />
              Cek Cron Jobs
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/feedback")}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Kelola Feedback & Bug
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/attendance-security")}>
              <ShieldAlert className="h-4 w-4 mr-2" />
              Validasi Keamanan
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
