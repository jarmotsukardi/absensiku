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
import { loadAttendanceScalabilitySetting, loadScalabilityConfig } from "@/lib/scalabilityConfig";
import { useAttendanceSync } from "./useAttendanceSync";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { buildAttendanceClientContext } from "@/lib/attendanceClientContext";
import { reconcileTodayAttendance } from "@/lib/attendanceRecordSync";
import { DEFAULT_TIMEZONE, getCurrentDateStringInTimezone } from "@/lib/timezone";
import {
  buildLocalProductionWriteBlockMessage,
  shouldBlockLocalProductionWrites,
} from "@/lib/runtimeEnvironment";
import {
  buildDeferredAttendanceResult,
  buildDelayedBufferedPendingState,
  buildDeferredAttendanceMessages,
  buildDeferredBufferedPendingState,
  buildHeldBufferedPendingState,
  buildErrorPendingState,
  buildInitialBufferedPendingState,
  buildJitterPendingState,
  buildProcessingPendingState,
  buildRpcFailureAttendanceResult,
  buildRpcSuccessAttendanceResult,
  resolveAttendanceSyncDecision,
  buildSyncFailureMessage,
  buildSuccessPendingState,
  buildDelayedAttendanceResult,
} from "@/lib/attendanceSyncPolicy";

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
  detail?: string;
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

async function syncCheckInToServer(entry: AttendanceEntry, retryCount: number = 0): Promise<RpcResult> {
  const timeout = getAdaptiveTimeout(retryCount);
  const clientContext = buildAttendanceClientContext();
  const rpcCall = supabase.rpc('process_check_in', {
    p_employee_id: entry.employeeId,
    p_office_id: entry.officeId,
    p_latitude: entry.latitude,
    p_longitude: entry.longitude,
    p_distance_meters: entry.distanceMeters,
    p_date: entry.date,
    p_idempotency_key: entry.idempotencyKey,
    p_client_context: clientContext as unknown as Record<string, unknown>,
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
  const clientContext = buildAttendanceClientContext();
  const rpcCall = supabase.rpc('process_check_out', {
    p_employee_id: entry.employeeId,
    p_office_id: entry.officeId,
    p_latitude: entry.latitude,
    p_longitude: entry.longitude,
    p_distance_meters: entry.distanceMeters,
    p_date: entry.date,
    p_idempotency_key: entry.idempotencyKey,
    p_client_context: clientContext as unknown as Record<string, unknown>,
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

export function useAttendance(
  employeeId: string | null,
  officeId: string | null,
  timezone: string = DEFAULT_TIMEZONE
) {
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
  const todayAttendanceRef = useRef<AttendanceRecord | null>(null);
  const checkInLockRef = useRef(false);
  const checkOutLockRef = useRef(false);
  const today = getCurrentDateStringInTimezone(timezone || DEFAULT_TIMEZONE);

  // Background sync hook (re-hydration, online detection, auto-sync)
  const { syncStats, isOnline, wasOffline, triggerSync } = useAttendanceSync(employeeId, today, timezone);

  useEffect(() => {
    todayAttendanceRef.current = todayAttendance;
  }, [todayAttendance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // ==================== RE-HYDRATION: Instant load dari IndexedDB cache ====================
  useEffect(() => {
    if (!employeeId) return;
    const loadCache = async () => {
      const cached = await getCachedTodayRecord(employeeId, today);
      if (cached) {
        todayAttendanceRef.current = cached as AttendanceRecord;
        setTodayAttendance(cached as AttendanceRecord);
      }
    };
    loadCache();
  }, [employeeId, today]);

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
        const nextTodayAttendance = reconcileTodayAttendance(
          todayData,
          todayAttendanceRef.current
        );
        todayAttendanceRef.current = nextTodayAttendance;
        setTodayAttendance(nextTodayAttendance);
        await cacheTodayRecord(employeeId, nextTodayAttendance, today);
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
      const errorRef = reportError(error, "attendance.fetch", { employeeId, today });
      console.error(`[Attendance ${errorRef}] Error fetching attendance:`, error);
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
            detail: 'Data belum final di server. Sistem sedang mencoba sinkron ulang.',
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

    if (checkInLockRef.current) {
      return { success: false, message: "Absen masuk sedang diproses" };
    }

    if (shouldBlockLocalProductionWrites()) {
      const message = buildLocalProductionWriteBlockMessage("Absen masuk");
      setPendingState(buildErrorPendingState(
        "check_in",
        message,
        "Localhost saat ini hanya boleh membaca data production. Pakai staging remote atau override eksplisit bila benar-benar diperlukan.",
      ));
      return { success: false, message };
    }

    checkInLockRef.current = true;
    try {
      const existingBuffer = await hasCheckInToday(employeeId, today);
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
      await cacheTodayRecord(employeeId, optimisticRecord, today);

      setPendingState(buildInitialBufferedPendingState('check_in'));

      // Deferred mode: store-first, sync in background to reduce burst load.
      const scalabilityProfile = loadScalabilityConfig();
      const runtimeSetting = loadAttendanceScalabilitySetting();
      const busyHours = isPeakHours();
      const syncDecision = resolveAttendanceSyncDecision(scalabilityProfile, busyHours, runtimeSetting);
      if (syncDecision.shouldDefer) {
        const deferredBaseMs = syncDecision.deferredBaseMs;
        const deferredMs = deferredBaseMs + generateAdaptiveJitter(0);
        const scheduledMessages = buildDeferredAttendanceMessages('check_in', deferredMs);
        if (syncDecision.shouldTriggerClientSync) {
          window.setTimeout(() => {
            triggerSync();
          }, deferredMs);
          setPendingState(buildDeferredBufferedPendingState('check_in', deferredMs, syncDecision.detailMessage));
        } else {
          setPendingState(buildHeldBufferedPendingState('check_in', syncDecision.detailMessage));
        }
        window.setTimeout(() => {
          setPendingState({ status: 'idle', type: null, message: '', detail: '' });
        }, 4000);

        return {
          ...buildDeferredAttendanceResult('check_in', distance),
          message: scheduledMessages.successMessage,
        };
      }

      setIsSubmitting(true);

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      // ADAPTIVE JITTER
      const jitterMs = generateAdaptiveJitter(0);
      setPendingState(buildJitterPendingState('check_in', jitterMs, busyHours));

      try {
        await delayWithAbort(jitterMs, signal);
      } catch {
        setIsSubmitting(false);
        setPendingState(buildDelayedBufferedPendingState('check_in'));
        return buildDelayedAttendanceResult('check_in');
      }

      // RPC SYNC
      setPendingState(buildProcessingPendingState('check_in'));
      await updateEntryStatus(entry.bufferId, { syncStatus: 'syncing' });

      try {
        const result = await syncWithResilience(entry, 'check_in', signal);

        if (!result.success) {
          await updateEntryStatus(entry.bufferId, {
            syncStatus: 'failed', syncAttempts: 1,
            lastSyncAttempt: now.toISOString(), syncError: result.message,
          });
          recordFailure();
          setPendingState(buildErrorPendingState(
            'check_in',
            result.message,
            'Absensi masih tersimpan di perangkat dan belum final di server.',
          ));
          setTimeout(() => setPendingState({ status: 'idle', type: null, message: '', detail: '' }), 5000);
          return buildRpcFailureAttendanceResult(result.message);
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
        await cacheTodayRecord(employeeId, confirmedRecord, today);

        setPendingState(buildSuccessPendingState('check_in', result.message));
        setTimeout(() => setPendingState({ status: 'idle', type: null, message: '', detail: '' }), 3000);

        fetchAttendance();
        return buildRpcSuccessAttendanceResult(result.message, distance);

      } catch (error: unknown) {
        const errorRef = reportError(error, "attendance.check_in.sync", {
          employeeId,
          officeId,
          date: today,
        });
        console.error(`[IndexedDB ${errorRef}] Check-in sync failed:`, error);

        await updateEntryStatus(entry.bufferId, {
          syncStatus: 'failed', syncAttempts: 1,
          lastSyncAttempt: new Date().toISOString(),
          syncError: getErrorMessage(error) || 'Unknown error',
        });
        recordFailure();

        const isTimeout = getErrorMessage(error).toLowerCase().includes('timeout');
        const failureMessage = buildSyncFailureMessage('check_in', isTimeout);
        const userMsg = appendErrorReference(failureMessage.userMessage, errorRef);

        setPendingState(buildErrorPendingState(
          'check_in',
          userMsg,
          failureMessage.detailMessage,
        ));
        setTimeout(() => setPendingState({ status: 'idle', type: null, message: '', detail: '' }), 5000);

        return buildRpcSuccessAttendanceResult(userMsg, distance);
      } finally {
        setIsSubmitting(false);
      }
    } finally {
      checkInLockRef.current = false;
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
      const bufferCheckIn = await hasCheckInToday(employeeId, today);
      if (bufferCheckIn && bufferCheckIn.syncStatus !== 'synced') {
        return { success: false, message: "Absen masuk masih menunggu sinkronisasi" };
      }
    }

    if (todayAttendance.check_out_time) {
      return { success: false, message: "Anda sudah melakukan absen pulang hari ini" };
    }

    if (checkOutLockRef.current) {
      return { success: false, message: "Absen pulang sedang diproses" };
    }

    if (shouldBlockLocalProductionWrites()) {
      const message = buildLocalProductionWriteBlockMessage("Absen pulang");
      setPendingState(buildErrorPendingState(
        "check_out",
        message,
        "Localhost saat ini hanya boleh membaca data production. Pakai staging remote atau override eksplisit bila benar-benar diperlukan.",
      ));
      return { success: false, message };
    }

    checkOutLockRef.current = true;
    try {
      const existingBuffer = await hasCheckOutToday(employeeId, today);
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
    await cacheTodayRecord(employeeId, optimisticRecord, today);

      setPendingState(buildInitialBufferedPendingState('check_out'));

    // Deferred mode: store-first, sync in background to reduce burst load.
      const scalabilityProfile = loadScalabilityConfig();
      const runtimeSetting = loadAttendanceScalabilitySetting();
      const busyHours = isPeakHours();
      const syncDecision = resolveAttendanceSyncDecision(scalabilityProfile, busyHours, runtimeSetting);
      if (syncDecision.shouldDefer) {
      const deferredBaseMs = syncDecision.deferredBaseMs;
      const deferredMs = deferredBaseMs + generateAdaptiveJitter(0);
      const scheduledMessages = buildDeferredAttendanceMessages('check_out', deferredMs);
      if (syncDecision.shouldTriggerClientSync) {
        window.setTimeout(() => {
          triggerSync();
        }, deferredMs);
        setPendingState(buildDeferredBufferedPendingState('check_out', deferredMs, syncDecision.detailMessage));
      } else {
        setPendingState(buildHeldBufferedPendingState('check_out', syncDecision.detailMessage));
      }
      window.setTimeout(() => {
        setPendingState({ status: 'idle', type: null, message: '', detail: '' });
      }, 4000);

        return {
          ...buildDeferredAttendanceResult('check_out', distance),
          message: scheduledMessages.successMessage,
        };
      }

      setIsSubmitting(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // ADAPTIVE JITTER
    const jitterMs = generateAdaptiveJitter(0);
      setPendingState(buildJitterPendingState('check_out', jitterMs, busyHours));

    try {
      await delayWithAbort(jitterMs, signal);
    } catch {
      setIsSubmitting(false);
      setPendingState(buildDelayedBufferedPendingState('check_out'));
      return buildDelayedAttendanceResult('check_out');
    }

    // RPC SYNC
    setPendingState(buildProcessingPendingState('check_out'));
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
        await cacheTodayRecord(employeeId, previousRecord, today);
        setPendingState(buildErrorPendingState(
          'check_out',
          result.message,
          'Absensi masih tersimpan di perangkat dan belum final di server.',
        ));
        setTimeout(() => setPendingState({ status: 'idle', type: null, message: '', detail: '' }), 5000);
        return buildRpcFailureAttendanceResult(result.message);
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
      await cacheTodayRecord(employeeId, confirmedRecord, today);

      setPendingState(buildSuccessPendingState('check_out', result.message));
      setTimeout(() => setPendingState({ status: 'idle', type: null, message: '', detail: '' }), 3000);

      fetchAttendance();
        return buildRpcSuccessAttendanceResult(result.message, distance);

      } catch (error: unknown) {
      const errorRef = reportError(error, "attendance.check_out.sync", {
        employeeId,
        officeId,
        date: today,
      });
      console.error(`[IndexedDB ${errorRef}] Check-out sync failed:`, error);

      await updateEntryStatus(entry.bufferId, {
        syncStatus: 'failed', syncAttempts: 1,
        lastSyncAttempt: new Date().toISOString(),
        syncError: getErrorMessage(error) || 'Unknown error',
      });
      recordFailure();

      const isTimeout = getErrorMessage(error).toLowerCase().includes('timeout');
      const failureMessage = buildSyncFailureMessage('check_out', isTimeout);
      const userMsg = appendErrorReference(failureMessage.userMessage, errorRef);

      setPendingState(buildErrorPendingState(
        'check_out',
        userMsg,
        failureMessage.detailMessage,
      ));
      setTimeout(() => setPendingState({ status: 'idle', type: null, message: '', detail: '' }), 5000);

        return buildRpcSuccessAttendanceResult(userMsg, distance);
      } finally {
        setIsSubmitting(false);
      }
    } finally {
      checkOutLockRef.current = false;
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
