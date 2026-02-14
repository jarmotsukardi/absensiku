import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEmployee } from "@/hooks/useEmployee";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tables } from "@/integrations/supabase/types";
import { format, endOfMonth, subMonths, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  MapPin,
  AlertCircle,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type AttendanceRecord = Tables<"attendance_records">;

export default function DashboardAttendanceHistory() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [filteredAttendance, setFilteredAttendance] = useState<AttendanceRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) navigate("/auth");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const { employee } = useEmployee(user);

  useEffect(() => {
    if (!employee?.id) return;

    const fetchAttendance = async () => {
      const [year, month] = monthFilter.split("-");
      const startDate = format(new Date(parseInt(year), parseInt(month) - 1, 1), "yyyy-MM-dd");
      const endDate = format(endOfMonth(new Date(parseInt(year), parseInt(month) - 1)), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("attendance_records_partitioned")
        .select("*")
        .eq("employee_id", employee.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (!error && data) {
        setAttendance(data);
        setFilteredAttendance(data);
      }
    };

    fetchAttendance();
  }, [employee?.id, monthFilter]);

  useEffect(() => {
    let filtered = [...attendance];

    if (statusFilter !== "all") {
      filtered = filtered.filter((record) => record.status === statusFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter((record) =>
        record.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.date.includes(searchQuery)
      );
    }

    setFilteredAttendance(filtered);
  }, [statusFilter, searchQuery, attendance]);

  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    return new Date(timeString).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: Record<string, { label: string; class: string }> = {
      hadir: { label: "Hadir", class: "status-hadir" },
      terlambat: { label: "Terlambat", class: "status-terlambat" },
      pulang_cepat: { label: "Pulang Cepat", class: "status-terlambat" },
      izin: { label: "Izin", class: "status-izin" },
      cuti: { label: "Cuti", class: "status-cuti" },
      sakit: { label: "Sakit", class: "status-sakit" },
      tidak_hadir: { label: "Tidak Hadir", class: "status-tidak-hadir" },
      tugas_luar: { label: "Tugas Luar", class: "status-izin" },
    };

    const { label, class: className } = statusMap[status || "tidak_hadir"] || statusMap.tidak_hadir;
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  const stats = {
    hadir: attendance.filter((r) => r.status === "hadir").length,
    terlambat: attendance.filter((r) => r.status === "terlambat").length,
    izin: attendance.filter((r) => ["izin", "cuti", "sakit"].includes(r.status || "")).length,
    tidak_hadir: attendance.filter((r) => r.status === "tidak_hadir").length,
  };

  const months = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, "yyyy-MM"), label: format(date, "MMMM yyyy", { locale: id }) };
  });

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

  return (
    <DashboardLayout title="Riwayat Kehadiran" subtitle="Rekap absensi Anda">
      <div className="max-w-5xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.hadir}</p>
                  <p className="text-xs text-muted-foreground">Hadir</p>
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
                  <p className="text-2xl font-bold">{stats.terlambat}</p>
                  <p className="text-xs text-muted-foreground">Terlambat</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.izin}</p>
                  <p className="text-xs text-muted-foreground">Izin/Cuti</p>
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
                  <p className="text-2xl font-bold">{stats.tidak_hadir}</p>
                  <p className="text-xs text-muted-foreground">Tidak Hadir</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari berdasarkan catatan atau tanggal..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="hadir">Hadir</SelectItem>
                  <SelectItem value="terlambat">Terlambat</SelectItem>
                  <SelectItem value="izin">Izin</SelectItem>
                  <SelectItem value="cuti">Cuti</SelectItem>
                  <SelectItem value="sakit">Sakit</SelectItem>
                  <SelectItem value="tidak_hadir">Tidak Hadir</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Attendance List */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Daftar Kehadiran</CardTitle>
            <CardDescription>{filteredAttendance.length} record ditemukan</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredAttendance.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Tidak ada data kehadiran untuk periode ini</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAttendance.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[60px]">
                        <p className="text-2xl font-bold text-foreground">
                          {format(parseISO(record.date), "dd")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(record.date), "EEE", { locale: id })}
                        </p>
                      </div>
                      <div className="border-l border-border pl-4">
                        <p className="font-medium text-foreground">
                          {format(parseISO(record.date), "dd MMMM yyyy", { locale: id })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Masuk: {formatTime(record.check_in_time)} | Pulang: {formatTime(record.check_out_time)}
                        </p>
                        {record.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{record.notes}</p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(record.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
