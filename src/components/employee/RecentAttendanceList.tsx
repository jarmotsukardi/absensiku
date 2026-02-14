import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tables } from "@/integrations/supabase/types";
import { Clock, MapPin, CheckCircle2, XCircle, AlertCircle, Home, Timer, LogOut } from "lucide-react";

type AttendanceRecord = Tables<"attendance_records">;

interface RecentAttendanceListProps {
  attendance: AttendanceRecord[];
  isLoading: boolean;
}

// Helper function untuk menentukan keterangan kehadiran
const getKeterangan = (record: AttendanceRecord): string => {
  const status = record.status;
  const hasCheckIn = !!record.check_in_time;
  const hasCheckOut = !!record.check_out_time;

  // Jika tidak ada check in sama sekali
  if (!hasCheckIn) {
    if (status === "izin") return "Izin";
    if (status === "cuti") return "Cuti";
    if (status === "sakit") return "Sakit";
    if (status === "tugas_luar") return "Tugas Luar";
    return "Tidak Hadir";
  }

  // Jika ada check in tapi tidak ada check out
  if (hasCheckIn && !hasCheckOut) {
    if (status === "terlambat") return "Telat";
    return "Tidak Absen Pulang";
  }

  // Jika sudah check in dan check out
  if (status === "terlambat_pulang_cepat") return "Telat + Pulang Cepat";
  if (status === "terlambat") return "Telat";
  if (status === "pulang_cepat") return "Pulang Cepat";
  if (status === "hadir") return "Hadir";

  return status || "-";
};

const getKeteranganStyle = (keterangan: string): { class: string; icon: React.ReactNode } => {
  const styles: Record<string, { class: string; icon: React.ReactNode }> = {
    "Hadir": { 
      class: "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400",
      icon: <CheckCircle2 className="w-3 h-3" />
    },
    "Telat": { 
      class: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
      icon: <Timer className="w-3 h-3" />
    },
    "Pulang Cepat": { 
      class: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400",
      icon: <LogOut className="w-3 h-3" />
    },
    "Telat + Pulang Cepat": { 
      class: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
      icon: <AlertCircle className="w-3 h-3" />
    },
    "Tidak Absen Pulang": { 
      class: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
      icon: <Clock className="w-3 h-3" />
    },
    "Izin": { 
      class: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
      icon: <AlertCircle className="w-3 h-3" />
    },
    "Cuti": { 
      class: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400",
      icon: <Home className="w-3 h-3" />
    },
    "Sakit": { 
      class: "bg-pink-500/10 text-pink-700 border-pink-500/30 dark:text-pink-400",
      icon: <AlertCircle className="w-3 h-3" />
    },
    "Tugas Luar": { 
      class: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-400",
      icon: <MapPin className="w-3 h-3" />
    },
    "Tidak Hadir": { 
      class: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
      icon: <XCircle className="w-3 h-3" />
    },
  };

  return styles[keterangan] || { class: "bg-muted text-muted-foreground", icon: <Clock className="w-3 h-3" /> };
};

export function RecentAttendanceList({ attendance, isLoading }: RecentAttendanceListProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    return new Date(timeString).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Aktivitas Terbaru</CardTitle>
          <CardDescription>Riwayat 7 hari terakhir</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
                <div className="h-6 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Aktivitas Terbaru</CardTitle>
        <CardDescription>Riwayat 7 hari terakhir</CardDescription>
      </CardHeader>
      <CardContent>
        {attendance.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada riwayat absensi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attendance.map((record) => {
              const keterangan = getKeterangan(record);
              const style = getKeteranganStyle(keterangan);
              return (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-foreground">{formatDate(record.date)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatTime(record.check_in_time)} - {formatTime(record.check_out_time)}
                    </p>
                  </div>
                  <Badge variant="outline" className={`${style.class} flex items-center gap-1`}>
                    {style.icon}
                    {keterangan}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
