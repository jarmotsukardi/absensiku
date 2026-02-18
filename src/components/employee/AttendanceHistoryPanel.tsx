import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
  X,
  Filter,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AttendanceRecord {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
  notes: string | null;
}

interface AttendanceHistoryPanelProps {
  employeeId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AttendanceHistoryPanel({ employeeId, isOpen, onClose }: AttendanceHistoryPanelProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchHistory = useCallback(async () => {
    if (!employeeId) return;
    
    setIsLoading(true);
    try {
      const [year, month] = monthFilter.split("-");
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);

      const { data, error } = await supabase
        .from("attendance_records_partitioned")
        .select("id, date, check_in_time, check_out_time, status, notes")
        .eq("employee_id", employeeId)
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0])
        .order("date", { ascending: false });

      if (!error && data) {
        setRecords(data);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, monthFilter]);

  useEffect(() => {
    if (employeeId && isOpen) {
      void fetchHistory();
    }
  }, [employeeId, isOpen, fetchHistory]);

  const filteredRecords = statusFilter === "all" 
    ? records 
    : records.filter(r => r.status === statusFilter);

  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    return new Date(timeString).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      hadir: { label: "Hadir", variant: "default", icon: <CheckCircle2 className="w-3 h-3" /> },
      terlambat: { label: "Terlambat", variant: "secondary", icon: <Clock className="w-3 h-3" /> },
      pulang_cepat: { label: "Pulang Cepat", variant: "secondary", icon: <Clock className="w-3 h-3" /> },
      terlambat_pulang_cepat: { label: "Terlambat & Pulang Cepat", variant: "secondary", icon: <Clock className="w-3 h-3" /> },
      izin: { label: "Izin", variant: "outline", icon: <AlertCircle className="w-3 h-3" /> },
      cuti: { label: "Cuti", variant: "outline", icon: <Calendar className="w-3 h-3" /> },
      sakit: { label: "Sakit", variant: "outline", icon: <AlertCircle className="w-3 h-3" /> },
      tidak_hadir: { label: "Tidak Hadir", variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
      tugas_luar: { label: "Tugas Luar", variant: "outline", icon: <Calendar className="w-3 h-3" /> },
    };

    const config = statusMap[status || "tidak_hadir"] || statusMap.tidak_hadir;
    return (
      <Badge variant={config.variant} className="text-xs gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  // Statistik ringkas
  const stats = {
    hadir: records.filter(r => r.status === "hadir").length,
    terlambat: records.filter(r => r.status === "terlambat" || r.status === "terlambat_pulang_cepat").length,
    izin: records.filter(r => ["izin", "cuti", "sakit", "tugas_luar"].includes(r.status || "")).length,
    tidak_hadir: records.filter(r => r.status === "tidak_hadir").length,
  };

  // Daftar bulan 12 bulan terakhir
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return { 
      value: format(date, "yyyy-MM"), 
      label: format(date, "MMMM yyyy", { locale: id }) 
    };
  });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Riwayat Absensi
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {/* Statistik Ringkas */}
          <div className="grid grid-cols-4 gap-2">
            <Card className="p-2 text-center border-border/50">
              <div className="text-lg font-bold text-green-600">{stats.hadir}</div>
              <div className="text-xs text-muted-foreground">Hadir</div>
            </Card>
            <Card className="p-2 text-center border-border/50">
              <div className="text-lg font-bold text-yellow-600">{stats.terlambat}</div>
              <div className="text-xs text-muted-foreground">Terlambat</div>
            </Card>
            <Card className="p-2 text-center border-border/50">
              <div className="text-lg font-bold text-blue-600">{stats.izin}</div>
              <div className="text-xs text-muted-foreground">Izin</div>
            </Card>
            <Card className="p-2 text-center border-border/50">
              <div className="text-lg font-bold text-red-600">{stats.tidak_hadir}</div>
              <div className="text-xs text-muted-foreground">Absen</div>
            </Card>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="flex-1">
                <Calendar className="w-4 h-4 mr-2" />
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
              <SelectTrigger className="w-[130px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="hadir">Hadir</SelectItem>
                <SelectItem value="terlambat">Terlambat</SelectItem>
                <SelectItem value="izin">Izin</SelectItem>
                <SelectItem value="cuti">Cuti</SelectItem>
                <SelectItem value="sakit">Sakit</SelectItem>
                <SelectItem value="tidak_hadir">Tidak Hadir</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Daftar Kehadiran */}
          <ScrollArea className="h-[calc(100vh-320px)]">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Tidak ada data kehadiran</p>
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                {filteredRecords.map((record) => (
                  <Card 
                    key={record.id} 
                    className="p-3 border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[45px]">
                          <p className="text-xl font-bold">
                            {format(parseISO(record.date), "dd")}
                          </p>
                          <p className="text-xs text-muted-foreground uppercase">
                            {format(parseISO(record.date), "EEE", { locale: id })}
                          </p>
                        </div>
                        <div className="border-l border-border pl-3">
                          <p className="font-medium text-sm">
                            {format(parseISO(record.date), "dd MMMM yyyy", { locale: id })}
                          </p>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(record.check_in_time)}
                            </span>
                            <span>-</span>
                            <span>{formatTime(record.check_out_time)}</span>
                          </div>
                          {record.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {record.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(record.status)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer Info */}
          <div className="text-xs text-center text-muted-foreground pt-2 border-t">
            {filteredRecords.length} record ditampilkan
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Tombol trigger untuk membuka panel
interface AttendanceHistoryButtonProps {
  onClick: () => void;
  className?: string;
}

export function AttendanceHistoryButton({ onClick, className }: AttendanceHistoryButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={className}
    >
      <History className="w-4 h-4 mr-2" />
      Riwayat Absensi
    </Button>
  );
}
