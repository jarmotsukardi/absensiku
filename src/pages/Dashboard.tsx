import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AttendanceHistoryPanel } from "@/components/employee/AttendanceHistoryPanel";
import { 
  MapPin, 
  Clock, 
  LogOut, 
  CheckCircle2, 
  XCircle, 
  Calendar,
  Users,
  Building2,
  FileText,
  BarChart3,
  Settings,
  Menu,
  X,
  ChevronRight,
  AlertCircle,
  User as UserIcon,
  History,
  Send,
  HelpCircle
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  
  // Employee data
  const [employee, setEmployee] = useState<any>(null);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session?.user) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchEmployeeData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchEmployeeData = async (userId: string) => {
    try {
      // Fetch employee
      const { data: empData } = await supabase
        .from("employees")
        .select("*, offices(name, address), tenants(name, code)")
        .eq("user_id", userId)
        .maybeSingle();
      
      setEmployee(empData);

      if (empData) {
        // Fetch today's attendance
        const today = format(new Date(), "yyyy-MM-dd");
        const { data: attendance } = await supabase
          .from("attendance_records_partitioned")
          .select("*")
          .eq("employee_id", empData.id)
          .eq("date", today)
          .maybeSingle();
        
        setTodayAttendance(attendance);

        // Fetch attendance history (last 30 days)
        const thirtyDaysAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
        const { data: history } = await supabase
          .from("attendance_records_partitioned")
          .select("*")
          .eq("employee_id", empData.id)
          .gte("date", thirtyDaysAgo)
          .order("date", { ascending: false })
          .limit(30);
        
        setAttendanceHistory(history || []);

        // Fetch leave requests
        const { data: leaves } = await supabase
          .from("leave_requests")
          .select("*")
          .eq("employee_id", empData.id)
          .order("created_at", { ascending: false })
          .limit(10);
        
        setLeaveRequests(leaves || []);
      }
    } catch (error) {
      console.error("Error fetching employee data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const currentDate = format(new Date(), "EEEE, dd MMMM yyyy", { locale: idLocale });

  if (isLoading) {
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

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      hadir: { label: "Hadir", variant: "default" },
      terlambat: { label: "Terlambat", variant: "secondary" },
      izin: { label: "Izin", variant: "outline" },
      cuti: { label: "Cuti", variant: "outline" },
      sakit: { label: "Sakit", variant: "outline" },
      tidak_hadir: { label: "Tidak Hadir", variant: "destructive" },
    };
    const s = statusMap[status] || { label: status, variant: "secondary" };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  const menuItems = [
    { icon: BarChart3, label: "Dashboard", value: "dashboard" },
    { icon: History, label: "Riwayat Absensi", value: "history", isPanel: true },
    { icon: Send, label: "Pengajuan", value: "requests" },
    { icon: HelpCircle, label: "Bantuan", value: "help" },
    { icon: UserIcon, label: "Profil", value: "profile" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
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

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-sidebar z-40 transform transition-transform duration-300
        lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
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
            {menuItems.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  if (item.value === "history") {
                    // Buka panel sidebar kanan untuk riwayat absensi
                    setHistoryPanelOpen(true);
                    setSidebarOpen(false);
                  } else {
                    setActiveTab(item.value);
                    setSidebarOpen(false);
                  }
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                  ${(item.value === "history" ? historyPanelOpen : activeTab === item.value)
                    ? "bg-sidebar-accent text-sidebar-primary" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {(item.value === "history" ? historyPanelOpen : activeTab === item.value) && (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* User Info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <span className="text-sm font-semibold text-sidebar-foreground">
                {employee?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {employee?.name || "Pengguna"}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Keluar
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 pt-20 lg:pt-8 px-4 lg:px-8 pb-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
            Selamat Datang, {employee?.name || "Pengguna"}!
          </h1>
          <p className="text-muted-foreground">{currentDate}</p>
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {attendanceHistory.filter(a => a.status === 'hadir').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Hari Hadir</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {attendanceHistory.filter(a => a.status === 'terlambat').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Terlambat</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-info" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {attendanceHistory.filter(a => ['cuti', 'izin'].includes(a.status)).length}
                      </p>
                      <p className="text-xs text-muted-foreground">Cuti/Izin</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {attendanceHistory.filter(a => a.status === 'tidak_hadir').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Tidak Hadir</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Today's Attendance Status */}
            <div className="grid lg:grid-cols-2 gap-6 mb-8">
              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="bg-primary text-primary-foreground pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Status Absensi Hari Ini
                  </CardTitle>
                  <CardDescription className="text-primary-foreground/70">
                    {currentDate}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-4 rounded-xl bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Masuk</p>
                      <p className="text-2xl font-bold text-foreground">
                        {todayAttendance?.check_in_time 
                          ? format(new Date(todayAttendance.check_in_time), "HH:mm")
                          : "--:--"}
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
                        {todayAttendance?.check_out_time 
                          ? format(new Date(todayAttendance.check_out_time), "HH:mm")
                          : "--:--"}
                      </p>
                      {todayAttendance?.check_out_time && (
                        <Badge variant="outline" className="mt-2">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Tercatat
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-info/10 border border-info/20">
                    <p className="text-sm text-info flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Untuk melakukan absensi masuk/pulang, gunakan aplikasi mobile resmi.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Aksi Cepat</CardTitle>
                  <CardDescription>Ajukan izin, cuti, atau lihat riwayat</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-auto py-4"
                    onClick={() => setActiveTab("requests")}
                  >
                    <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center mr-4">
                      <FileText className="w-5 h-5 text-info" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold">Ajukan Izin/Cuti</p>
                      <p className="text-sm text-muted-foreground">Izin, sakit, cuti, atau keperluan lain</p>
                    </div>
                    <ChevronRight className="w-5 h-5 ml-auto text-muted-foreground" />
                  </Button>

                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-auto py-4"
                    onClick={() => setActiveTab("history")}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mr-4">
                      <BarChart3 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold">Riwayat Absensi</p>
                      <p className="text-sm text-muted-foreground">Lihat rekap kehadiran</p>
                    </div>
                    <ChevronRight className="w-5 h-5 ml-auto text-muted-foreground" />
                  </Button>

                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-auto py-4"
                    onClick={() => setActiveTab("profile")}
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center mr-4">
                      <UserIcon className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold">Profil Saya</p>
                      <p className="text-sm text-muted-foreground">Lihat dan edit data profil</p>
                    </div>
                    <ChevronRight className="w-5 h-5 ml-auto text-muted-foreground" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Requests Tab */}
        {activeTab === "requests" && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Pengajuan Izin/Cuti</CardTitle>
              <CardDescription>Daftar pengajuan Anda</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {leaveRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada pengajuan</p>
                ) : (
                  leaveRequests.map((request) => (
                    <div 
                      key={request.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-info" />
                        </div>
                        <div>
                          <p className="font-medium capitalize">{request.leave_type.replace("_", " ")}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(request.start_date), "dd MMM")} - {format(new Date(request.end_date), "dd MMM yyyy")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={
                        request.status === "disetujui" ? "default" :
                        request.status === "ditolak" ? "destructive" : "secondary"
                      }>
                        {request.status === "menunggu" ? "Menunggu" :
                         request.status === "disetujui" ? "Disetujui" : "Ditolak"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help Tab */}
        {activeTab === "help" && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Pusat Bantuan</CardTitle>
              <CardDescription>Pertanyaan yang sering ditanyakan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/30 border">
                <h4 className="font-semibold mb-2">Bagaimana cara melakukan absensi?</h4>
                <p className="text-sm text-muted-foreground">
                  Download aplikasi APK resmi dari halaman organisasi, lalu login dengan akun yang sama. Pastikan GPS aktif dan berada dalam radius kantor.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border">
                <h4 className="font-semibold mb-2">Mengapa absensi saya gagal?</h4>
                <p className="text-sm text-muted-foreground">
                  Pastikan: (1) GPS aktif dan akurat, (2) Berada dalam radius kantor, (3) Koneksi internet stabil, (4) Menggunakan APK resmi.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border">
                <h4 className="font-semibold mb-2">Bagaimana mengajukan cuti/izin?</h4>
                <p className="text-sm text-muted-foreground">
                  Klik menu "Pengajuan" di sidebar, pilih jenis izin, isi tanggal dan alasan, lalu kirim. Admin akan memproses pengajuan Anda.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border">
                <h4 className="font-semibold mb-2">Bagaimana jika saya ganti HP?</h4>
                <p className="text-sm text-muted-foreground">
                  Hubungi admin untuk reset Device ID Anda. Setelah direset, Anda bisa login dari HP baru.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-info/10 border border-info/20">
                <h4 className="font-semibold mb-2">Butuh bantuan lebih?</h4>
                <p className="text-sm text-muted-foreground">
                  Hubungi admin organisasi Anda jika mengalami kendala dalam penggunaan sistem absensi.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Profil Pegawai</CardTitle>
              <CardDescription>Informasi data diri Anda</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-3xl font-bold text-primary">
                      {employee?.name?.charAt(0).toUpperCase() || "?"}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{employee?.name || "-"}</h3>
                    <p className="text-muted-foreground">{employee?.position || "-"}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">NIK</p>
                    <p className="font-medium">{employee?.nik || "-"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">NIP</p>
                    <p className="font-medium">{employee?.nip || "-"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{employee?.email || "-"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">No. HP / WhatsApp</p>
                    <p className="font-medium">{employee?.phone || employee?.whatsapp || "-"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">Organisasi</p>
                    <p className="font-medium">{employee?.tenants?.name || "-"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">Kantor</p>
                    <p className="font-medium">{employee?.offices?.name || "-"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30 sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Alamat</p>
                    <p className="font-medium">{employee?.address || "-"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Attendance History Panel */}
      <AttendanceHistoryPanel
        employeeId={employee?.id || null}
        isOpen={historyPanelOpen}
        onClose={() => setHistoryPanelOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
