import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import { PendingState } from "@/hooks/useAttendance";
import { type SyncStats } from "@/hooks/useAttendanceSync";
import { useDeviceBinding } from "@/hooks/useDeviceBinding";
import { getQueueMessageInfo, generateAdaptiveJitter } from "@/lib/attendanceResilience";
import {
  MapPin,
  Clock,
  CheckCircle2,
  Navigation,
  AlertCircle,
  Loader2,
  XCircle,
  Timer,
  Smartphone,
  ShieldAlert,
  WifiOff,
  Wifi,
  Database,
  CloudOff,
  Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AttendanceRecord = Tables<"attendance_records">;
type Office = Tables<"offices">;

interface AttendanceCardProps {
  todayAttendance: AttendanceRecord | null;
  office: Office | null;
  isSubmitting: boolean;
  pendingState?: PendingState;
  onCheckIn: (lat: number, lng: number, office: Office) => Promise<{ success: boolean; message: string; distance?: number }>;
  onCheckOut: (lat: number, lng: number, office: Office) => Promise<{ success: boolean; message: string; distance?: number }>;
  isHoliday?: boolean;
  holidayName?: string | null;
  isWfhAllowed?: boolean;
  employeeId?: string | null;
  // New props for offline-first
  isOnline?: boolean;
  wasOffline?: boolean;
  syncStats?: SyncStats;
}

export function AttendanceCard({
  todayAttendance,
  office,
  isSubmitting,
  pendingState = { status: 'idle', type: null, message: '' },
  onCheckIn,
  onCheckOut,
  isHoliday = false,
  holidayName = null,
  isWfhAllowed = false,
  employeeId = null,
  isOnline = true,
  wasOffline = false,
  syncStats,
}: AttendanceCardProps) {
  const { toast } = useToast();
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [canAttend, setCanAttend] = useState<boolean | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState<string>("");
  const [currentJitterMs, setCurrentJitterMs] = useState<number>(0);
  
  // Device binding hook
  const deviceBinding = useDeviceBinding(employeeId);

  // Simulate jitter timing for queue message demo
  useEffect(() => {
    const jitterMs = generateAdaptiveJitter();
    setCurrentJitterMs(jitterMs);
  }, []);

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Check if user can attend based on current location
  useEffect(() => {
    const checkAttendanceEligibility = () => {
      if (isHoliday) {
        setCanAttend(false);
        setAttendanceMessage(`Hari Libur: ${holidayName || "Hari ini libur"}`);
        return;
      }
      if (!office && !isWfhAllowed) {
        setCanAttend(false);
        setAttendanceMessage("Kantor belum dikonfigurasi");
        return;
      }
      if (!navigator.geolocation) {
        setCanAttend(false);
        setAttendanceMessage("Browser tidak mendukung GPS");
        return;
      }
      if (isWfhAllowed && !office) {
        setCanAttend(true);
        setAttendanceMessage("Mode Work From Home aktif");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          if (isWfhAllowed) {
            setCanAttend(true);
            setAttendanceMessage("Mode Work From Home aktif - lokasi tercatat");
            return;
          }
          if (!office) return;
          const distance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
          const maxRadius = office.radius_meters || 100;
          if (distance <= maxRadius) {
            setCanAttend(true);
            setAttendanceMessage(`Dalam radius kantor (${Math.round(distance)}m)`);
          } else {
            setCanAttend(false);
            setAttendanceMessage(`Di luar radius kantor (${Math.round(distance)}m dari ${maxRadius}m)`);
          }
        },
        () => {
          if (isWfhAllowed) {
            setCanAttend(true);
            setAttendanceMessage("Mode Work From Home aktif");
          } else {
            setCanAttend(false);
            setAttendanceMessage("Gagal mendapatkan lokasi GPS");
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };

    checkAttendanceEligibility();
    const interval = setInterval(checkAttendanceEligibility, 30000);
    return () => clearInterval(interval);
  }, [office, isHoliday, holidayName, isWfhAllowed]);

  const getCurrentLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolokasi tidak didukung browser ini"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  };

  const handleCheckIn = async () => {
    if (deviceBinding.isEnabled && !deviceBinding.isDeviceValid && !deviceBinding.isFirstTime) {
      toast({
        variant: "destructive",
        title: "Perangkat Tidak Dikenali",
        description: "Android ID Anda tidak sesuai dengan perangkat terdaftar. Silakan reset device di menu profil.",
      });
      return;
    }
    if (!office) {
      toast({ variant: "destructive", title: "Gagal", description: "Data kantor tidak ditemukan. Hubungi admin." });
      return;
    }
    setIsGettingLocation(true);
    try {
      const position = await getCurrentLocation();
      const { latitude, longitude } = position.coords;
      setCurrentLocation({ lat: latitude, lng: longitude });
      if (deviceBinding.isEnabled && deviceBinding.isFirstTime) {
        await deviceBinding.registerDevice();
      }
      const result = await onCheckIn(latitude, longitude, office);
      if (result.success) {
        toast({ title: "Absensi Masuk Berhasil", description: `${result.message} (${result.distance}m dari kantor)` });
        setCanAttend(true);
      } else {
        toast({ variant: "destructive", title: "Absensi Gagal", description: result.message });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal Mendapatkan Lokasi", description: error instanceof Error ? error.message : "Silakan aktifkan GPS dan coba lagi." });
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleCheckOut = async () => {
    if (!office) {
      toast({ variant: "destructive", title: "Gagal", description: "Data kantor tidak ditemukan. Hubungi admin." });
      return;
    }
    setIsGettingLocation(true);
    try {
      const position = await getCurrentLocation();
      const { latitude, longitude } = position.coords;
      setCurrentLocation({ lat: latitude, lng: longitude });
      const result = await onCheckOut(latitude, longitude, office);
      if (result.success) {
        toast({ title: "Absensi Pulang Berhasil", description: `${result.message} (${result.distance}m dari kantor)` });
      } else {
        toast({ variant: "destructive", title: "Absensi Gagal", description: result.message });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal Mendapatkan Lokasi", description: error instanceof Error ? error.message : "Silakan aktifkan GPS dan coba lagi." });
    } finally {
      setIsGettingLocation(false);
    }
  };

  const currentDate = new Date().toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    return new Date(timeString).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const hasCheckedIn = !!todayAttendance?.check_in_time;
  const hasCheckedOut = !!todayAttendance?.check_out_time;
  const isProcessing = isGettingLocation || isSubmitting;

  const getStatusBadge = () => {
    if (!todayAttendance) return null;
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
    const status = todayAttendance.status || "tidak_hadir";
    const { label, class: className } = statusMap[status] || statusMap.tidak_hadir;
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  // Sync status indicator badge
  const getSyncIndicator = () => {
    if (pendingState.status === 'idle' && (!syncStats || syncStats.pendingCount === 0)) return null;

    // Synced to server = GREEN
    if (pendingState.syncStatus === 'synced' || pendingState.status === 'success') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <Cloud className="w-3.5 h-3.5" />
          <span>Sudah tercatat di server</span>
        </div>
      );
    }

    // Pending/Queue = YELLOW
    if (pendingState.syncStatus === 'pending' || pendingState.status === 'buffered' || pendingState.status === 'jitter') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Database className="w-3.5 h-3.5 animate-pulse" />
          <span>Tersimpan di perangkat, menunggu sinkronisasi</span>
        </div>
      );
    }

    // Syncing = BLUE
    if (pendingState.syncStatus === 'syncing' || pendingState.status === 'processing') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Sedang disinkronkan ke server</span>
        </div>
      );
    }

    // Failed = RED
    if (pendingState.syncStatus === 'failed' || pendingState.status === 'error') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <CloudOff className="w-3.5 h-3.5" />
          <span>Sinkronisasi belum berhasil, akan dicoba ulang</span>
        </div>
      );
    }

    // Background pending
    if (syncStats && syncStats.pendingCount > 0) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Database className="w-3.5 h-3.5" />
          <span>{syncStats.pendingCount} data menunggu sinkronisasi</span>
        </div>
      );
    }

    return null;
  };

  // Attendance eligibility indicator
  const AttendanceIndicator = () => {
    if (deviceBinding.isEnabled && !deviceBinding.isLoading && !deviceBinding.isDeviceValid && !deviceBinding.isFirstTime) {
      return (
        <div className="mb-4 p-3 rounded-lg flex items-center gap-2 border bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400">
          <Smartphone className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="text-sm font-medium">Perangkat Tidak Dikenali</span>
            <p className="text-xs opacity-80">Android ID tidak sesuai. Reset device di menu profil.</p>
          </div>
        </div>
      );
    }
    if (canAttend === null || deviceBinding.isLoading) {
      return (
        <div className="mb-4 p-3 rounded-lg bg-muted/50 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Memeriksa lokasi & perangkat...</span>
        </div>
      );
    }
    return (
      <div className={cn(
        "mb-4 p-3 rounded-lg flex items-center gap-2 border",
        canAttend 
          ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400" 
          : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
      )}>
        {canAttend ? (
          <>
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="text-sm font-medium">Siap Absen</span>
              <p className="text-xs opacity-80">{attendanceMessage}</p>
              {deviceBinding.isEnabled && deviceBinding.isFirstTime && (
                <p className="text-xs opacity-60 mt-1">Perangkat ini akan didaftarkan saat absen pertama</p>
              )}
            </div>
          </>
        ) : (
          <>
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="text-sm font-medium">Belum Bisa Absen</span>
              <p className="text-xs opacity-80">{attendanceMessage}</p>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="bg-primary text-primary-foreground pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Absensi Hari Ini
          </CardTitle>
          {/* Online/Offline Indicator */}
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
            isOnline 
              ? "bg-green-500/20 text-green-200" 
              : "bg-red-500/20 text-red-200"
          )}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? "Online" : "Offline"}
          </div>
        </div>
        <CardDescription className="text-primary-foreground/70">
          {currentDate}
        </CardDescription>
      </CardHeader>
       <CardContent className="p-6">
         {/* Offline Banner */}
         {!isOnline && (
           <div className="mb-4 p-3 rounded-lg border bg-amber-500/10 border-amber-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
             <div className="flex items-center gap-2">
               <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />
               <div>
                 <p className="font-medium text-sm text-amber-700 dark:text-amber-300">Mode Offline</p>
                 <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                   Anda tetap bisa absen. Data akan tersimpan di perangkat dan otomatis disinkronkan saat koneksi kembali.
                 </p>
               </div>
             </div>
           </div>
         )}

         {/* Queue Density Banner - Integrated with Resilience */}
         {(() => {
           const queueInfo = getQueueMessageInfo(currentJitterMs);
           if (queueInfo.show) {
             return (
               <div className="mb-4 p-3 rounded-lg border bg-amber-500/10 border-amber-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
                 <div className="flex items-center gap-2">
                   <Timer className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse" />
                   <div>
                     <p className="font-medium text-sm text-amber-700 dark:text-amber-300">Antrean Sistem Padat</p>
                     <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                       {queueInfo.message}
                     </p>
                   </div>
                 </div>
               </div>
             );
           }
           return null;
         })()}

         {/* Reconnected Banner */}
         {wasOffline && isOnline && (
          <div className="mb-4 p-3 rounded-lg border bg-green-500/10 border-green-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium text-sm text-green-700 dark:text-green-300">Koneksi Kembali</p>
                <p className="text-xs text-green-600/80 dark:text-green-400/80">
                  Menyinkronkan data yang tertunda...
                </p>
              </div>
            </div>
          </div>
        )}

        {syncStats && syncStats.stalePendingCount > 0 && (
          <div className="mb-4 p-3 rounded-lg border bg-red-500/10 border-red-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-red-700 dark:text-red-300">
                  Sinkronisasi absensi tertunda terlalu lama
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                  {syncStats.stalePendingCount} data belum tercatat final di server
                  {typeof syncStats.oldestPendingAgeMinutes === "number" && ` selama sekitar ${syncStats.oldestPendingAgeMinutes} menit`}.
                  Pastikan koneksi stabil dan jangan hapus data aplikasi sebelum sinkronisasi selesai.
                  {syncStats.staleWarningRef && ` (Ref: ${syncStats.staleWarningRef})`}
                </p>
              </div>
            </div>
          </div>
        )}

         {/* Pending Status Banner */}
        {pendingState.status !== 'idle' && (
          <div className={cn(
            "mb-4 p-4 rounded-lg border animate-in fade-in slide-in-from-top-2 duration-300",
            (pendingState.status === 'buffered' || pendingState.status === 'jitter') && "bg-amber-500/10 border-amber-500/30",
            pendingState.status === 'processing' && "bg-blue-500/10 border-blue-500/30",
            pendingState.status === 'success' && "bg-green-500/10 border-green-500/30",
            (pendingState.status === 'error' || pendingState.status === 'circuit_open') && "bg-red-500/10 border-red-500/30"
          )}>
            <div className="flex items-center gap-3">
              {(pendingState.status === 'buffered' || pendingState.status === 'jitter') && (
                <div className="relative">
                  <Database className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                </div>
              )}
              {pendingState.status === 'processing' && (
                <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              )}
              {pendingState.status === 'success' && (
                <Cloud className="w-5 h-5 text-green-600 dark:text-green-400" />
              )}
              {(pendingState.status === 'error' || pendingState.status === 'circuit_open') && (
                <CloudOff className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <div className="flex-1">
                {/* Queue Message - tampil saat jitter padat / circuit open */}
                {(pendingState.status === 'jitter' || pendingState.status === 'circuit_open') && (() => {
                  const jitterMs = pendingState.jitterMs || 0;
                  const queueInfo = getQueueMessageInfo(jitterMs);
                  if (queueInfo.show || pendingState.status === 'circuit_open') {
                    return (
                      <div>
                        <p className="font-medium text-sm text-amber-700 dark:text-amber-300">
                          Antrean sistem sedang padat
                        </p>
                        <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                          Data Anda aman tersimpan di perangkat dan sedang mengantre untuk dikirim
                          {queueInfo.show && ` (Estimasi: ${queueInfo.estimatedSeconds} detik)`}. Status ini belum final sampai server mengonfirmasi.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <p className="font-medium text-sm text-amber-700 dark:text-amber-300">
                      {pendingState.message}
                    </p>
                  );
                })()}
                {pendingState.status === 'buffered' && (
                  <div>
                    <p className="font-medium text-sm text-amber-700 dark:text-amber-300">
                      {pendingState.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pendingState.detail || "Status ini belum final. Data akan otomatis dikirim ke server."}
                    </p>
                  </div>
                )}
                {pendingState.status === 'processing' && (
                  <div>
                    <p className="font-medium text-sm text-blue-700 dark:text-blue-300">
                      {pendingState.message}
                    </p>
                    {pendingState.detail && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {pendingState.detail}
                      </p>
                    )}
                  </div>
                )}
                {pendingState.status === 'success' && (
                  <div>
                    <p className="font-medium text-sm text-green-700 dark:text-green-300">
                      {pendingState.message}
                    </p>
                    {pendingState.detail && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {pendingState.detail}
                      </p>
                    )}
                  </div>
                )}
                {pendingState.status === 'error' && (
                  <div>
                    <p className="font-medium text-sm text-red-700 dark:text-red-300">
                      {pendingState.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pendingState.detail || "Data masih tersimpan di perangkat dan akan dicoba ulang otomatis."}
                    </p>
                  </div>
                )}
                {pendingState.retryCount && pendingState.retryCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Percobaan ke-{pendingState.retryCount}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sync Status Indicator */}
        {getSyncIndicator() && (
          <div className="mb-3 flex justify-center">
            {getSyncIndicator()}
          </div>
        )}

        {/* Attendance Eligibility Indicator */}
        <AttendanceIndicator />

        {/* Office Info */}
        {office && (
          <div className="mb-4 p-3 rounded-lg bg-muted/50 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span className="font-medium">{office.name}</span>
              <span className="text-xs">({office.radius_meters || 100}m radius)</span>
            </div>
          </div>
        )}

        {!office && (
          <div className="mb-4 p-3 rounded-lg bg-warning/10 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-warning" />
            <span className="text-warning">Kantor belum diatur. Hubungi admin.</span>
          </div>
        )}

        {/* Status Badge */}
        {todayAttendance && pendingState.status === 'idle' && (
          <div className="mb-4 flex justify-center">
            {getStatusBadge()}
          </div>
        )}

        {/* Check-in/Check-out Times */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center p-4 rounded-xl bg-muted/50">
            <p className="text-sm text-muted-foreground mb-1">Masuk</p>
            <p className="text-2xl font-bold text-foreground">
              {formatTime(todayAttendance?.check_in_time || null)}
            </p>
            {hasCheckedIn && (
              <Badge variant="outline" className={cn(
                "mt-2",
                // YELLOW for pending/queue
                (pendingState.type === 'check_in' && (pendingState.syncStatus === 'pending' || pendingState.status === 'buffered' || pendingState.status === 'jitter'))
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400" 
                  // BLUE for syncing
                  : (pendingState.type === 'check_in' && pendingState.status === 'processing')
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
                    // GREEN for synced
                    : "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
              )}>
                {pendingState.type === 'check_in' && pendingState.status !== 'success' && pendingState.status !== 'idle' ? (
                  pendingState.syncStatus === 'pending' || pendingState.status === 'buffered' || pendingState.status === 'jitter' ? (
                    <>
                      <Database className="w-3 h-3 mr-1" />
                      Di Perangkat
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Syncing
                    </>
                  )
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Tercatat
                  </>
                )}
              </Badge>
            )}
          </div>
          <div className="text-center p-4 rounded-xl bg-muted/50">
            <p className="text-sm text-muted-foreground mb-1">Pulang</p>
            <p className="text-2xl font-bold text-foreground">
              {formatTime(todayAttendance?.check_out_time || null)}
            </p>
            {hasCheckedOut && (
              <Badge variant="outline" className={cn(
                "mt-2",
                (pendingState.type === 'check_out' && (pendingState.syncStatus === 'pending' || pendingState.status === 'buffered' || pendingState.status === 'jitter'))
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400" 
                  : (pendingState.type === 'check_out' && pendingState.status === 'processing')
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
                    : "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
              )}>
                {pendingState.type === 'check_out' && pendingState.status !== 'success' && pendingState.status !== 'idle' ? (
                  pendingState.syncStatus === 'pending' || pendingState.status === 'buffered' || pendingState.status === 'jitter' ? (
                    <>
                      <Database className="w-3 h-3 mr-1" />
                      Di Perangkat
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Syncing
                    </>
                  )
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Tercatat
                  </>
                )}
              </Badge>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <Button
            className={cn(
              "w-full transition-all",
              !hasCheckedIn && canAttend && "bg-green-600 hover:bg-green-700",
              !hasCheckedIn && canAttend === false && "bg-red-600 hover:bg-red-700"
            )}
            size="lg"
            variant={hasCheckedIn ? "secondary" : "default"}
            disabled={hasCheckedIn || isProcessing || !office || pendingState.status !== 'idle'}
            onClick={handleCheckIn}
          >
            {isProcessing && !hasCheckedIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memproses...
              </>
            ) : hasCheckedIn ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Sudah Absen Masuk
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4" />
                Absen Masuk
              </>
            )}
          </Button>

          <Button
            className={cn(
              "w-full transition-all",
              hasCheckedIn && !hasCheckedOut && canAttend && "border-green-600 text-green-600 hover:bg-green-50",
              hasCheckedIn && !hasCheckedOut && canAttend === false && "border-red-600 text-red-600 hover:bg-red-50"
            )}
            size="lg"
            variant={hasCheckedOut ? "secondary" : "outline"}
            disabled={!hasCheckedIn || hasCheckedOut || isProcessing || !office || pendingState.status !== 'idle'}
            onClick={handleCheckOut}
          >
            {isProcessing && hasCheckedIn && !hasCheckedOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memproses...
              </>
            ) : hasCheckedOut ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Sudah Absen Pulang
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                Absen Pulang
              </>
            )}
          </Button>
        </div>

        {/* Current Location */}
        {currentLocation && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>
                Lokasi: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
