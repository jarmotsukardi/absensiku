import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import {
  saveAttendanceEntry,
  updateEntryStatus,
  hasCheckInToday,
  hasCheckOutToday,
  cacheTodayRecord,
  getCachedTodayRecord,
  type AttendanceEntry,
} from "@/lib/attendanceDB";
import {
  generateAdaptiveJitter,
  delayWithAbort,
  withExponentialBackoff,
  withTimeout,
  getAdaptiveTimeout,
  canMakeRequest,
  recordSuccess,
  recordFailure,
  isRetryableError,
  isPeakHours,
  getQueueMessageInfo,
} from "@/lib/attendanceResilience";
import { useAttendanceSync } from "./useAttendanceSync";

type AttendanceRecord = Tables<"attendance_records">;
type Office = Tables<"offices">;

interface AttendanceStats {
  hadir: number;
  terlambat: number;
  pulang_cepat: number;
  terlambat_pulang_cepat: number;
  izin: number;
  cuti: number;
  sakit: number;
  tidak_hadir: number;
  tugas_luar: number;
}

// Status pending untuk optimistic UI
export type PendingStatus = 'idle' | 'buffered' | 'jitter' | 'processing' | 'success' | 'error' | 'circuit_open';

export interface PendingState {
  status: PendingStatus;
  type: 'check_in' | 'check_out' | null;
  message: string;
  jitterMs?: number;
  retryCount?: number;
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'; // IndexedDB sync status
}

// ==================== RPC SYNC LOGIC ====================

interface RpcResult {
  success: boolean;
  id?: string;
  status?: string;
  check_in_time?: string;
  check_out_time?: string;
  message: string;
  error?: string;
}

async function syncCheckInToServer(entry: AttendanceEntry, retryCount: number = 0): Promise<RpcResult> {
  const timeout = getAdaptiveTimeout(retryCount);
  const rpcCall = supabase.rpc('process_check_in', {
    p_employee_id: entry.employeeId,
    p_office_id: entry.officeId,
    p_latitude: entry.latitude,
    p_longitude: entry.longitude,
    p_distance_meters: entry.distanceMeters,
    p_date: entry.date,
  });

  const { data, error } = await withTimeout(
    Promise.resolve(rpcCall),
    timeout,
    'Koneksi ke server timeout'
  );

  if (error) throw error;
  return data as unknown as RpcResult;
}

async function syncCheckOutToServer(entry: AttendanceEntry, retryCount: number = 0): Promise<RpcResult> {
  const timeout = getAdaptiveTimeout(retryCount);
  const rpcCall = supabase.rpc('process_check_out', {
    p_employee_id: entry.employeeId,
    p_office_id: entry.officeId,
    p_latitude: entry.latitude,
    p_longitude: entry.longitude,
    p_distance_meters: entry.distanceMeters,
    p_date: entry.date,
  });

  const { data, error } = await withTimeout(
    Promise.resolve(rpcCall),
    timeout,
    'Koneksi ke server timeout'
  );

  if (error) throw error;
  return data as unknown as RpcResult;
}

// Build optimistic record from IndexedDB entry
function entryToOptimisticRecord(entry: AttendanceEntry): AttendanceRecord {
  return {
    id: entry.serverRecordId || `idb-${entry.bufferId}`,
    employee_id: entry.employeeId,
    office_id: entry.officeId,
    date: entry.date,
    check_in_time: entry.type === 'check_in' ? entry.timestamp : null,
    check_in_latitude: entry.type === 'check_in' ? entry.latitude : null,
    check_in_longitude: entry.type === 'check_in' ? entry.longitude : null,
    check_in_distance_meters: entry.type === 'check_in' ? entry.distanceMeters : null,
    check_out_time: entry.type === 'check_out' ? entry.timestamp : null,
    check_out_latitude: entry.type === 'check_out' ? entry.latitude : null,
    check_out_longitude: entry.type === 'check_out' ? entry.longitude : null,
    check_out_distance_meters: entry.type === 'check_out' ? entry.distanceMeters : null,
    status: 'hadir',
    notes: null,
    is_corrected: false,
    is_wfh: false,
    created_at: entry.createdAt,
    updated_at: entry.createdAt,
    shift_id: null,
    original_shift_id: null,
    shift_changed_at: null,
    shift_change_reason: null,
    flexible_attendance_reason: null,
    is_flexible_attendance: false,
  };
}

// ==================== MAIN HOOK ====================

export function useAttendance(employeeId: string | null, officeId: string | null) {
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<AttendanceStats>({
    hadir: 0, terlambat: 0, pulang_cepat: 0, terlambat_pulang_cepat: 0,
    izin: 0, cuti: 0, sakit: 0, tidak_hadir: 0, tugas_luar: 0,
  });
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingState, setPendingState] = useState<PendingState>({
    status: 'idle', type: null, message: '',
  });

  const abortRef = useRef<AbortController | null>(null);
  const today = new Date().toISOString().split("T")[0];

  // Background sync hook (re-hydration, online detection, auto-sync)
  const { syncStats, isOnline, wasOffline } = useAttendanceSync(employeeId);

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // ==================== RE-HYDRATION: Instant load dari IndexedDB cache ====================
  useEffect(() => {
    if (!employeeId) return;
    const loadCache = async () => {
      const cached = await getCachedTodayRecord(employeeId);
      if (cached) setTodayAttendance(cached);
    };
    loadCache();
  }, [employeeId]);

  // ==================== FETCH ====================
  const fetchAttendance = useCallback(async () => {
    if (!employeeId) return;

    try {
      setIsLoading(true);

      const { data: todayData, error: todayError } = await supabase
        .from("attendance_records_partitioned")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("date", today)
        .maybeSingle();

      if (!todayError) {
        setTodayAttendance(todayData);
        await cacheTodayRecord(employeeId, todayData);
      }

      // Monthly stats via RPC
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const monthStart = startOfMonth.toISOString().split("T")[0];

      const { data: statsData, error: statsError } = await supabase
        .rpc('get_monthly_stats', {
          p_employee_id: employeeId,
          p_month_start: monthStart,
        });

      if (!statsError && statsData && statsData.length > 0) {
        const s = statsData[0];
        setMonthlyStats({
          hadir: Number(s.hadir) || 0,
          terlambat: Number(s.terlambat) || 0,
          pulang_cepat: Number(s.pulang_cepat) || 0,
          terlambat_pulang_cepat: Number(s.terlambat_pulang_cepat) || 0,
          izin: Number(s.izin) || 0,
          cuti: Number(s.cuti) || 0,
          sakit: Number(s.sakit) || 0,
          tidak_hadir: Number(s.tidak_hadir) || 0,
          tugas_luar: Number(s.tugas_luar) || 0,
        });
      } else {
        // Fallback
        const { data: monthlyData } = await supabase
          .from("attendance_records_partitioned")
          .select("status")
          .eq("employee_id", employeeId)
          .gte("date", monthStart)
          .lte("date", today);

        if (monthlyData) {
          const stats: AttendanceStats = {
            hadir: 0, terlambat: 0, pulang_cepat: 0, terlambat_pulang_cepat: 0,
            izin: 0, cuti: 0, sakit: 0, tidak_hadir: 0, tugas_luar: 0,
          };
          monthlyData.forEach((r) => {
            if (r.status && r.status in stats) stats[r.status as keyof AttendanceStats]++;
          });
          setMonthlyStats(stats);
        }
      }

      // Recent 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekStart = sevenDaysAgo.toISOString().split("T")[0];

      const { data: recentData, error: recentError } = await supabase
        .from("attendance_records_partitioned")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("date", weekStart)
        .order("date", { ascending: false });

      if (!recentError && recentData) setRecentAttendance(recentData);
    } catch (error) {
      console.error("Error fetching attendance:", error);
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, today]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // Re-fetch when sync completes
  useEffect(() => {
    if (syncStats.lastSyncAt && syncStats.syncedCount > 0) {
      fetchAttendance();
    }
  }, [syncStats.lastSyncAt, syncStats.syncedCount, fetchAttendance]);

  // ==================== HAVERSINE ====================
  const calculateDistance = (
    lat1: number, lon1: number, lat2: number, lon2: number
  ): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ==================== SYNC WITH RESILIENCE ====================
  const syncWithResilience = async (
    entry: AttendanceEntry,
    type: 'check_in' | 'check_out',
    signal: AbortSignal
  ): Promise<RpcResult> => {
    return withExponentialBackoff(
      async () => {
        return type === 'check_in'
          ? syncCheckInToServer(entry, entry.syncAttempts)
          : syncCheckOutToServer(entry, entry.syncAttempts);
      },
      {
        maxRetries: 3,
        signal,
        shouldRetry: isRetryableError,
        onRetry: (attempt, delayMs) => {
          setPendingState({
            status: 'processing',
            type,
            message: `Mencoba ulang (${attempt}/3)...`,
            retryCount: attempt,
            syncStatus: 'syncing',
          });
        },
      }
    );
  };

  // ==================== CHECK-IN ====================
  const checkIn = async (
    latitude: number, longitude: number, office: Office
  ): Promise<{ success: boolean; message: string; distance?: number }> => {
    if (!employeeId || !officeId) {
      setPendingState({ status: 'error', type: 'check_in', message: 'Data pegawai tidak lengkap' });
      return { success: false, message: "Data pegawai tidak lengkap" };
    }

    if (todayAttendance?.check_in_time) {
      return { success: false, message: "Anda sudah melakukan absen masuk hari ini" };
    }

    const existingBuffer = await hasCheckInToday(employeeId);
    if (existingBuffer && existingBuffer.syncStatus !== 'failed') {
      return { success: false, message: "Absen masuk sedang diproses" };
    }

    // Circuit Breaker check (3 failures = open)
    const cbCheck = canMakeRequest();
    if (!cbCheck.allowed) {
      setPendingState({ status: 'circuit_open', type: 'check_in', message: cbCheck.reason || 'Server sibuk', syncStatus: 'pending' });
      return { success: false, message: cbCheck.reason || 'Server sedang sibuk, coba lagi nanti' };
    }

    // Validasi jarak
    const distance = calculateDistance(latitude, longitude, Number(office.latitude), Number(office.longitude));
    const radiusLimit = office.radius_meters || 100;
    if (distance > radiusLimit) {
      return {
        success: false,
        message: `Anda berada di luar radius kantor (${Math.round(distance)}m, maks ${radiusLimit}m)`,
        distance,
      };
    }

    // SAVE TO INDEXEDDB FIRST (instant, < 5ms)
    const now = new Date();
    const entry = await saveAttendanceEntry({
      employeeId,
      officeId,
      date: today,
      type: 'check_in',
      latitude,
      longitude,
      distanceMeters: Math.round(distance),
      timestamp: now.toISOString(),
    });

    const optimisticRecord = entryToOptimisticRecord(entry);
    setTodayAttendance(optimisticRecord);
    await cacheTodayRecord(employeeId, optimisticRecord);

    setPendingState({ status: 'buffered', type: 'check_in', message: 'Data absensi tersimpan di perangkat', syncStatus: 'pending' });
    setIsSubmitting(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // ADAPTIVE JITTER
    const jitterMs = generateAdaptiveJitter(0);
    const peakInfo = isPeakHours() ? ' (jam sibuk)' : '';
    setPendingState({
      status: 'jitter',
      type: 'check_in',
      message: `Menghubungkan ke server${peakInfo}...`,
      jitterMs,
      syncStatus: 'pending',
    });

    try {
      await delayWithAbort(jitterMs, signal);
    } catch {
      setIsSubmitting(false);
      setPendingState({ status: 'buffered', type: 'check_in', message: 'Tersimpan di perangkat, akan disinkronkan otomatis', syncStatus: 'pending' });
      return { success: true, message: "Absen masuk tersimpan (sinkronisasi tertunda)" };
    }

    // RPC SYNC
    setPendingState({ status: 'processing', type: 'check_in', message: 'Menyimpan ke server...', syncStatus: 'syncing' });
    await updateEntryStatus(entry.bufferId, { syncStatus: 'syncing' });

    try {
      const result = await syncWithResilience(entry, 'check_in', signal);

      if (!result.success) {
        await updateEntryStatus(entry.bufferId, {
          syncStatus: 'failed', syncAttempts: 1,
          lastSyncAttempt: now.toISOString(), syncError: result.message,
        });
        recordFailure();
        setPendingState({ status: 'error', type: 'check_in', message: result.message, syncStatus: 'failed' });
        setTimeout(() => setPendingState({ status: 'idle', type: null, message: '' }), 5000);
        return { success: false, message: result.message };
      }

      // Success
      await updateEntryStatus(entry.bufferId, {
        syncStatus: 'synced', serverRecordId: result.id || null,
        lastSyncAttempt: now.toISOString(),
      });
      recordSuccess();

      const confirmedRecord: AttendanceRecord = {
        ...optimisticRecord,
        id: result.id!,
        status: (result.status as AttendanceRecord['status']) || 'hadir',
        check_in_time: result.check_in_time || now.toISOString(),
      };
      setTodayAttendance(confirmedRecord);
      await cacheTodayRecord(employeeId, confirmedRecord);

      setPendingState({ status: 'success', type: 'check_in', message: result.message, syncStatus: 'synced' });
      setTimeout(() => setPendingState({ status: 'idle', type: null, message: '' }), 3000);

      fetchAttendance();
      return { success: true, message: result.message, distance };

    } catch (error: any) {
      console.error("[IndexedDB] Check-in sync failed:", error);

      await updateEntryStatus(entry.bufferId, {
        syncStatus: 'failed', syncAttempts: 1,
        lastSyncAttempt: new Date().toISOString(),
        syncError: error?.message || 'Unknown error',
      });
      recordFailure();

      const isTimeout = error?.message?.includes('timeout');
      const msg = isTimeout
        ? 'Timeout, absensi tersimpan di perangkat dan akan disinkronkan otomatis.'
        : 'Gagal sinkronisasi, data aman di perangkat. Akan dicoba ulang otomatis.';

      setPendingState({ status: 'error', type: 'check_in', message: msg, syncStatus: 'failed' });
      setTimeout(() => setPendingState({ status: 'idle', type: null, message: '' }), 5000);

      return { success: true, message: msg, distance };
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================== CHECK-OUT ====================
  const checkOut = async (
    latitude: number, longitude: number, office: Office
  ): Promise<{ success: boolean; message: string; distance?: number }> => {
    if (!employeeId || !todayAttendance?.id) {
      return { success: false, message: "Belum melakukan absen masuk" };
    }

    if (todayAttendance.id.startsWith('idb-') || todayAttendance.id.startsWith('buffer-') || todayAttendance.id.startsWith('pending-')) {
      const bufferCheckIn = await hasCheckInToday(employeeId);
      if (bufferCheckIn && bufferCheckIn.syncStatus !== 'synced') {
        return { success: false, message: "Absen masuk masih menunggu sinkronisasi" };
      }
    }

    if (todayAttendance.check_out_time) {
      return { success: false, message: "Anda sudah melakukan absen pulang hari ini" };
    }

    const existingBuffer = await hasCheckOutToday(employeeId);
    if (existingBuffer && existingBuffer.syncStatus !== 'failed') {
      return { success: false, message: "Absen pulang sedang diproses" };
    }

    // Circuit Breaker
    const cbCheck = canMakeRequest();
    if (!cbCheck.allowed) {
      setPendingState({ status: 'circuit_open', type: 'check_out', message: cbCheck.reason || 'Server sibuk', syncStatus: 'pending' });
      return { success: false, message: cbCheck.reason || 'Server sedang sibuk, coba lagi nanti' };
    }

    // Validasi jarak
    const distance = calculateDistance(latitude, longitude, Number(office.latitude), Number(office.longitude));
    const radiusLimit = office.radius_meters || 100;
    if (distance > radiusLimit) {
      return {
        success: false,
        message: `Anda berada di luar radius kantor (${Math.round(distance)}m, maks ${radiusLimit}m)`,
        distance,
      };
    }

    // SAVE TO INDEXEDDB FIRST
    const now = new Date();
    const entry = await saveAttendanceEntry({
      employeeId,
      officeId: officeId!,
      date: today,
      type: 'check_out',
      latitude,
      longitude,
      distanceMeters: Math.round(distance),
      timestamp: now.toISOString(),
    });

    const previousRecord = { ...todayAttendance };
    const optimisticRecord: AttendanceRecord = {
      ...todayAttendance,
      check_out_time: now.toISOString(),
      check_out_latitude: latitude,
      check_out_longitude: longitude,
      check_out_distance_meters: Math.round(distance),
    };
    setTodayAttendance(optimisticRecord);
    await cacheTodayRecord(employeeId, optimisticRecord);

    setPendingState({ status: 'buffered', type: 'check_out', message: 'Data tersimpan di perangkat', syncStatus: 'pending' });
    setIsSubmitting(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // ADAPTIVE JITTER
    const jitterMs = generateAdaptiveJitter(0);
    const peakInfo = isPeakHours() ? ' (jam sibuk)' : '';
    setPendingState({ status: 'jitter', type: 'check_out', message: `Menghubungkan ke server${peakInfo}...`, jitterMs, syncStatus: 'pending' });

    try {
      await delayWithAbort(jitterMs, signal);
    } catch {
      setIsSubmitting(false);
      setPendingState({ status: 'buffered', type: 'check_out', message: 'Tersimpan di perangkat, akan disinkronkan otomatis', syncStatus: 'pending' });
      return { success: true, message: "Absen pulang tersimpan (sinkronisasi tertunda)" };
    }

    // RPC SYNC
    setPendingState({ status: 'processing', type: 'check_out', message: 'Menyimpan ke server...', syncStatus: 'syncing' });
    await updateEntryStatus(entry.bufferId, { syncStatus: 'syncing' });

    try {
      const result = await syncWithResilience(entry, 'check_out', signal);

      if (!result.success) {
        await updateEntryStatus(entry.bufferId, {
          syncStatus: 'failed', syncAttempts: 1,
          lastSyncAttempt: now.toISOString(), syncError: result.message,
        });
        recordFailure();
        setTodayAttendance(previousRecord);
        await cacheTodayRecord(employeeId, previousRecord);
        setPendingState({ status: 'error', type: 'check_out', message: result.message, syncStatus: 'failed' });
        setTimeout(() => setPendingState({ status: 'idle', type: null, message: '' }), 5000);
        return { success: false, message: result.message };
      }

      // Success
      await updateEntryStatus(entry.bufferId, {
        syncStatus: 'synced', serverRecordId: result.id || null,
        lastSyncAttempt: now.toISOString(),
      });
      recordSuccess();

      const confirmedRecord: AttendanceRecord = {
        ...todayAttendance,
        id: result.id || todayAttendance.id,
        check_out_time: result.check_out_time || now.toISOString(),
        check_out_latitude: latitude,
        check_out_longitude: longitude,
        check_out_distance_meters: Math.round(distance),
        status: (result.status as AttendanceRecord['status']) || todayAttendance.status,
      };
      setTodayAttendance(confirmedRecord);
      await cacheTodayRecord(employeeId, confirmedRecord);

      setPendingState({ status: 'success', type: 'check_out', message: result.message, syncStatus: 'synced' });
      setTimeout(() => setPendingState({ status: 'idle', type: null, message: '' }), 3000);

      fetchAttendance();
      return { success: true, message: result.message, distance };

    } catch (error: any) {
      console.error("[IndexedDB] Check-out sync failed:", error);

      await updateEntryStatus(entry.bufferId, {
        syncStatus: 'failed', syncAttempts: 1,
        lastSyncAttempt: new Date().toISOString(),
        syncError: error?.message || 'Unknown error',
      });
      recordFailure();

      const isTimeout = error?.message?.includes('timeout');
      const msg = isTimeout
        ? 'Timeout, absensi pulang tersimpan di perangkat dan akan disinkronkan otomatis.'
        : 'Gagal sinkronisasi, data aman di perangkat. Akan dicoba ulang otomatis.';

      setPendingState({ status: 'error', type: 'check_out', message: msg, syncStatus: 'failed' });
      setTimeout(() => setPendingState({ status: 'idle', type: null, message: '' }), 5000);

      return { success: true, message: msg, distance };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    todayAttendance,
    monthlyStats,
    recentAttendance,
    isLoading,
    isSubmitting,
    pendingState,
    syncStats,
    isOnline,
    wasOffline,
    checkIn,
    checkOut,
    refetch: fetchAttendance,
  };
}
