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

export type ScalabilityTier = 'small' | 'medium' | 'large' | 'enterprise';

export interface ScalabilityProfile {
  tier: ScalabilityTier;
  label: string;
  maxUsers: number;
  description: string;
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
    bufferExpiryDays: 7,
    maxSyncAttempts: 10,
    showQueueMessage: true,
    estimatedQueueSeconds: 120,
  },
};

const STORAGE_KEY = 'scalability_config_v1';

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
  } catch {}
}

/**
 * Load active scalability config (default: medium)
 */
export function loadScalabilityConfig(): ScalabilityProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PROFILES.medium;
    const parsed = JSON.parse(raw);
    return PROFILES[parsed.tier as ScalabilityTier] || PROFILES.medium;
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
