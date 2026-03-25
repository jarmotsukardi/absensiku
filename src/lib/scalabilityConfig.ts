/**
 * scalabilityConfig.ts
 * 
 * Konfigurasi skalabilitas otomatis berdasarkan jumlah user.
 * Menyediakan rekomendasi parameter optimal untuk setiap tier:
 * - Small: ≤5.000 user
 * - Medium: 5.001–20.000 user
 * - Large: 20.001–100.000 user
 * - Enterprise: 100.001–500.000 user
 */

import { reportError } from "@/lib/errorLogger";

export type ScalabilityTier = 'small' | 'medium' | 'large' | 'enterprise';
export type ScalabilityMode = 'manual' | 'auto';
export type OffpeakReleaseStrategy = 'client_after_window' | 'worker_preferred' | 'worker_only';
export type AdminVisibilityMode = 'final_only' | 'final_only_with_backlog' | 'final_and_pending_summary';
export type LogoutPendingPolicy = 'keep_local_pending' | 'warn_then_logout' | 'block_logout';

export interface PeakHourWindowSetting {
  name?: string;
  start: string;
  end: string;
}

export interface AttendanceScalabilitySetting {
  version?: number;
  mode?: ScalabilityMode;
  tier?: ScalabilityTier;
  suggested_tier?: ScalabilityTier;
  effective_tier?: ScalabilityTier;
  measured_active_employees?: number;
  measured_at?: string;
  updated_at?: string;
  last_transition_at?: string;
  transition_reason?: string;
  peak_hour_enabled?: boolean;
  peak_hour_windows?: PeakHourWindowSetting[];
  peak_hour_hold_sync?: boolean;
  queue_only_ingest?: boolean;
  offpeak_release_strategy?: OffpeakReleaseStrategy;
  release_jitter_min_ms?: number;
  release_jitter_max_ms?: number;
  admin_visibility_mode?: AdminVisibilityMode;
  logout_pending_policy?: LogoutPendingPolicy;
}

export interface ScalabilityProfile {
  tier: ScalabilityTier;
  label: string;
  maxUsers: number;
  description: string;
  // Sync strategy
  syncMode: 'immediate' | 'deferred';
  deferredSyncDelayMs: number;
  // Jitter
  jitterPeakMaxMs: number;
  jitterOffpeakMaxMs: number;
  // Backoff
  backoffBaseMs: number;
  backoffMaxMs: number;
  backoffMaxRetries: number;
  // Circuit Breaker
  cbFailureThreshold: number;
  cbRecoveryTimeoutMs: number;
  cbSuccessThreshold: number;
  // Timeout
  rpcTimeoutBaseMs: number;
  rpcTimeoutMaxMs: number;
  // Batch
  batchSize: number;
  edgeFunctionMaxBatch: number;
  syncIntervalMinMs: number;
  syncIntervalMaxMs: number;
  // Buffer
  bufferExpiryDays: number;
  maxSyncAttempts: number;
  // Queue message
  showQueueMessage: boolean;
  estimatedQueueSeconds: number;
}

const PROFILES: Record<ScalabilityTier, ScalabilityProfile> = {
  small: {
    tier: 'small',
    label: 'Small (≤5.000 user)',
    maxUsers: 5000,
    description: 'Cocok untuk organisasi kecil. Delay minimal, respons cepat.',
    syncMode: 'immediate',
    deferredSyncDelayMs: 0,
    jitterPeakMaxMs: 5000,
    jitterOffpeakMaxMs: 1000,
    backoffBaseMs: 1000,
    backoffMaxMs: 16000,
    backoffMaxRetries: 3,
    cbFailureThreshold: 8,
    cbRecoveryTimeoutMs: 15000,
    cbSuccessThreshold: 2,
    rpcTimeoutBaseMs: 10000,
    rpcTimeoutMaxMs: 30000,
    batchSize: 5,
    edgeFunctionMaxBatch: 10,
    syncIntervalMinMs: 8000,
    syncIntervalMaxMs: 15000,
    bufferExpiryDays: 2,
    maxSyncAttempts: 3,
    showQueueMessage: false,
    estimatedQueueSeconds: 5,
  },
  medium: {
    tier: 'medium',
    label: 'Medium (5.001–20.000 user)',
    maxUsers: 20000,
    description: 'Untuk organisasi menengah. Jitter moderat, circuit breaker aktif.',
    syncMode: 'deferred',
    deferredSyncDelayMs: 10000,
    jitterPeakMaxMs: 30000,
    jitterOffpeakMaxMs: 5000,
    backoffBaseMs: 2000,
    backoffMaxMs: 32000,
    backoffMaxRetries: 5,
    cbFailureThreshold: 5,
    cbRecoveryTimeoutMs: 30000,
    cbSuccessThreshold: 2,
    rpcTimeoutBaseMs: 15000,
    rpcTimeoutMaxMs: 45000,
    batchSize: 10,
    edgeFunctionMaxBatch: 25,
    syncIntervalMinMs: 15000,
    syncIntervalMaxMs: 30000,
    bufferExpiryDays: 3,
    maxSyncAttempts: 5,
    showQueueMessage: true,
    estimatedQueueSeconds: 30,
  },
  large: {
    tier: 'large',
    label: 'Large (20.001–100.000 user)',
    maxUsers: 100000,
    description: 'Untuk skala besar. Jitter diperlebar, batching agresif.',
    syncMode: 'deferred',
    deferredSyncDelayMs: 30000,
    jitterPeakMaxMs: 60000,
    jitterOffpeakMaxMs: 15000,
    backoffBaseMs: 3000,
    backoffMaxMs: 60000,
    backoffMaxRetries: 7,
    cbFailureThreshold: 4,
    cbRecoveryTimeoutMs: 45000,
    cbSuccessThreshold: 3,
    rpcTimeoutBaseMs: 20000,
    rpcTimeoutMaxMs: 60000,
    batchSize: 25,
    edgeFunctionMaxBatch: 50,
    syncIntervalMinMs: 25000,
    syncIntervalMaxMs: 50000,
    bufferExpiryDays: 5,
    maxSyncAttempts: 7,
    showQueueMessage: true,
    estimatedQueueSeconds: 60,
  },
  enterprise: {
    tier: 'enterprise',
    label: 'Enterprise (100.001–500.000 user)',
    maxUsers: 500000,
    description: 'Skala enterprise. Jitter agresif 0-120s, queue message aktif.',
    syncMode: 'deferred',
    deferredSyncDelayMs: 60000,
    jitterPeakMaxMs: 120000,
    jitterOffpeakMaxMs: 30000,
    backoffBaseMs: 5000,
    backoffMaxMs: 120000,
    backoffMaxRetries: 10,
    cbFailureThreshold: 3,
    cbRecoveryTimeoutMs: 60000,
    cbSuccessThreshold: 3,
    rpcTimeoutBaseMs: 30000,
    rpcTimeoutMaxMs: 90000,
    batchSize: 50,
    edgeFunctionMaxBatch: 100,
    syncIntervalMinMs: 45000,
    syncIntervalMaxMs: 90000,
    bufferExpiryDays: 7,
    maxSyncAttempts: 10,
    showQueueMessage: true,
    estimatedQueueSeconds: 120,
  },
};

const STORAGE_KEY = 'scalability_config_v1';
const STORAGE_POLICY_KEY = 'attendance_scalability_setting_v2';
export const DEFAULT_PEAK_HOUR_WINDOWS: PeakHourWindowSetting[] = [
  { name: 'check_in', start: '06:30', end: '09:00' },
  { name: 'check_out', start: '16:00', end: '18:30' },
];

const VALID_MODES: ScalabilityMode[] = ['manual', 'auto'];
const VALID_RELEASE_STRATEGIES: OffpeakReleaseStrategy[] = ['client_after_window', 'worker_preferred', 'worker_only'];
const VALID_ADMIN_VISIBILITY_MODES: AdminVisibilityMode[] = ['final_only', 'final_only_with_backlog', 'final_and_pending_summary'];
const VALID_LOGOUT_PENDING_POLICIES: LogoutPendingPolicy[] = ['keep_local_pending', 'warn_then_logout', 'block_logout'];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function isValidScalabilityTier(value: unknown): value is ScalabilityTier {
  return typeof value === 'string' && value in PROFILES;
}

function normalizeTimeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  const [hh, mm] = trimmed.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizePeakHourWindows(value: unknown): PeakHourWindowSetting[] {
  if (!Array.isArray(value)) {
    return DEFAULT_PEAK_HOUR_WINDOWS;
  }

  const windows = value
    .map((item) => {
      if (!isObject(item)) return null;
      const start = normalizeTimeString(item.start);
      const end = normalizeTimeString(item.end);
      if (!start || !end) return null;
      return {
        name: typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : undefined,
        start,
        end,
      } satisfies PeakHourWindowSetting;
    })
    .filter((item): item is PeakHourWindowSetting => Boolean(item));

  return windows.length > 0 ? windows : DEFAULT_PEAK_HOUR_WINDOWS;
}

export function normalizeAttendanceScalabilitySetting(value: unknown): Required<
  Pick<
    AttendanceScalabilitySetting,
    | 'version'
    | 'mode'
    | 'tier'
    | 'suggested_tier'
    | 'effective_tier'
    | 'peak_hour_enabled'
    | 'peak_hour_windows'
    | 'peak_hour_hold_sync'
    | 'queue_only_ingest'
    | 'offpeak_release_strategy'
    | 'release_jitter_min_ms'
    | 'release_jitter_max_ms'
    | 'admin_visibility_mode'
    | 'logout_pending_policy'
  >
> & AttendanceScalabilitySetting {
  const record = isObject(value) ? value : {};
  const tier = isValidScalabilityTier(record.tier) ? record.tier : 'medium';
  const effectiveTier = isValidScalabilityTier(record.effective_tier) ? record.effective_tier : tier;
  const suggestedTier = isValidScalabilityTier(record.suggested_tier) ? record.suggested_tier : effectiveTier;
  const mode = VALID_MODES.includes(record.mode as ScalabilityMode) ? (record.mode as ScalabilityMode) : 'manual';
  const peakHourWindows = normalizePeakHourWindows(record.peak_hour_windows);
  const peakHourEnabled = typeof record.peak_hour_enabled === 'boolean' ? record.peak_hour_enabled : true;
  const peakHourHoldSync = typeof record.peak_hour_hold_sync === 'boolean'
    ? record.peak_hour_hold_sync
    : effectiveTier === 'large' || effectiveTier === 'enterprise';
  const queueOnlyIngest = typeof record.queue_only_ingest === 'boolean'
    ? record.queue_only_ingest
    : effectiveTier === 'enterprise';
  const releaseStrategy = VALID_RELEASE_STRATEGIES.includes(record.offpeak_release_strategy as OffpeakReleaseStrategy)
    ? (record.offpeak_release_strategy as OffpeakReleaseStrategy)
    : 'client_after_window';
  const adminVisibilityMode = VALID_ADMIN_VISIBILITY_MODES.includes(record.admin_visibility_mode as AdminVisibilityMode)
    ? (record.admin_visibility_mode as AdminVisibilityMode)
    : 'final_only_with_backlog';
  const logoutPendingPolicy = VALID_LOGOUT_PENDING_POLICIES.includes(record.logout_pending_policy as LogoutPendingPolicy)
    ? (record.logout_pending_policy as LogoutPendingPolicy)
    : 'keep_local_pending';
  const releaseJitterMinMs = typeof record.release_jitter_min_ms === 'number' ? record.release_jitter_min_ms : 15000;
  const releaseJitterMaxMs = typeof record.release_jitter_max_ms === 'number'
    ? Math.max(record.release_jitter_max_ms, releaseJitterMinMs)
    : 120000;

  return {
    ...record,
    version: typeof record.version === 'number' ? record.version : 2,
    mode,
    tier,
    suggested_tier: suggestedTier,
    effective_tier: effectiveTier,
    peak_hour_enabled: peakHourEnabled,
    peak_hour_windows: peakHourWindows,
    peak_hour_hold_sync: peakHourHoldSync,
    queue_only_ingest: queueOnlyIngest,
    offpeak_release_strategy: releaseStrategy,
    release_jitter_min_ms: releaseJitterMinMs,
    release_jitter_max_ms: releaseJitterMaxMs,
    admin_visibility_mode: adminVisibilityMode,
    logout_pending_policy: logoutPendingPolicy,
  };
}

export function getScalabilityPeakHourLabel(windows: PeakHourWindowSetting[] = DEFAULT_PEAK_HOUR_WINDOWS): string {
  return windows.map((window) => `${window.start}-${window.end}`).join(', ');
}

/**
 * Get recommended tier based on user count
 */
export function getRecommendedTier(userCount: number): ScalabilityTier {
  if (userCount <= 5000) return 'small';
  if (userCount <= 20000) return 'medium';
  if (userCount <= 100000) return 'large';
  return 'enterprise';
}

/**
 * Get all available profiles
 */
export function getAllProfiles(): ScalabilityProfile[] {
  return Object.values(PROFILES);
}

/**
 * Get profile by tier
 */
export function getProfile(tier: ScalabilityTier): ScalabilityProfile {
  return PROFILES[tier];
}

/**
 * Save active scalability config
 */
export function saveScalabilityConfig(tier: ScalabilityTier): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tier,
      savedAt: new Date().toISOString(),
    }));
  } catch (error: unknown) {
    reportError(error, "scalability_config.save", { tier });
  }
}

export function saveAttendanceScalabilitySetting(setting: AttendanceScalabilitySetting): void {
  try {
    const normalized = normalizeAttendanceScalabilitySetting(setting);
    localStorage.setItem(STORAGE_POLICY_KEY, JSON.stringify(normalized));
    saveScalabilityConfig(normalized.effective_tier);
  } catch (error: unknown) {
    reportError(error, "attendance_scalability.save", { setting });
  }
}

export function loadAttendanceScalabilitySetting(): ReturnType<typeof normalizeAttendanceScalabilitySetting> {
  try {
    const raw = localStorage.getItem(STORAGE_POLICY_KEY);
    if (!raw) return normalizeAttendanceScalabilitySetting({});
    return normalizeAttendanceScalabilitySetting(JSON.parse(raw));
  } catch {
    return normalizeAttendanceScalabilitySetting({});
  }
}

/**
 * Load active scalability config (default: medium)
 */
export function loadScalabilityConfig(): ScalabilityProfile {
  try {
    const setting = loadAttendanceScalabilitySetting();
    if (isValidScalabilityTier(setting.effective_tier)) {
      return PROFILES[setting.effective_tier] || PROFILES.medium;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PROFILES.medium;
    const parsed = JSON.parse(raw);
    const tier = isValidScalabilityTier(parsed?.tier) ? parsed.tier : 'medium';
    return PROFILES[tier] || PROFILES.medium;
  } catch {
    return PROFILES.medium;
  }
}

/**
 * Get active tier name
 */
export function getActiveTier(): ScalabilityTier {
  return loadScalabilityConfig().tier;
}

/**
 * Saat jam sibuk, semua tier dipaksa memakai deferred write untuk meredam spike.
 * Tier small tetap immediate di luar peak hours.
 */
export function shouldUseDeferredAttendanceSync(
  profile: ScalabilityProfile,
  isBusyHours: boolean,
): boolean {
  return profile.syncMode === 'deferred' || isBusyHours;
}

/**
 * Hitung delay deferred efektif.
 * Untuk tier small pada jam sibuk, gunakan delay pendek agar tetap responsif
 * tetapi tidak langsung menembak RPC foreground.
 */
export function getDeferredAttendanceSyncDelayMs(
  profile: ScalabilityProfile,
  isBusyHours: boolean,
): number {
  if (profile.syncMode === 'deferred') {
    return profile.deferredSyncDelayMs;
  }

  if (isBusyHours) {
    return Math.max(5000, Math.min(profile.jitterPeakMaxMs, 15000));
  }

  return 0;
}

/**
 * Calculate estimated throughput
 */
export function calculateThroughput(profile: ScalabilityProfile): {
  peakReqPerSec: number;
  offpeakReqPerSec: number;
  maxConcurrentBatch: number;
} {
  const peakWindow = profile.jitterPeakMaxMs / 1000;
  const offpeakWindow = profile.jitterOffpeakMaxMs / 1000;
  
  return {
    peakReqPerSec: Math.round(profile.maxUsers / peakWindow),
    offpeakReqPerSec: Math.round(profile.maxUsers / offpeakWindow),
    maxConcurrentBatch: Math.ceil(profile.maxUsers / profile.batchSize),
  };
}
