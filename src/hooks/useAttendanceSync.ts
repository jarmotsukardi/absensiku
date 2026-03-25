/**
 * useAttendanceSync.ts
 * 
 * Background sync hook untuk sinkronisasi data absensi dari IndexedDB ke server.
 * Fitur:
 * - Re-hydration saat app load
 * - Auto-sync saat online kembali
 * - Batching (proses N entries per batch)
 * - Circuit breaker integration
 * - Migrasi dari localStorage
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import {
  getPendingEntries,
  updateEntryStatus,
  cleanupOldEntries,
  rehydratePendingEntries,
  recoverStuckSyncEntries,
  migrateFromLocalStorage,
  type AttendanceEntry,
} from '@/lib/attendanceDB';
import {
  canMakeRequest,
  recordSuccess,
  recordFailure,
  withExponentialBackoff,
  isRetryableError,
  isPeakHours,
  withTimeout,
  getAdaptiveTimeout,
  generateAdaptiveJitter,
} from '@/lib/attendanceResilience';
import {
  loadAttendanceScalabilitySetting,
  loadScalabilityConfig,
  normalizeAttendanceScalabilitySetting,
  saveAttendanceScalabilitySetting,
  saveScalabilityConfig,
} from '@/lib/scalabilityConfig';
import { useOnlineStatus } from './useOnlineStatus';
import { supabase } from '@/integrations/supabase/client';
import { reportError } from '@/lib/errorLogger';
import { buildAttendanceClientContext } from '@/lib/attendanceClientContext';
import { debugLog } from '@/lib/debugLog';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';
import { setConfiguredPeakWindows } from '@/lib/attendanceResilience';
import {
  buildLocalProductionWriteBlockMessage,
  shouldBlockLocalProductionWrites,
} from '@/lib/runtimeEnvironment';

export interface SyncStats {
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  stalePendingCount: number;
  oldestPendingAgeMinutes: number | null;
  staleWarningRef: string | null;
}

interface BatchSyncResult {
  buffer_id: string;
  success: boolean;
  id?: string;
  status?: string;
  error?: string;
  message: string;
  queue_status?: string;
  trace_id?: string;
}

const asRecord = (value: unknown): Record<string, unknown> => {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
};

const getOptionalString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

function normalizeBatchItem(item: unknown): BatchSyncResult {
  const itemRecord = asRecord(item);
  const nested = asRecord(itemRecord.process_check_in ?? itemRecord.process_check_out ?? itemRecord);
  const nestedSuccess = nested.success ?? itemRecord.success;

  return {
    buffer_id: getOptionalString(itemRecord.buffer_id) || getOptionalString(nested.buffer_id) || "",
    success: typeof nestedSuccess === "boolean" ? nestedSuccess : Boolean(nestedSuccess),
    id: getOptionalString(nested.id),
    status: getOptionalString(nested.status),
    error: getOptionalString(nested.error) || getOptionalString(itemRecord.error),
    message: getOptionalString(nested.message) || getOptionalString(itemRecord.message) || "Unknown response",
    queue_status: getOptionalString(itemRecord.queue_status) || getOptionalString(nested.queue_status),
    trace_id: getOptionalString(itemRecord.trace_id) || getOptionalString(nested.trace_id),
  };
}

async function syncBatchToServer(entries: AttendanceEntry[]): Promise<BatchSyncResult[]> {
  const timeout = getAdaptiveTimeout(Math.max(...entries.map((entry) => entry.syncAttempts), 0));
  const clientContext = buildAttendanceClientContext();
  const payload = entries.map((entry) => ({
    buffer_id: entry.bufferId,
    idempotency_key: entry.idempotencyKey,
    type: entry.type,
    employee_id: entry.employeeId,
    office_id: entry.officeId,
    latitude: entry.latitude,
    longitude: entry.longitude,
    distance_meters: entry.distanceMeters,
    date: entry.date,
    timestamp: entry.timestamp,
    local_timezone_offset: entry.localTimezoneOffset,
    client_context: clientContext,
  }));

  const invokeCall = supabase.functions.invoke('batch-attendance', {
    body: { entries: payload },
  });

  const { data, error } = await withTimeout(
    Promise.resolve(invokeCall),
    timeout,
    'Koneksi sinkronisasi timeout'
  );

  if (error) throw error;

  const responsePayload = data as unknown;
  const payloadRecord = asRecord(responsePayload);
  const rawResults: unknown[] = Array.isArray(payloadRecord.results)
    ? payloadRecord.results
    : Array.isArray(responsePayload)
      ? responsePayload
      : [];

  return rawResults.map(normalizeBatchItem);
}

export function useAttendanceSync(
  employeeId: string | null,
  attendanceDate?: string,
  timezone: string = DEFAULT_TIMEZONE,
) {
  const [syncStats, setSyncStats] = useState<SyncStats>({
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    isSyncing: false,
    lastSyncAt: null,
    stalePendingCount: 0,
    oldestPendingAgeMinutes: null,
    staleWarningRef: null,
  });

  const syncingRef = useRef(false);
  const mountedRef = useRef(true);
  const staleWarningSignatureRef = useRef<string | null>(null);

  const getAdaptiveSyncIntervalMs = useCallback((): number => {
    const profile = loadScalabilityConfig();
    const min = Math.max(5_000, profile.syncIntervalMinMs);
    const max = Math.max(min, profile.syncIntervalMaxMs);
    const base = min + Math.floor(Math.random() * (max - min + 1));
    const jitter = Math.min(generateAdaptiveJitter(0), max);
    return Math.min(max, base + Math.floor(jitter / 2));
  }, []);

  const getStaleThresholdMinutes = useCallback((): number => {
    const profile = loadScalabilityConfig();
    const baseMs = Math.max(
      profile.syncIntervalMaxMs * 2,
      profile.deferredSyncDelayMs * 3,
      15 * 60 * 1000,
    );
    return Math.max(15, Math.ceil(baseMs / 60000));
  }, []);

  const buildPendingInsight = useCallback((entries: AttendanceEntry[]) => {
    const staleThresholdMinutes = getStaleThresholdMinutes();
    const now = Date.now();
    const ages = entries
      .map((entry) => {
        const sourceTs = entry.lastSyncAttempt || entry.createdAt;
        const ageMs = now - new Date(sourceTs).getTime();
        return Number.isFinite(ageMs) && ageMs >= 0 ? Math.floor(ageMs / 60000) : 0;
      });

    const oldestPendingAgeMinutes = ages.length > 0 ? Math.max(...ages) : null;
    const stalePendingCount = ages.filter((age) => age >= staleThresholdMinutes).length;

    return {
      staleThresholdMinutes,
      stalePendingCount,
      oldestPendingAgeMinutes,
    };
  }, [getStaleThresholdMinutes]);

  const updatePendingInsight = useCallback((entries: AttendanceEntry[]) => {
    const insight = buildPendingInsight(entries);
    let staleWarningRef: string | null = null;

    if (insight.stalePendingCount > 0 && employeeId) {
      const signature = `${employeeId}:${insight.stalePendingCount}:${insight.oldestPendingAgeMinutes}:${insight.staleThresholdMinutes}`;
      if (staleWarningSignatureRef.current !== signature) {
        staleWarningSignatureRef.current = signature;
        staleWarningRef = reportError(
          new Error('Stale attendance buffer detected'),
          'attendance.sync.stale_pending_detected',
          {
            employeeId,
            stale_pending_count: insight.stalePendingCount,
            oldest_pending_age_minutes: insight.oldestPendingAgeMinutes,
            stale_threshold_minutes: insight.staleThresholdMinutes,
          }
        );
      }
    } else {
      staleWarningSignatureRef.current = null;
    }

    if (mountedRef.current) {
      setSyncStats((prev) => ({
        ...prev,
        pendingCount: entries.length,
        stalePendingCount: insight.stalePendingCount,
        oldestPendingAgeMinutes: insight.oldestPendingAgeMinutes,
        staleWarningRef: insight.stalePendingCount > 0 ? (staleWarningRef || prev.staleWarningRef) : null,
      }));
    }

    return { ...insight, staleWarningRef };
  }, [buildPendingInsight, employeeId]);

  // Best-effort: hydrate global scalability profile from DB.
  useEffect(() => {
    if (!employeeId) return;

    const hydrateGlobalScalability = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'attendance_scalability')
          .maybeSingle();

        if (error) return;

        const setting = normalizeAttendanceScalabilitySetting(data?.value);
        saveScalabilityConfig(setting.effective_tier);
        saveAttendanceScalabilitySetting(setting);
        setConfiguredPeakWindows(setting.peak_hour_windows, setting.peak_hour_enabled);
      } catch {
        // ignore - fallback to local profile
      }
    };

    hydrateGlobalScalability();
  }, [employeeId, updatePendingInsight]);

  // Sync function
  const performSync = useCallback(async () => {
    if (!employeeId || syncingRef.current) return;
    syncingRef.current = true;

    if (mountedRef.current) {
      setSyncStats(prev => ({ ...prev, isSyncing: true }));
    }

    try {
      const profile = loadScalabilityConfig();
      const runtimeSetting = loadAttendanceScalabilitySetting();
      const shouldPauseForPeakHold = runtimeSetting.peak_hour_enabled
        && runtimeSetting.peak_hour_hold_sync
        && isPeakHours();
      const shouldPauseForWorkerOnly = runtimeSetting.offpeak_release_strategy === 'worker_only';

      if (shouldPauseForPeakHold || shouldPauseForWorkerOnly) {
        return;
      }

      await recoverStuckSyncEntries(employeeId, 5);
      await cleanupOldEntries(profile.bufferExpiryDays, profile.maxSyncAttempts);

      const pending = await getPendingEntries(employeeId, profile.maxSyncAttempts);
      if (pending.length === 0) {
        if (mountedRef.current) {
          setSyncStats(prev => ({
            ...prev,
            pendingCount: 0,
            stalePendingCount: 0,
            oldestPendingAgeMinutes: null,
            staleWarningRef: null,
            isSyncing: false,
          }));
        }
        staleWarningSignatureRef.current = null;
        return;
      }

      if (shouldBlockLocalProductionWrites()) {
        const guardMessage = buildLocalProductionWriteBlockMessage("Sinkronisasi absensi");
        const blockedAt = new Date().toISOString();

        await Promise.all(
          pending.map((entry) => updateEntryStatus(entry.bufferId, {
            syncStatus: 'failed',
            syncAttempts: entry.syncAttempts + 1,
            lastSyncAttempt: blockedAt,
            syncError: guardMessage,
          }))
        );

        if (mountedRef.current) {
          setSyncStats((prev) => ({
            ...prev,
            pendingCount: pending.length,
            failedCount: prev.failedCount + pending.length,
            lastSyncAt: blockedAt,
          }));
        }
        updatePendingInsight(await getPendingEntries(employeeId, profile.maxSyncAttempts));
        return;
      }

      updatePendingInsight(pending);

      const batchSize = profile.batchSize;
      const chunkSize = Math.max(1, Math.min(profile.batchSize, profile.edgeFunctionMaxBatch));
      const orderedPending = [...pending].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const batch = orderedPending.slice(0, batchSize);
      let syncedInBatch = 0;
      let failedInBatch = 0;

      const markSynced = async (entry: AttendanceEntry, result: { id?: string; status?: string; message: string }) => {
        await updateEntryStatus(entry.bufferId, {
          syncStatus: 'synced',
          serverRecordId: result.id || null,
          lastSyncAttempt: new Date().toISOString(),
        });
        recordSuccess();
        syncedInBatch++;
      };

      const markDeferred = async (entry: AttendanceEntry, message: string) => {
        await updateEntryStatus(entry.bufferId, {
          syncStatus: 'pending',
          syncAttempts: entry.syncAttempts,
          lastSyncAttempt: new Date().toISOString(),
          syncError: message,
        });
      };

      const markFailed = async (entry: AttendanceEntry, message: string) => {
        await updateEntryStatus(entry.bufferId, {
          syncStatus: 'failed',
          syncAttempts: entry.syncAttempts + 1,
          lastSyncAttempt: new Date().toISOString(),
          syncError: message,
        });
        recordFailure();
        failedInBatch++;
      };

      const shouldTreatAsSuccess = (result: BatchSyncResult | undefined): boolean => {
        if (!result) return false;
        if (result.success) return true;
        return result.error === 'ALREADY_CHECKED_IN' || result.error === 'ALREADY_CHECKED_OUT';
      };

      const formatResultMessage = (result: BatchSyncResult | undefined, fallback: string): string => {
        const base = result?.message || fallback;
        return result?.trace_id ? `${base} (Ref: ${result.trace_id})` : base;
      };

      const isStillQueued = (result: BatchSyncResult | undefined): boolean => {
        if (!result) return false;
        return result.queue_status === 'queued' || result.queue_status === 'processing' || result.queue_status === 'failed';
      };

      const syncSingleEntryWithRetry = async (entry: AttendanceEntry) => {
        const cbCheck = canMakeRequest();
        if (!cbCheck.allowed) {
          debugLog('[AttendanceSync] Circuit breaker open, pausing sync');
          return;
        }

        try {
          await updateEntryStatus(entry.bufferId, { syncStatus: 'syncing' });

          const [result] = await withExponentialBackoff(
            () => syncBatchToServer([entry]),
            {
              maxRetries: 2,
              shouldRetry: isRetryableError,
            }
          );

          if (shouldTreatAsSuccess(result)) {
            await markSynced(entry, result);
          } else if (isStillQueued(result)) {
            await markDeferred(entry, formatResultMessage(result, 'Queued on server, waiting for processor'));
          } else {
            await markFailed(entry, formatResultMessage(result, 'Sync failed'));
          }
        } catch (err: unknown) {
          await markFailed(entry, toErrorMessage(err) || 'Sync failed');
        }
      };

      if (batch.length > 1) {
        for (let i = 0; i < batch.length; i += chunkSize) {
          const chunk = batch.slice(i, i + chunkSize);
          const cbCheck = canMakeRequest();
          if (!cbCheck.allowed) {
            debugLog('[AttendanceSync] Circuit breaker open, pausing sync');
            break;
          }

          await Promise.all(
            chunk.map((entry) => updateEntryStatus(entry.bufferId, { syncStatus: 'syncing' }))
          );

          try {
            const results = await withExponentialBackoff(
              () => syncBatchToServer(chunk),
              {
                maxRetries: 2,
                shouldRetry: isRetryableError,
              }
            );

            const resultMap = new Map<string, BatchSyncResult>();
            for (const row of results) {
              if (row.buffer_id) {
                resultMap.set(row.buffer_id, row);
              }
            }

            for (const entry of chunk) {
              const result = resultMap.get(entry.bufferId);
              if (shouldTreatAsSuccess(result)) {
                await markSynced(entry, result);
              } else if (isStillQueued(result)) {
                await markDeferred(entry, formatResultMessage(result, 'Queued on server, waiting for processor'));
              } else {
                await markFailed(entry, formatResultMessage(result, 'No result for buffered entry'));
              }
            }
          } catch (batchError: unknown) {
            const errorRef = reportError(batchError, 'attendance.sync.batch_fallback', {
              employeeId,
              chunkSize: chunk.length,
            });
            console.error(`[AttendanceSync ${errorRef}] Batch sync failed, fallback to single sync:`, batchError);
            for (const entry of chunk) {
              await syncSingleEntryWithRetry(entry);
            }
          }
        }
      } else {
        for (const entry of batch) {
          await syncSingleEntryWithRetry(entry);
        }
      }

      const remainingPending = await getPendingEntries(employeeId, profile.maxSyncAttempts);
      updatePendingInsight(remainingPending);
      if (mountedRef.current) {
        setSyncStats(prev => ({
          ...prev,
          pendingCount: remainingPending.length,
          syncedCount: prev.syncedCount + syncedInBatch,
          failedCount: prev.failedCount + failedInBatch,
          lastSyncAt: new Date().toISOString(),
        }));
      }
    } catch (err) {
      const errorRef = reportError(err, 'attendance.sync.performSync', { employeeId });
      console.error(`[AttendanceSync ${errorRef}] Sync error:`, err);
    } finally {
      syncingRef.current = false;
      if (mountedRef.current) {
        setSyncStats(prev => ({ ...prev, isSyncing: false }));
      }
    }
  }, [employeeId, updatePendingInsight]);

  // Online status with auto-sync on reconnect
  const onlineStatus = useOnlineStatus(performSync);

  // Re-hydration on mount
  useEffect(() => {
    if (!employeeId) return;

    const init = async () => {
      // Migrate from localStorage first
      await migrateFromLocalStorage(attendanceDate, timezone);

      // Re-hydrate pending entries
      const profile = loadScalabilityConfig();
      const { pendingCount } = await rehydratePendingEntries(
        employeeId,
        attendanceDate,
        profile.maxSyncAttempts,
      );
      const pendingEntries = await getPendingEntries(employeeId, profile.maxSyncAttempts);
      updatePendingInsight(pendingEntries);

      // Auto sync if online and has pending
      const runtimeSetting = loadAttendanceScalabilitySetting();
      const allowStartupClientSync = !(runtimeSetting.offpeak_release_strategy === 'worker_only')
        && !(runtimeSetting.peak_hour_enabled && runtimeSetting.peak_hour_hold_sync && isPeakHours());

      if (navigator.onLine && pendingCount > 0 && allowStartupClientSync) {
        const startupDelay = Math.max(1000, Math.floor(generateAdaptiveJitter(0) / 2));
        window.setTimeout(performSync, startupDelay);
      }
    };

    init();
  }, [employeeId, performSync, attendanceDate, timezone, updatePendingInsight]);

  // Periodic sync with adaptive interval + jitter (avoid thundering herd).
  useEffect(() => {
    if (!employeeId) return;

    let timer: number | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const intervalMs = getAdaptiveSyncIntervalMs();
      timer = window.setTimeout(async () => {
        if (!navigator.onLine || syncingRef.current) {
          schedule();
          return;
        }

        const profile = loadScalabilityConfig();
        const runtimeSetting = loadAttendanceScalabilitySetting();
        const allowPeriodicClientSync = !(runtimeSetting.offpeak_release_strategy === 'worker_only')
          && !(runtimeSetting.peak_hour_enabled && runtimeSetting.peak_hour_hold_sync && isPeakHours());
        const pending = await getPendingEntries(employeeId, profile.maxSyncAttempts);
        updatePendingInsight(pending);
        if (pending.length > 0 && allowPeriodicClientSync) {
          performSync();
        }
        schedule();
      }, intervalMs);
    };

    schedule();

    return () => {
      stopped = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [employeeId, performSync, getAdaptiveSyncIntervalMs, updatePendingInsight]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return {
    syncStats,
    isOnline: onlineStatus.isOnline,
    wasOffline: onlineStatus.wasOffline,
    triggerSync: performSync,
  };
}
