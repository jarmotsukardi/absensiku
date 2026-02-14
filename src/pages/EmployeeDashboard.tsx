import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { useEmployee } from "@/hooks/useEmployee";
import { useAttendance } from "@/hooks/useAttendance";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import { useHolidayCheck } from "@/hooks/useHolidayCheck";
import { useWfhCheck } from "@/hooks/useWfhCheck";
import { useWfhRequests } from "@/hooks/useWfhRequests";
import { AttendanceStats } from "@/components/employee/AttendanceStats";
import { RecentAttendanceList } from "@/components/employee/RecentAttendanceList";
import { QuickActionsCard } from "@/components/employee/QuickActionsCard";
import { WfhRequestForm } from "@/components/employee/WfhRequestForm";
import { WfhRequestList } from "@/components/employee/WfhRequestList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MapPin, 
  LogOut, 
  Menu, 
  X, 
  BarChart3, 
  Calendar, 
  FileText, 
  ChevronRight,
  HelpCircle,
  User as UserIcon,
  Clock,
  CheckCircle2,
  Smartphone,
  Info
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const EmployeeDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) navigate("/auth");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const { employee, office, isLoading: employeeLoading } = useEmployee(user);
  const { todayAttendance, monthlyStats, recentAttendance, isLoading: attendanceLoading } = useAttendance(employee?.id || null, employee?.office_id || null);
  const { leaveRequests, stats: leaveStats } = useLeaveRequests(employee?.id || null);
  const { isHoliday, holidayName, isLoading: holidayLoading } = useHolidayCheck(employee?.tenant_id || null);
  const { isWfhAllowed, wfhDescription, isLoading: wfhLoading } = useWfhCheck(
    employee?.tenant_id || null,
    employee?.id || null,
    employee?.opd_id || null,
    employee?.work_unit_id || null
  );
  const { requests: wfhRequests, stats: wfhStats, isLoading: wfhRequestsLoading, createRequest } = useWfhRequests(employee?.id || null);

  // Check apakah ada leave request yang disetujui untuk hari ini
  const today = new Date().toISOString().split("T")[0];
  const approvedLeaveToday = leaveRequests.find(req => 
    req.status === "disetujui" && 
    req.start_date <= today && 
    req.end_date >= today
  );
  const isOnLeave = !!approvedLeaveToday;
  const leaveType = approvedLeaveToday?.leave_type;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const currentDate = format(new Date(), "EEEE, dd MMMM yyyy", { locale: idLocale });

  if (isLoading || employeeLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <MapPin className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { icon: BarChart3, label: "Dashboard", active: true, href: "/dashboard" },
    { icon: Calendar, label: "Riwayat Absensi", active: false, href: "/dashboard/attendance-history" },
    { icon: FileText, label: "Pengajuan", active: false, href: "/dashboard/leave-requests" },
    { icon: HelpCircle, label: "Bantuan", active: false, href: "/dashboard/help" },
    { icon: UserIcon, label: "Profil", active: false, href: "/dashboard/profile" },
  ];

  // Format time helper
  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    try {
      return format(new Date(timeString), "HH:mm");
    } catch {
      return "--:--";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 glass h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <MapPin className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold">AbsensiKu</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      <aside className={`fixed top-0 left-0 h-full w-64 bg-sidebar z-40 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
              <MapPin className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-sidebar-foreground">AbsensiKu</h1>
              <p className="text-xs text-sidebar-foreground/60">Sistem Absensi GPS</p>
            </div>
          </div>

          <nav className="space-y-1">
            {menuItems.map((item, index) => (
              <button 
                key={index} 
                onClick={() => {
                  navigate(item.href);
                  setSidebarOpen(false);
                }} 
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${item.active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {item.active && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            ))}
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <span className="text-sm font-semibold text-sidebar-foreground">{employee?.name?.charAt(0).toUpperCase() || "U"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{employee?.name || "Pengguna"}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{employee?.position || user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Keluar
          </Button>
        </div>
      </aside>

      <main className="lg:ml-64 pt-20 lg:pt-8 px-4 lg:px-8 pb-8">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">Selamat Datang, {employee?.name || "Pengguna"}!</h1>
          <p className="text-muted-foreground">{currentDate}</p>
        </div>

        {/* Info Banner - Absensi hanya via APK */}
        <Card className="mb-6 border-info/30 bg-info/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5 text-info" />
              </div>
              <div>
                <h4 className="font-medium text-sm">Absensi via Aplikasi</h4>
                <p className="text-sm text-muted-foreground">
                  Untuk melakukan absensi masuk/pulang, gunakan aplikasi resmi Android yang terinstall di perangkat Anda.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Attendance Status - View Only */}
        <Card className="mb-6 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Status Absensi Hari Ini
            </CardTitle>
            <CardDescription>{currentDate}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-4 rounded-xl bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Masuk</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatTime(todayAttendance?.check_in_time)}
                </p>
                {todayAttendance?.check_in_time && (
                  <Badge variant="outline" className="mt-2">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Tercatat
                  </Badge>
                )}
              </div>
              <div className="text-center p-4 rounded-xl bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Pulang</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatTime(todayAttendance?.check_out_time)}
                </p>
                {todayAttendance?.check_out_time && (
                  <Badge variant="outline" className="mt-2">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Tercatat
                  </Badge>
                )}
              </div>
            </div>

            {/* Status badges */}
            {isHoliday && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 mb-3">
                <p className="text-sm text-warning flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  {holidayName || "Hari Libur"}
                </p>
              </div>
            )}

            {isOnLeave && (
              <div className="p-3 rounded-lg bg-info/10 border border-info/20 mb-3">
                <p className="text-sm text-info flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Anda sedang {leaveType === 'cuti_tahunan' ? 'Cuti' : leaveType === 'sakit' ? 'Sakit' : leaveType === 'izin' ? 'Izin' : leaveType || 'Cuti'}
                </p>
              </div>
            )}

            {todayAttendance?.status && (
              <div className="flex items-center justify-center">
                <Badge 
                  variant={todayAttendance.status === 'hadir' ? 'default' : todayAttendance.status === 'terlambat' ? 'secondary' : 'outline'}
                  className="text-sm"
                >
                  {todayAttendance.status === 'hadir' ? 'Hadir' : 
                   todayAttendance.status === 'terlambat' ? 'Terlambat' : 
                   todayAttendance.status}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <AttendanceStats stats={monthlyStats} />

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <QuickActionsCard pendingRequests={leaveStats.pending} />
          <WfhRequestForm onSubmit={createRequest} />
        </div>

        <RecentAttendanceList attendance={recentAttendance} isLoading={attendanceLoading} />
        
        <div className="mt-6">
          <WfhRequestList requests={wfhRequests} isLoading={wfhRequestsLoading} />
        </div>
      </main>
    </div>
  );
};

export default EmployeeDashboard;
