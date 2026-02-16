/**
 * attendanceBuffer.ts
 * 
 * Buffer First Strategy untuk Attendance
 * Data absensi disimpan ke localStorage terlebih dahulu (instant, < 5ms),
 * kemudian di-sync ke server via RPC dengan jitter delay.
 * 
 * Flow: User Click → Buffer (localStorage) → Jitter Delay → RPC Sync → Confirm
 * 
 * Jika sync gagal (timeout/offline), data tetap aman di buffer
 * dan akan di-retry saat app dibuka kembali.
 */

import { Tables } from "@/integrations/supabase/types";
import { reportError } from "@/lib/errorLogger";

type AttendanceRecord = Tables<"attendance_records">;

// ==================== TYPES ====================

export interface BufferedAttendance {
  id: string; // unique buffer ID
  employeeId: string;
  officeId: string;
  date: string;
  type: 'check_in' | 'check_out';
  latitude: number;
  longitude: number;
  distanceMeters: number;
  timestamp: string; // ISO string waktu absen sebenarnya
  syncStatus: 'buffered' | 'syncing' | 'synced' | 'failed';
  syncAttempts: number;
  lastSyncAttempt: string | null;
  syncError: string | null;
  serverRecordId: string | null; // ID dari database setelah sync berhasil
  createdAt: string;
}

export interface BufferSyncResult {
  success: boolean;
  bufferId: string;
  serverRecordId?: string;
  message: string;
  error?: string;
}

// ==================== CONSTANTS ====================

const BUFFER_KEY = 'attendance_buffer_v1';
const BUFFER_TODAY_KEY = 'attendance_today_v1';
const MAX_SYNC_ATTEMPTS = 5;
const BUFFER_EXPIRY_DAYS = 3; // Hapus buffer lebih dari 3 hari

// ==================== BUFFER OPERATIONS ====================

/**
 * Ambil semua buffered attendance dari localStorage
 */
export function getBufferedAttendances(): BufferedAttendance[] {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BufferedAttendance[];
  } catch {
    return [];
  }
}

/**
 * Simpan buffered attendance ke localStorage
 */
function saveBufferedAttendances(items: BufferedAttendance[]): void {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('[Buffer] Failed to save to localStorage:', e);
  }
}

/**
 * Tambah attendance baru ke buffer (instant, < 5ms)
 */
export function bufferAttendance(
  params: Omit<BufferedAttendance, 'id' | 'syncStatus' | 'syncAttempts' | 'lastSyncAttempt' | 'syncError' | 'serverRecordId' | 'createdAt'>
): BufferedAttendance {
  const entry: BufferedAttendance = {
    ...params,
    id: `buf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    syncStatus: 'buffered',
    syncAttempts: 0,
    lastSyncAttempt: null,
    syncError: null,
    serverRecordId: null,
    createdAt: new Date().toISOString(),
  };

  const items = getBufferedAttendances();
  items.push(entry);
  saveBufferedAttendances(items);

  return entry;
}

/**
 * Update status buffer entry
 */
export function updateBufferEntry(
  bufferId: string,
  updates: Partial<Pick<BufferedAttendance, 'syncStatus' | 'syncAttempts' | 'lastSyncAttempt' | 'syncError' | 'serverRecordId'>>
): void {
  const items = getBufferedAttendances();
  const idx = items.findIndex(i => i.id === bufferId);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...updates };
    saveBufferedAttendances(items);
  }
}

/**
 * Hapus buffer entry yang sudah synced atau expired
 */
export function cleanupBuffer(): number {
  const items = getBufferedAttendances();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BUFFER_EXPIRY_DAYS);

  const remaining = items.filter(item => {
    // Hapus yang sudah synced
    if (item.syncStatus === 'synced') return false;
    // Hapus yang expired dan sudah max attempts
    if (new Date(item.createdAt) < cutoff && item.syncAttempts >= MAX_SYNC_ATTEMPTS) return false;
    return true;
  });

  const cleaned = items.length - remaining.length;
  saveBufferedAttendances(remaining);
  return cleaned;
}

/**
 * Ambil pending (belum synced) buffer entries
 */
export function getPendingBufferEntries(): BufferedAttendance[] {
  return getBufferedAttendances().filter(
    i => (i.syncStatus === 'buffered' || i.syncStatus === 'failed') && i.syncAttempts < MAX_SYNC_ATTEMPTS
  );
}

/**
 * Cek apakah ada buffered check-in untuk hari ini
 */
export function hasBufferedCheckInToday(employeeId: string): BufferedAttendance | null {
  const today = new Date().toISOString().split('T')[0];
  const items = getBufferedAttendances();
  return items.find(
    i => i.employeeId === employeeId && i.date === today && i.type === 'check_in' && i.syncStatus !== 'failed'
  ) || null;
}

/**
 * Cek apakah ada buffered check-out untuk hari ini
 */
export function hasBufferedCheckOutToday(employeeId: string): BufferedAttendance | null {
  const today = new Date().toISOString().split('T')[0];
  const items = getBufferedAttendances();
  return items.find(
    i => i.employeeId === employeeId && i.date === today && i.type === 'check_out' && i.syncStatus !== 'failed'
  ) || null;
}

// ==================== TODAY CACHE ====================

/**
 * Cache data attendance hari ini ke localStorage untuk instant load
 */
export function cacheTodayAttendance(employeeId: string, record: AttendanceRecord | null): void {
  try {
    const key = `${BUFFER_TODAY_KEY}_${employeeId}`;
    if (record) {
      localStorage.setItem(key, JSON.stringify({
        record,
        cachedAt: new Date().toISOString(),
      }));
    } else {
      localStorage.removeItem(key);
    }
  } catch (error: unknown) {
    reportError(error, "attendance_buffer.cache_today_attendance", { employee_id: employeeId });
  }
}

/**
 * Load cached today attendance (untuk instant UI saat app load)
 */
export function getCachedTodayAttendance(employeeId: string): AttendanceRecord | null {
  try {
    const key = `${BUFFER_TODAY_KEY}_${employeeId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);
    const today = new Date().toISOString().split('T')[0];
    
    // Hanya return cache jika masih hari ini
    if (parsed.record?.date === today) {
      return parsed.record;
    }
    
    // Expired cache, hapus
    localStorage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

/**
 * Buat optimistic AttendanceRecord dari buffer entry
 */
export function bufferToOptimisticRecord(entry: BufferedAttendance): AttendanceRecord {
  const base: AttendanceRecord = {
    id: entry.serverRecordId || `buffer-${entry.id}`,
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
  return base;
}
