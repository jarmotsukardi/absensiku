import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AttendanceRecord {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
  notes: string | null;
  is_wfh?: boolean;
  shift_id?: string | null;
}

interface AttendanceHistoryWeeklyProps {
  employeeId: string | null;
}

export function AttendanceHistoryWeekly({ employeeId }: AttendanceHistoryWeeklyProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Senin sebagai awal minggu
  );

  // Hitung rentang minggu
  const weekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart]);
  
  // Label minggu
  const weekLabel = useMemo(() => {
    const start = format(currentWeekStart, "d MMM", { locale: idLocale });
    const end = format(weekEnd, "d MMM yyyy", { locale: idLocale });
    return `${start} - ${end}`;
  }, [currentWeekStart, weekEnd]);

  // Navigasi minggu
  const goToPrevWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Cek apakah minggu ini
  const isCurrentWeek = useMemo(() => {
    const today = new Date();
    return today >= currentWeekStart && today <= weekEnd;
  }, [currentWeekStart, weekEnd]);

  // Fetch data
  useEffect(() => {
    if (!employeeId) return;
    
    const fetchWeeklyHistory = async () => {
      setIsLoading(true);
      try {
        const startDate = format(currentWeekStart, "yyyy-MM-dd");
        const endDate = format(weekEnd, "yyyy-MM-dd");

        const { data, error } = await supabase
          .from("attendance_records_partitioned")
          .select("id, date, check_in_time, check_out_time, status, notes, is_wfh, shift_id")
          .eq("employee_id", employeeId)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: true });

        if (!error && data) {
          setRecords(data);
        }
      } catch (error) {
        console.error("Error fetching weekly history:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWeeklyHistory();
  }, [employeeId, currentWeekStart, weekEnd]);

  // Generate 7 hari dalam minggu
  const weekDays = useMemo(() => {
    const days = [];
    let current = currentWeekStart;
    for (let i = 0; i < 7; i++) {
      days.push(addWeeks(current, 0));
      current = new Date(current);
      current.setDate(current.getDate() + 1);
    }
    // Fix: regenerate properly
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(currentWeekStart);
      day.setDate(day.getDate() + i);
      return day;
    });
  }, [currentWeekStart]);

  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    return new Date(timeString).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusConfig = (status: string | null) => {
    const statusMap: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
      hadir: { label: "Hadir", color: "text-green-700", bgColor: "bg-green-100", icon: <CheckCircle2 className="w-3 h-3" /> },
      terlambat: { label: "Terlambat", color: "text-yellow-700", bgColor: "bg-yellow-100", icon: <Clock className="w-3 h-3" /> },
      pulang_cepat: { label: "Pulang Cepat", color: "text-orange-700", bgColor: "bg-orange-100", icon: <Clock className="w-3 h-3" /> },
      terlambat_pulang_cepat: { label: "Terlambat+PC", color: "text-orange-700", bgColor: "bg-orange-100", icon: <Clock className="w-3 h-3" /> },
      izin: { label: "Izin", color: "text-blue-700", bgColor: "bg-blue-100", icon: <AlertCircle className="w-3 h-3" /> },
      cuti: { label: "Cuti", color: "text-purple-700", bgColor: "bg-purple-100", icon: <Calendar className="w-3 h-3" /> },
      sakit: { label: "Sakit", color: "text-pink-700", bgColor: "bg-pink-100", icon: <AlertCircle className="w-3 h-3" /> },
      tidak_hadir: { label: "Tidak Hadir", color: "text-red-700", bgColor: "bg-red-100", icon: <XCircle className="w-3 h-3" /> },
      tugas_luar: { label: "Tugas Luar", color: "text-indigo-700", bgColor: "bg-indigo-100", icon: <Calendar className="w-3 h-3" /> },
    };
    return statusMap[status || "tidak_hadir"] || statusMap.tidak_hadir;
  };

  // Statistik ringkas
  const stats = useMemo(() => ({
    hadir: records.filter(r => r.status === "hadir").length,
    terlambat: records.filter(r => r.status === "terlambat" || r.status === "terlambat_pulang_cepat").length,
    izin: records.filter(r => ["izin", "cuti", "sakit", "tugas_luar"].includes(r.status || "")).length,
    tidak_hadir: records.filter(r => r.status === "tidak_hadir" || !r.check_in_time).length,
  }), [records]);

  return (
    <div className="space-y-4">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={goToPrevWeek}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-sm">{weekLabel}</p>
          {!isCurrentWeek && (
            <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={goToCurrentWeek}>
              Kembali ke minggu ini
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={goToNextWeek} disabled={isCurrentWeek}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Statistik Ringkas */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2 text-center border-border/50">
          <div className="text-lg font-bold text-green-600">{stats.hadir}</div>
          <div className="text-[10px] text-muted-foreground">Hadir</div>
        </Card>
        <Card className="p-2 text-center border-border/50">
          <div className="text-lg font-bold text-yellow-600">{stats.terlambat}</div>
          <div className="text-[10px] text-muted-foreground">Terlambat</div>
        </Card>
        <Card className="p-2 text-center border-border/50">
          <div className="text-lg font-bold text-blue-600">{stats.izin}</div>
          <div className="text-[10px] text-muted-foreground">Izin</div>
        </Card>
        <Card className="p-2 text-center border-border/50">
          <div className="text-lg font-bold text-red-600">{stats.tidak_hadir}</div>
          <div className="text-[10px] text-muted-foreground">Absen</div>
        </Card>
      </div>

      {/* Daftar Harian */}
      <ScrollArea className="h-[320px]">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {weekDays.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const record = records.find(r => r.date === dateStr);
              const isToday = isSameDay(day, new Date());
              const isFutureDay = day > new Date();
              const statusConfig = record ? getStatusConfig(record.status) : null;

              return (
                <Card 
                  key={dateStr} 
                  className={`p-3 border-border/50 transition-colors ${isToday ? 'ring-2 ring-primary/50 bg-primary/5' : ''} ${isFutureDay ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`text-center min-w-[40px] p-2 rounded-lg ${isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        <p className="text-lg font-bold leading-none">
                          {format(day, "dd")}
                        </p>
                        <p className="text-[10px] uppercase mt-0.5">
                          {format(day, "EEE", { locale: idLocale })}
                        </p>
                      </div>
                      
                      {isFutureDay ? (
                        <p className="text-sm text-muted-foreground">-</p>
                      ) : record ? (
                        <div>
                          <div className="flex gap-2 text-xs">
                            <span className="flex items-center gap-1 text-green-600">
                              <Clock className="w-3 h-3" />
                              {formatTime(record.check_in_time)}
                            </span>
                            <span className="text-muted-foreground">-</span>
                            <span className="text-red-600">
                              {formatTime(record.check_out_time)}
                            </span>
                          </div>
                          {record.is_wfh && (
                            <Badge variant="outline" className="text-[10px] mt-1 px-1 py-0">WFH</Badge>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Belum ada data</p>
                      )}
                    </div>
                    
                    {!isFutureDay && statusConfig && (
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${statusConfig.bgColor} ${statusConfig.color}`}>
                        {statusConfig.icon}
                        <span className="hidden sm:inline">{statusConfig.label}</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="text-xs text-center text-muted-foreground pt-2 border-t">
        <History className="w-3 h-3 inline mr-1" />
        {records.length} record minggu ini
      </div>
    </div>
  );
}
