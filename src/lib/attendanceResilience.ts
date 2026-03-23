/**
 * attendanceResilience.ts
 * 
 * Strategi skalabilitas untuk menangani 20.000+ user bersamaan:
 * 
 * 1. ADAPTIVE JITTER (0-30s) - Menyesuaikan delay berdasarkan peak hours & retry count
 * 2. EXPONENTIAL BACKOFF - Retry dengan delay yang meningkat (2s → 4s → 8s → 16s → 32s)
 * 3. CIRCUIT BREAKER - Auto-stop request saat server overloaded
 */

// ==================== TYPES ====================

export interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  lastSuccessTime: number;
}

// ==================== DYNAMIC CONFIG ====================

import { loadScalabilityConfig } from './scalabilityConfig';

function getConfig() {
  const profile = loadScalabilityConfig();
  return {
    JITTER_BASE_MIN_MS: 0,
    JITTER_PEAK_MAX_MS: profile.jitterPeakMaxMs,
    JITTER_OFFPEAK_MAX_MS: profile.jitterOffpeakMaxMs,
    BACKOFF_BASE_MS: profile.backoffBaseMs,
    BACKOFF_MAX_MS: profile.backoffMaxMs,
    BACKOFF_MAX_RETRIES: profile.backoffMaxRetries,
    CB_FAILURE_THRESHOLD: profile.cbFailureThreshold,
    CB_RECOVERY_TIMEOUT_MS: profile.cbRecoveryTimeoutMs,
    CB_SUCCESS_THRESHOLD: profile.cbSuccessThreshold,
    RPC_TIMEOUT_BASE_MS: profile.rpcTimeoutBaseMs,
    RPC_TIMEOUT_MAX_MS: profile.rpcTimeoutMaxMs,
    SHOW_QUEUE_MESSAGE: profile.showQueueMessage,
    ESTIMATED_QUEUE_SECONDS: profile.estimatedQueueSeconds,
  };
}

const CB_STORAGE_KEY = 'attendance_circuit_breaker';
const DYNAMIC_PEAK_STORAGE_KEY = 'attendance_dynamic_peak_windows_v1';

interface DynamicPeakWindow {
  startMinute: number;
  endMinute: number;
}

interface DynamicPeakPayload {
  windows: DynamicPeakWindow[];
  updatedAt: string;
}

function normalizeMinute(minute: number): number {
  if (!Number.isFinite(minute)) return 0;
  const normalized = Math.floor(minute) % 1440;
  return normalized < 0 ? normalized + 1440 : normalized;
}

function parseTimeToMinute(value?: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(':');
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function isInWindow(current: number, window: DynamicPeakWindow): boolean {
  // Handle cross-midnight windows
  if (window.startMinute <= window.endMinute) {
    return current >= window.startMinute && current <= window.endMinute;
  }
  return current >= window.startMinute || current <= window.endMinute;
}

function loadDynamicPeakWindows(): DynamicPeakWindow[] {
  try {
    const raw = localStorage.getItem(DYNAMIC_PEAK_STORAGE_KEY);
    if (!raw) return [];
    const payload = JSON.parse(raw) as DynamicPeakPayload;
    if (!payload?.updatedAt || !Array.isArray(payload.windows)) return [];

    // Expire after 48h to avoid stale schedule.
    const ageMs = Date.now() - new Date(payload.updatedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > (48 * 60 * 60 * 1000)) return [];

    return payload.windows.filter((w) => (
      Number.isFinite(w.startMinute) && Number.isFinite(w.endMinute)
    ));
  } catch {
    return [];
  }
}

/**
 * Set dynamic peak windows based on work hours schedule.
 * Each shift contributes 2 windows:
 * - near check-in: time_in - 60m .. time_in + 30m
 * - near check-out: time_out - 30m .. time_out + 60m
 */
export function setDynamicPeakWindowsFromWorkHours(
  workHours: Array<{ time_in?: string | null; time_out?: string | null }>,
): void {
  try {
    const windows: DynamicPeakWindow[] = [];

    for (const row of workHours) {
      const inMinute = parseTimeToMinute(row.time_in);
      const outMinute = parseTimeToMinute(row.time_out);

      if (inMinute !== null) {
        windows.push({
          startMinute: normalizeMinute(inMinute - 60),
          endMinute: normalizeMinute(inMinute + 30),
        });
      }

      if (outMinute !== null) {
        windows.push({
          startMinute: normalizeMinute(outMinute - 30),
          endMinute: normalizeMinute(outMinute + 60),
        });
      }
    }

    if (windows.length === 0) return;

    const payload: DynamicPeakPayload = {
      windows,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(DYNAMIC_PEAK_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
}

// ==================== 1. ADAPTIVE JITTER ====================

/**
 * Deteksi apakah sekarang peak hours (jam absensi)
 * Peak: 06:00-09:00 (check-in) dan 15:00-18:00 (check-out)
 */
export function isPeakHours(): boolean {
  const now = new Date();
  const currentMinute = (now.getHours() * 60) + now.getMinutes();
  const dynamicWindows = loadDynamicPeakWindows();

  if (dynamicWindows.length > 0) {
    return dynamicWindows.some((window) => isInWindow(currentMinute, window));
  }

  const hour = now.getHours();
  return (hour >= 6 && hour <= 9) || (hour >= 15 && hour <= 18);
}

/**
 * Generate adaptive jitter delay
 * - Peak hours: 0-30s (lebih lama untuk distribusi load)
 * - Off-peak: 0-5s (cepat karena traffic rendah)
 * - Retry: tambah multiplier berdasarkan retry count
 */
export function generateAdaptiveJitter(retryCount: number = 0): number {
  const cfg = getConfig();
  const isPeak = isPeakHours();
  const maxMs = isPeak ? cfg.JITTER_PEAK_MAX_MS : cfg.JITTER_OFFPEAK_MAX_MS;
  
  const baseJitter = Math.floor(Math.random() * (maxMs - cfg.JITTER_BASE_MIN_MS + 1)) + cfg.JITTER_BASE_MIN_MS;
  const retryMultiplier = 1 + (retryCount * 0.5);
  
  return Math.min(Math.floor(baseJitter * retryMultiplier), cfg.JITTER_PEAK_MAX_MS);
}

/**
 * Get queue message info for UI
 */
export function getQueueMessageInfo(jitterMs: number): {
  show: boolean;
  message: string;
  estimatedSeconds: number;
} {
  const cfg = getConfig();
  const estimatedSec = Math.max(Math.ceil(jitterMs / 1000), cfg.ESTIMATED_QUEUE_SECONDS);
  return {
    show: cfg.SHOW_QUEUE_MESSAGE && jitterMs > 5000,
    message: `Antrean sistem sedang padat, data Anda telah tersimpan di perangkat dan sedang mengantre untuk dikirim (Estimasi: ${estimatedSec} detik). Jangan tutup aplikasi Anda.`,
    estimatedSeconds: estimatedSec,
  };
}

/**
 * Delay with abort support
 */
export function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

// ==================== 2. EXPONENTIAL BACKOFF ====================

/**
 * Calculate backoff delay dengan jitter untuk menghindari synchronized retries
 */
export function calculateBackoff(attempt: number): number {
  const cfg = getConfig();
  const baseDelay = cfg.BACKOFF_BASE_MS * Math.pow(2, Math.min(attempt, cfg.BACKOFF_MAX_RETRIES - 1));
  const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(Math.floor(baseDelay + jitter), cfg.BACKOFF_MAX_MS);
}

/**
 * Execute function with exponential backoff retry
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    signal?: AbortSignal;
    onRetry?: (attempt: number, delayMs: number, error: Error) => void;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const cfg = getConfig();
  const { 
    maxRetries = cfg.BACKOFF_MAX_RETRIES, 
    signal, 
    onRetry,
    shouldRetry = () => true 
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return await fn();
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      lastError = normalizedError;

      // Don't retry if aborted
      if (normalizedError.name === 'AbortError') throw normalizedError;

      // Don't retry if shouldRetry returns false
      if (!shouldRetry(normalizedError)) throw normalizedError;

      // Don't retry on last attempt
      if (attempt >= maxRetries) break;

      const backoffMs = calculateBackoff(attempt);
      onRetry?.(attempt + 1, backoffMs, normalizedError);

      await delayWithAbort(backoffMs, signal);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// ==================== 3. CIRCUIT BREAKER ====================

/**
 * Load circuit breaker state from localStorage
 */
function loadCircuitBreaker(): CircuitBreakerState {
  try {
    const raw = localStorage.getItem(CB_STORAGE_KEY);
    if (!raw) return getDefaultCBState();
    return JSON.parse(raw);
  } catch {
    return getDefaultCBState();
  }
}

function getDefaultCBState(): CircuitBreakerState {
  return {
    status: 'closed',
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0,
    lastSuccessTime: Date.now(),
  };
}

function saveCircuitBreaker(state: CircuitBreakerState): void {
  try {
    localStorage.setItem(CB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

/**
 * Check if circuit breaker allows request
 */
export function canMakeRequest(): { allowed: boolean; reason?: string; state: CircuitBreakerState } {
  const state = loadCircuitBreaker();

  if (state.status === 'closed') {
    return { allowed: true, state };
  }

  if (state.status === 'open') {
    const cfg = getConfig();
    const elapsed = Date.now() - state.lastFailureTime;
    if (elapsed >= cfg.CB_RECOVERY_TIMEOUT_MS) {
      // Transition to half-open
      const newState: CircuitBreakerState = { ...state, status: 'half-open', successCount: 0 };
      saveCircuitBreaker(newState);
      return { allowed: true, state: newState };
    }

    const remainingSec = Math.ceil((cfg.CB_RECOVERY_TIMEOUT_MS - elapsed) / 1000);
    return { 
      allowed: false, 
      reason: `Server sedang sibuk. Coba lagi dalam ${remainingSec} detik.`,
      state,
    };
  }

  // Half-open: allow limited requests
  return { allowed: true, state };
}

/**
 * Record successful request
 */
export function recordSuccess(): void {
  const state = loadCircuitBreaker();

  if (state.status === 'half-open') {
    state.successCount++;
    state.lastSuccessTime = Date.now();

    if (state.successCount >= getConfig().CB_SUCCESS_THRESHOLD) {
      // Close the circuit — server is healthy again
      saveCircuitBreaker(getDefaultCBState());
      return;
    }
  } else {
    // Reset failure count on success
    state.failureCount = 0;
    state.lastSuccessTime = Date.now();
  }

  saveCircuitBreaker(state);
}

/**
 * Record failed request
 */
export function recordFailure(): void {
  const state = loadCircuitBreaker();

  state.failureCount++;
  state.lastFailureTime = Date.now();

  if (state.status === 'half-open') {
    // Any failure in half-open → open again
    state.status = 'open';
    state.successCount = 0;
  } else if (state.failureCount >= getConfig().CB_FAILURE_THRESHOLD) {
    // Threshold reached → open circuit
    state.status = 'open';
  }

  saveCircuitBreaker(state);
}

/**
 * Get circuit breaker status info for UI
 */
export function getCircuitBreakerInfo(): {
  status: string;
  isHealthy: boolean;
  message: string;
} {
  const state = loadCircuitBreaker();

  switch (state.status) {
    case 'closed':
      return { status: 'closed', isHealthy: true, message: 'Server normal' };
    case 'open':
      return { status: 'open', isHealthy: false, message: 'Server sibuk, menunggu pemulihan...' };
    case 'half-open':
      return { status: 'half-open', isHealthy: true, message: 'Menguji koneksi server...' };
    default:
      return { status: 'unknown', isHealthy: true, message: '' };
  }
}

// ==================== 4. ADAPTIVE TIMEOUT ====================

/**
 * RPC call dengan adaptive timeout
 * Timeout meningkat seiring retry untuk memberi server lebih banyak waktu
 */
export function getAdaptiveTimeout(retryCount: number = 0): number {
  const cfg = getConfig();
  const timeout = cfg.RPC_TIMEOUT_BASE_MS + (retryCount * 10000);
  return Math.min(timeout, cfg.RPC_TIMEOUT_MAX_MS);
}

export function withTimeout<T>(
  promiseOrFactory: Promise<T> | (() => Promise<T>),
  ms: number,
  msg = `Request timeout after ${ms}ms`,
): Promise<T> {
  const promise =
    typeof promiseOrFactory === "function"
      ? (promiseOrFactory as () => Promise<T>)()
      : promiseOrFactory;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

// ==================== 5. RETRY CLASSIFIER ====================

/**
 * Tentukan apakah error layak di-retry
 * - Timeout: YES (server mungkin sibuk)
 * - Network error: YES (koneksi terputus sementara)
 * - 429 Too Many Requests: YES (rate limited)
 * - 500+ Server Error: YES
 * - 400 Bad Request: NO (data salah, retry sia-sia)
 * - 401/403 Auth Error: NO
 */
export function isRetryableError(error: unknown): boolean {
  const errorRecord = (typeof error === "object" && error !== null) ? (error as Record<string, unknown>) : {};
  const message = (typeof errorRecord.message === "string" ? errorRecord.message : "").toLowerCase();
  
  // Timeout errors - always retry
  if (message.includes('timeout')) return true;
  
  // Network errors
  if (message.includes('network') || message.includes('fetch')) return true;
  
  // HTTP status codes from Supabase
  const status = errorRecord.status ?? errorRecord.code;
  if (status === 429 || status === 503 || status === 502 || status === 500) return true;
  
  // Client errors - don't retry
  if (status === 400 || status === 401 || status === 403 || status === 404) return false;
  
  // Default: retry for unknown errors
  return true;
}
