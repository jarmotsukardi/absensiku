/**
 * attendanceDB.ts
 * 
 * IndexedDB layer menggunakan Dexie.js untuk Offline-First Attendance.
 * Fitur:
 * - Penyimpanan instan ke IndexedDB (< 5ms)
 * - Enkripsi sederhana (XOR + base64) untuk mencegah manipulasi
 * - Re-hydration otomatis saat app dibuka kembali
 * - Status tracking: pending, syncing, synced, failed
 */

import Dexie, { type EntityTable } from 'dexie';

// ==================== TYPES ====================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface AttendanceEntry {
  id?: number; // auto-increment
  bufferId: string; // unique buffer identifier
  idempotencyKey: string; // deterministic key for server-side dedupe
  employeeId: string;
  officeId: string;
  date: string;
  type: 'check_in' | 'check_out';
  latitude: number;
  longitude: number;
  distanceMeters: number;
  timestamp: string; // ISO string - waktu saat tombol ditekan
  localTimezoneOffset: number; // offset timezone lokal dalam menit
  syncStatus: SyncStatus;
  syncAttempts: number;
  lastSyncAttempt: string | null;
  syncError: string | null;
  serverRecordId: string | null;
  createdAt: string;
  encryptedPayload: string; // data terenkripsi untuk anti-tamper
  checksum: string; // hash untuk validasi integritas
}

export interface TodayCache {
  id?: number;
  employeeId: string;
  recordJson: string; // encrypted attendance record
  cachedAt: string;
  date: string;
}

// ==================== ENCRYPTION (Simple XOR + Base64) ====================

const ENCRYPT_KEY = 'ATT_GUARD_2026'; // Simple obfuscation key

function xorEncrypt(data: string, key: string): string {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

function xorDecrypt(encoded: string, key: string): string {
  const data = atob(encoded);
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function generateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function createIdempotencyKey(
  employeeId: string,
  date: string,
  type: 'check_in' | 'check_out',
  bufferId: string
): string {
  const seed = `${employeeId}:${date}:${type}:${bufferId}`;
  return `att-${date}-${type}-${generateChecksum(seed)}`;
}

// ==================== DATABASE ====================

class AttendanceDatabase extends Dexie {
  attendanceEntries!: EntityTable<AttendanceEntry, 'id'>;
  todayCache!: EntityTable<TodayCache, 'id'>;

  constructor() {
    super('AttendanceOfflineDB');
    this.version(1).stores({
      attendanceEntries: '++id, bufferId, employeeId, date, syncStatus, type, [employeeId+date+type]',
      todayCache: '++id, employeeId, date, [employeeId+date]',
    });
    this.version(2)
      .stores({
        attendanceEntries: '++id, bufferId, idempotencyKey, employeeId, date, syncStatus, type, [employeeId+date+type]',
        todayCache: '++id, employeeId, date, [employeeId+date]',
      })
      .upgrade(async (tx) => {
        await tx.table('attendanceEntries').toCollection().modify((entry: AttendanceEntry) => {
          if (!entry.idempotencyKey) {
            entry.idempotencyKey = createIdempotencyKey(
              entry.employeeId,
              entry.date,
              entry.type,
              entry.bufferId
            );
          }
        });
      });
  }
}

const db = new AttendanceDatabase();

// ==================== BUFFER OPERATIONS ====================

/**
 * Simpan attendance entry ke IndexedDB (instan, < 5ms)
 */
export async function saveAttendanceEntry(
  params: Omit<AttendanceEntry, 'id' | 'bufferId' | 'syncStatus' | 'syncAttempts' | 'lastSyncAttempt' | 'syncError' | 'serverRecordId' | 'createdAt' | 'encryptedPayload' | 'checksum' | 'localTimezoneOffset'>
): Promise<AttendanceEntry> {
  const now = new Date();
  const bufferId = `idb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Build raw payload for encryption
  const rawPayload = JSON.stringify({
    employeeId: params.employeeId,
    officeId: params.officeId,
    date: params.date,
    type: params.type,
    latitude: params.latitude,
    longitude: params.longitude,
    distanceMeters: params.distanceMeters,
    timestamp: params.timestamp,
    capturedAt: now.toISOString(),
  });

  const encryptedPayload = xorEncrypt(rawPayload, ENCRYPT_KEY);
  const checksum = generateChecksum(rawPayload);
  const idempotencyKey = createIdempotencyKey(params.employeeId, params.date, params.type, bufferId);

  const entry: AttendanceEntry = {
    ...params,
    bufferId,
    idempotencyKey,
    localTimezoneOffset: now.getTimezoneOffset(),
    syncStatus: 'pending',
    syncAttempts: 0,
    lastSyncAttempt: null,
    syncError: null,
    serverRecordId: null,
    createdAt: now.toISOString(),
    encryptedPayload,
    checksum,
  };

  const id = await db.attendanceEntries.add(entry);
  return { ...entry, id };
}

/**
 * Update sync status entry
 */
export async function updateEntryStatus(
  bufferId: string,
  updates: Partial<Pick<AttendanceEntry, 'syncStatus' | 'syncAttempts' | 'lastSyncAttempt' | 'syncError' | 'serverRecordId'>>
): Promise<void> {
  await db.attendanceEntries.where('bufferId').equals(bufferId).modify(updates);
}

/**
 * Ambil semua entries pending/failed untuk sync
 */
export async function getPendingEntries(employeeId?: string): Promise<AttendanceEntry[]> {
  const query = db.attendanceEntries
    .where('syncStatus')
    .anyOf('pending', 'failed');

  const entries = await query.toArray();
  
  if (employeeId) {
    return entries.filter(e => e.employeeId === employeeId && e.syncAttempts < 10);
  }
  return entries.filter(e => e.syncAttempts < 10);
}

/**
 * Cek apakah ada check-in hari ini di IndexedDB
 */
export async function hasCheckInToday(employeeId: string): Promise<AttendanceEntry | null> {
  const today = new Date().toISOString().split('T')[0];
  const entries = await db.attendanceEntries
    .where('[employeeId+date+type]')
    .equals([employeeId, today, 'check_in'])
    .toArray();
  
  return entries.find(e => e.syncStatus !== 'failed') || null;
}

/**
 * Cek apakah ada check-out hari ini di IndexedDB
 */
export async function hasCheckOutToday(employeeId: string): Promise<AttendanceEntry | null> {
  const today = new Date().toISOString().split('T')[0];
  const entries = await db.attendanceEntries
    .where('[employeeId+date+type]')
    .equals([employeeId, today, 'check_out'])
    .toArray();
  
  return entries.find(e => e.syncStatus !== 'failed') || null;
}

/**
 * Cleanup: hapus entries synced yang lebih dari N hari
 */
export async function cleanupOldEntries(expiryDays: number = 3): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - expiryDays);
  const cutoffStr = cutoff.toISOString();

  const toDelete = await db.attendanceEntries
    .filter(e => {
      if (e.syncStatus === 'synced') return true;
      if (e.createdAt < cutoffStr && e.syncAttempts >= 10) return true;
      return false;
    })
    .toArray();

  const ids = toDelete.map(e => e.id).filter((id): id is number => id !== undefined);
  await db.attendanceEntries.bulkDelete(ids);
  return ids.length;
}

/**
 * Validasi integritas data (anti-tamper check)
 */
export function validateEntryIntegrity(entry: AttendanceEntry): boolean {
  try {
    const decrypted = xorDecrypt(entry.encryptedPayload, ENCRYPT_KEY);
    const recalculated = generateChecksum(decrypted);
    return recalculated === entry.checksum;
  } catch {
    return false;
  }
}

/**
 * Decrypt entry payload
 */
export function decryptEntryPayload(entry: AttendanceEntry): Record<string, any> | null {
  try {
    const decrypted = xorDecrypt(entry.encryptedPayload, ENCRYPT_KEY);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

// ==================== TODAY CACHE (IndexedDB) ====================

/**
 * Cache today's attendance record ke IndexedDB
 */
export async function cacheTodayRecord(employeeId: string, record: any | null): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // Delete existing cache for today
  await db.todayCache
    .where('[employeeId+date]')
    .equals([employeeId, today])
    .delete();

  if (record) {
    const encrypted = xorEncrypt(JSON.stringify(record), ENCRYPT_KEY);
    await db.todayCache.add({
      employeeId,
      recordJson: encrypted,
      cachedAt: new Date().toISOString(),
      date: today,
    });
  }
}

/**
 * Load cached today attendance (untuk instant UI saat app load / re-hydration)
 */
export async function getCachedTodayRecord(employeeId: string): Promise<any | null> {
  const today = new Date().toISOString().split('T')[0];
  
  const cached = await db.todayCache
    .where('[employeeId+date]')
    .equals([employeeId, today])
    .first();

  if (!cached) return null;

  try {
    const decrypted = xorDecrypt(cached.recordJson, ENCRYPT_KEY);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

// ==================== RE-HYDRATION ====================

/**
 * Re-hydration: saat app dibuka kembali, cek dan return semua pending entries
 * untuk dilanjutkan sync-nya
 */
export async function rehydratePendingEntries(employeeId: string): Promise<{
  pendingCount: number;
  entries: AttendanceEntry[];
  todayCache: any | null;
}> {
  await recoverStuckSyncEntries(employeeId);
  const pending = await getPendingEntries(employeeId);
  const todayCache = await getCachedTodayRecord(employeeId);

  return {
    pendingCount: pending.length,
    entries: pending,
    todayCache,
  };
}

/**
 * Recovery untuk entry stuck di status syncing (mis. app crash / HP mati).
 * Entry yang sudah lebih lama dari maxStuckMinutes akan dikembalikan ke pending.
 */
export async function recoverStuckSyncEntries(
  employeeId: string,
  maxStuckMinutes: number = 5
): Promise<number> {
  const cutoff = Date.now() - (maxStuckMinutes * 60 * 1000);

  const stuckEntries = await db.attendanceEntries
    .where('syncStatus')
    .equals('syncing')
    .filter((entry) => {
      if (entry.employeeId !== employeeId) return false;
      const lastAttempt = entry.lastSyncAttempt ? new Date(entry.lastSyncAttempt).getTime() : 0;
      const lastKnown = Number.isFinite(lastAttempt) && lastAttempt > 0
        ? lastAttempt
        : new Date(entry.createdAt).getTime();
      return lastKnown <= cutoff;
    })
    .toArray();

  for (const entry of stuckEntries) {
    await updateEntryStatus(entry.bufferId, {
      syncStatus: 'pending',
      syncError: 'Recovered from interrupted sync',
    });
  }

  return stuckEntries.length;
}

/**
 * Get all entries count by status (for debugging/monitoring)
 */
export async function getEntriesStats(): Promise<Record<SyncStatus, number>> {
  const all = await db.attendanceEntries.toArray();
  const stats: Record<SyncStatus, number> = { pending: 0, syncing: 0, synced: 0, failed: 0 };
  all.forEach(e => { stats[e.syncStatus]++; });
  return stats;
}

// ==================== MIGRATION FROM LOCALSTORAGE ====================

/**
 * Migrasi data dari localStorage buffer lama ke IndexedDB
 */
export async function migrateFromLocalStorage(): Promise<number> {
  const BUFFER_KEY = 'attendance_buffer_v1';
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return 0;

    const items = JSON.parse(raw) as any[];
    let migrated = 0;

    for (const item of items) {
      if (item.syncStatus === 'synced') continue; // skip already synced

      // Check if already exists in IndexedDB
      const existing = await db.attendanceEntries
        .where('bufferId')
        .equals(item.id)
        .first();
      
      if (existing) continue;

      await saveAttendanceEntry({
        employeeId: item.employeeId,
        officeId: item.officeId,
        date: item.date,
        type: item.type,
        latitude: item.latitude,
        longitude: item.longitude,
        distanceMeters: item.distanceMeters,
        timestamp: item.timestamp,
      });
      migrated++;
    }

    // Clear old localStorage buffer after migration
    if (migrated > 0) {
      localStorage.removeItem(BUFFER_KEY);
      console.log(`[AttendanceDB] Migrated ${migrated} entries from localStorage to IndexedDB`);
    }

    return migrated;
  } catch (e) {
    console.error('[AttendanceDB] Migration failed:', e);
    return 0;
  }
}

export { db };
