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
  migrateFromLocalStorage,
  type AttendanceEntry,
  type SyncStatus,
} from '@/lib/attendanceDB';
import {
  canMakeRequest,
  recordSuccess,
  recordFailure,
  withExponentialBackoff,
  isRetryableError,
  withTimeout,
  getAdaptiveTimeout,
} from '@/lib/attendanceResilience';
import { loadScalabilityConfig } from '@/lib/scalabilityConfig';
import { useOnlineStatus } from './useOnlineStatus';
import { supabase } from '@/integrations/supabase/client';

export interface SyncStats {
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
}

async function syncEntryToServer(entry: AttendanceEntry): Promise<{ success: boolean; id?: string; status?: string; message: string }> {
  const timeout = getAdaptiveTimeout(entry.syncAttempts);
  const rpcName = entry.type === 'check_in' ? 'process_check_in' : 'process_check_out';
  
  const rpcCall = supabase.rpc(rpcName, {
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
  const result = data as any;
  return { success: result?.success ?? false, id: result?.id, status: result?.status, message: result?.message || 'OK' };
}

export function useAttendanceSync(employeeId: string | null) {
  const [syncStats, setSyncStats] = useState<SyncStats>({
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    isSyncing: false,
    lastSyncAt: null,
  });

  const syncingRef = useRef(false);
  const mountedRef = useRef(true);

  // Sync function
  const performSync = useCallback(async () => {
    if (!employeeId || syncingRef.current) return;
    syncingRef.current = true;

    if (mountedRef.current) {
      setSyncStats(prev => ({ ...prev, isSyncing: true }));
    }

    try {
      await cleanupOldEntries(loadScalabilityConfig().bufferExpiryDays);

      const pending = await getPendingEntries(employeeId);
      if (pending.length === 0) {
        if (mountedRef.current) {
          setSyncStats(prev => ({ ...prev, pendingCount: 0, isSyncing: false }));
        }
        return;
      }

      if (mountedRef.current) {
        setSyncStats(prev => ({ ...prev, pendingCount: pending.length }));
      }

      const batchSize = loadScalabilityConfig().batchSize;
      const batch = pending.slice(0, batchSize);
      let syncedInBatch = 0;
      let failedInBatch = 0;

      for (const entry of batch) {
        // Circuit breaker check
        const cbCheck = canMakeRequest();
        if (!cbCheck.allowed) {
          console.log('[AttendanceSync] Circuit breaker open, pausing sync');
          break;
        }

        try {
          await updateEntryStatus(entry.bufferId, { syncStatus: 'syncing' });

          const result = await withExponentialBackoff(
            () => syncEntryToServer(entry),
            {
              maxRetries: 2,
              shouldRetry: isRetryableError,
            }
          );

          if (result.success) {
            await updateEntryStatus(entry.bufferId, {
              syncStatus: 'synced',
              serverRecordId: result.id || null,
              lastSyncAttempt: new Date().toISOString(),
            });
            recordSuccess();
            syncedInBatch++;
          } else {
            await updateEntryStatus(entry.bufferId, {
              syncStatus: 'failed',
              syncAttempts: entry.syncAttempts + 1,
              lastSyncAttempt: new Date().toISOString(),
              syncError: result.message,
            });
            recordFailure();
            failedInBatch++;
          }
        } catch (err: any) {
          await updateEntryStatus(entry.bufferId, {
            syncStatus: 'failed',
            syncAttempts: entry.syncAttempts + 1,
            lastSyncAttempt: new Date().toISOString(),
            syncError: err?.message || 'Sync failed',
          });
          recordFailure();
          failedInBatch++;
        }
      }

      if (mountedRef.current) {
        setSyncStats(prev => ({
          ...prev,
          pendingCount: Math.max(0, pending.length - syncedInBatch),
          syncedCount: prev.syncedCount + syncedInBatch,
          failedCount: prev.failedCount + failedInBatch,
          lastSyncAt: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('[AttendanceSync] Sync error:', err);
    } finally {
      syncingRef.current = false;
      if (mountedRef.current) {
        setSyncStats(prev => ({ ...prev, isSyncing: false }));
      }
    }
  }, [employeeId]);

  // Online status with auto-sync on reconnect
  const onlineStatus = useOnlineStatus(performSync);

  // Re-hydration on mount
  useEffect(() => {
    if (!employeeId) return;

    const init = async () => {
      // Migrate from localStorage first
      await migrateFromLocalStorage();

      // Re-hydrate pending entries
      const { pendingCount } = await rehydratePendingEntries(employeeId);
      
      if (mountedRef.current) {
        setSyncStats(prev => ({ ...prev, pendingCount }));
      }

      // Auto sync if online and has pending
      if (navigator.onLine && pendingCount > 0) {
        setTimeout(performSync, 2000);
      }
    };

    init();
  }, [employeeId, performSync]);

  // Periodic sync (every 30s if online and has pending)
  useEffect(() => {
    if (!employeeId) return;

    const interval = setInterval(async () => {
      if (!navigator.onLine || syncingRef.current) return;
      const pending = await getPendingEntries(employeeId);
      if (pending.length > 0) {
        performSync();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [employeeId, performSync]);

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
