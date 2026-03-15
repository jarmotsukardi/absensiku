import { captureClientException } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";
import {
  createDefaultRemoteErrorLoggingPolicy,
  isRemoteErrorLoggingMode,
  normalizeRemoteErrorLoggingMode,
  normalizeRemoteErrorLoggingPolicy,
  resolveEffectiveRemoteErrorLoggingModeForTenant,
  resolveEffectiveRemoteErrorLoggingMode,
  type RemoteErrorLoggingMode,
  type RemoteErrorLoggingPolicy,
} from "@/lib/errorLoggingPolicy";

type ErrorMetadata = Record<string, unknown>;

export interface AppErrorLogEntry {
  id: string;
  timestamp: string;
  context: string;
  message: string;
  name?: string;
  stack?: string;
  route?: string;
  metadata?: ErrorMetadata;
}

declare global {
  interface Window {
    absensikuErrorLogs?: () => AppErrorLogEntry[];
    clearAbsensikuErrorLogs?: () => void;
    absensikuGetRemoteErrorLoggingMode?: () => RemoteErrorLoggingMode;
    absensikuSetRemoteErrorLoggingMode?: (mode: RemoteErrorLoggingMode | "default") => RemoteErrorLoggingMode;
  }
}

const STORAGE_KEY = "absensiku:error_logs";
const MAX_ENTRIES = 200;
let isInstalled = false;
let isFetchLoggingInstalled = false;
const FETCH_NETWORK_ERROR_THROTTLE_MS = 20000;
const FETCH_NETWORK_ERROR_CACHE_LIMIT = 250;
const GENERAL_ERROR_DEDUP_WINDOW_MS = 15000;
const NOISY_ERROR_DEDUP_WINDOW_MS = 180000;
const GENERAL_ERROR_CACHE_LIMIT = 500;
const REMOTE_LOG_BATCH_SIZE = 10;
const REMOTE_LOG_DEBOUNCE_MS = 1500;
const REMOTE_LOG_RETRY_DELAY_MS = 5000;
const REMOTE_LOGGING_POLICY_CACHE_TTL_MS = 2 * 60 * 1000;
const REMOTE_LOGGING_POLICY_SETTING_KEY = "client_error_logging_policy";
const REMOTE_LOGGING_MODE_OVERRIDE_STORAGE_KEY = "absensiku:remote_error_logging_mode_override";
const NON_CRITICAL_REMOTE_WINDOW_MS = 60000;
const NON_CRITICAL_REMOTE_PER_KEY_LIMIT = 2;
const NON_CRITICAL_REMOTE_GLOBAL_LIMIT = 25;
const NON_CRITICAL_REMOTE_BUDGET_CACHE_LIMIT = 500;
let remoteFlushTimer: number | null = null;
let remoteFlushDueAt = 0;
let isRemoteFlushRunning = false;
const pendingRemoteLogs: AppErrorLogEntry[] = [];
let remoteContextCache: { userId: string | null; tenantId: string | null; expiresAt: number } | null = null;
const fetchNetworkErrorCache = new Map<string, { lastLoggedAt: number; suppressedCount: number }>();
const generalErrorDedupCache = new Map<
  string,
  { lastLoggedAt: number; suppressedCount: number; lastRef: string; windowMs: number }
>();
const nonCriticalRemoteBudgetCache = new Map<string, { windowStartedAt: number; count: number }>();
let nonCriticalRemoteGlobalBudget = { windowStartedAt: 0, count: 0 };
let remoteLoggingPolicyCache: { policy: RemoteErrorLoggingPolicy; expiresAt: number } = {
  policy: createDefaultRemoteErrorLoggingPolicy("full"),
  expiresAt: 0,
};

const createLogId = () => {
  const compactIso = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace("T", "")
    .replaceAll(".", "")
    .replace("Z", "")
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ERR-${compactIso}-${random}`;
};

const readEntries = (): AppErrorLogEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppErrorLogEntry[]) : [];
  } catch {
    return [];
  }
};

const writeEntries = (entries: AppErrorLogEntry[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Ignore storage write failures (quota/private mode)
  }
};

const normalizeError = (error: unknown): { message: string; name?: string; stack?: string } => {
  if (error instanceof Error) {
    return {
      message: error.message || "Unknown error",
      name: error.name,
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: "Unknown error" };
  }
};

export const isNonCriticalClientError = (context?: string | null, message?: string | null): boolean => {
  const normalizedContext = (context || "").toLowerCase();
  const normalizedMessage = (message || "").toLowerCase();
  if (normalizedContext.includes("hard_request_notifications.partial_failure")) {
    return false;
  }
  if (
    normalizedContext.includes("org.layout.check_access") &&
    (
      normalizedMessage.includes("timeout verifikasi sesi organisasi") ||
      normalizedMessage.includes("timeout membaca role organisasi") ||
      normalizedMessage.includes("timeout membaca profil tenant organisasi") ||
      normalizedMessage.includes("timeout menentukan tenant operator")
    )
  ) {
    return true;
  }
  if (
    normalizedContext.includes("org.sidebar.fetch_onboarding_status") &&
    normalizedMessage.includes("timeout")
  ) {
    return true;
  }
  return (
    normalizedContext.includes("fetch.network_error") ||
    normalizedContext.includes("hard_request_notifications.fetch_employee_ids") ||
    normalizedContext.includes("hard_request_notifications.fetch_count") ||
    normalizedContext.includes("hard_request_notifications.fetch_latest") ||
    normalizedContext.includes("hard_request_notifications.realtime") ||
    normalizedContext.includes("persistent_notifications.realtime_channel") ||
    normalizedContext.includes("admin.error_logs.realtime_alert_webhook") ||
    normalizedMessage.includes("networkerror when attempting to fetch resource") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network request failed")
  );
};

const currentRoute = () =>
  typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;

const normalizeTextForDedup = (value?: string | null): string =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 280);

const normalizeNoisyMessageForDedup = (value?: string | null): string =>
  normalizeTextForDedup(value)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b\d{4,}\b/g, "<num>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>");

const normalizeRouteForDedup = (route?: string): string => {
  if (!route) return "";
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(route, base);
    return `${parsed.pathname}`;
  } catch {
    const [pathOnly] = route.split("?");
    return pathOnly || route;
  }
};

const isNoisyErrorContext = (context: string, message: string): boolean => {
  const normalizedContext = normalizeTextForDedup(context);
  const normalizedMessage = normalizeTextForDedup(message);
  return (
    normalizedContext.includes("org.layout.check_access") ||
    normalizedContext.includes("org.sidebar.fetch_onboarding_status") ||
    normalizedContext.includes("hard_request_notifications.realtime") ||
    normalizedContext.includes("persistent_notifications.realtime_channel") ||
    normalizedContext.includes("fetch.network_error") ||
    normalizedMessage.includes("channel error") ||
    normalizedMessage.includes("timed out")
  );
};

const buildGeneralErrorDedupKey = (context: string, message: string, name?: string, route?: string): string => {
  const useNoisyNormalization = isNoisyErrorContext(context, message);
  const normalizedMessage = useNoisyNormalization
    ? normalizeNoisyMessageForDedup(message)
    : normalizeTextForDedup(message);
  return [
    normalizeTextForDedup(context),
    normalizedMessage,
    normalizeTextForDedup(name),
    normalizeTextForDedup(normalizeRouteForDedup(route)),
  ].join("|");
};

const pruneGeneralErrorCache = (now: number) => {
  if (generalErrorDedupCache.size <= GENERAL_ERROR_CACHE_LIMIT) return;
  for (const [key, value] of generalErrorDedupCache) {
    if (now - value.lastLoggedAt > value.windowMs * 3) {
      generalErrorDedupCache.delete(key);
    }
  }
  if (generalErrorDedupCache.size <= GENERAL_ERROR_CACHE_LIMIT) return;
  const sorted = Array.from(generalErrorDedupCache.entries()).sort(
    (left, right) => left[1].lastLoggedAt - right[1].lastLoggedAt,
  );
  const overflow = generalErrorDedupCache.size - GENERAL_ERROR_CACHE_LIMIT;
  for (let index = 0; index < overflow; index += 1) {
    generalErrorDedupCache.delete(sorted[index][0]);
  }
};

const consumeGeneralErrorBudget = (context: string, message: string, name?: string, route?: string) => {
  const now = Date.now();
  const windowMs = isNoisyErrorContext(context, message)
    ? NOISY_ERROR_DEDUP_WINDOW_MS
    : GENERAL_ERROR_DEDUP_WINDOW_MS;
  pruneGeneralErrorCache(now);
  const key = buildGeneralErrorDedupKey(context, message, name, route);
  const current = generalErrorDedupCache.get(key);
  if (!current) {
    return { shouldLog: true, suppressedCount: 0, windowMs };
  }

  if (now - current.lastLoggedAt < current.windowMs) {
    current.suppressedCount += 1;
    generalErrorDedupCache.set(key, current);
    return {
      shouldLog: false,
      suppressedCount: current.suppressedCount,
      ref: current.lastRef,
      windowMs: current.windowMs,
    };
  }

  return { shouldLog: true, suppressedCount: current.suppressedCount, windowMs };
};

const pruneNonCriticalRemoteBudgetCache = (now: number) => {
  if (nonCriticalRemoteBudgetCache.size <= NON_CRITICAL_REMOTE_BUDGET_CACHE_LIMIT) return;
  for (const [key, value] of nonCriticalRemoteBudgetCache) {
    if (now - value.windowStartedAt > NON_CRITICAL_REMOTE_WINDOW_MS * 2) {
      nonCriticalRemoteBudgetCache.delete(key);
    }
  }
  if (nonCriticalRemoteBudgetCache.size <= NON_CRITICAL_REMOTE_BUDGET_CACHE_LIMIT) return;
  const sorted = Array.from(nonCriticalRemoteBudgetCache.entries()).sort(
    (left, right) => left[1].windowStartedAt - right[1].windowStartedAt,
  );
  const overflow = nonCriticalRemoteBudgetCache.size - NON_CRITICAL_REMOTE_BUDGET_CACHE_LIMIT;
  for (let index = 0; index < overflow; index += 1) {
    nonCriticalRemoteBudgetCache.delete(sorted[index][0]);
  }
};

const consumeNonCriticalRemoteBudget = (dedupKey: string): { shouldEnqueue: boolean; reason?: string } => {
  const now = Date.now();
  pruneNonCriticalRemoteBudgetCache(now);

  if (
    !nonCriticalRemoteGlobalBudget.windowStartedAt ||
    now - nonCriticalRemoteGlobalBudget.windowStartedAt >= NON_CRITICAL_REMOTE_WINDOW_MS
  ) {
    nonCriticalRemoteGlobalBudget = { windowStartedAt: now, count: 0 };
  }
  if (nonCriticalRemoteGlobalBudget.count >= NON_CRITICAL_REMOTE_GLOBAL_LIMIT) {
    return { shouldEnqueue: false, reason: "global_non_critical_budget_exceeded" };
  }

  const current = nonCriticalRemoteBudgetCache.get(dedupKey);
  if (!current || now - current.windowStartedAt >= NON_CRITICAL_REMOTE_WINDOW_MS) {
    nonCriticalRemoteBudgetCache.set(dedupKey, { windowStartedAt: now, count: 1 });
    nonCriticalRemoteGlobalBudget.count += 1;
    return { shouldEnqueue: true };
  }

  if (current.count >= NON_CRITICAL_REMOTE_PER_KEY_LIMIT) {
    return { shouldEnqueue: false, reason: "per_key_non_critical_budget_exceeded" };
  }

  current.count += 1;
  nonCriticalRemoteBudgetCache.set(dedupKey, current);
  nonCriticalRemoteGlobalBudget.count += 1;
  return { shouldEnqueue: true };
};

const readRemoteLoggingModeOverride = (): RemoteErrorLoggingMode | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REMOTE_LOGGING_MODE_OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    return isRemoteErrorLoggingMode(raw) ? raw : null;
  } catch {
    return null;
  }
};

const writeRemoteLoggingModeOverride = (mode: RemoteErrorLoggingMode | null) => {
  if (typeof window === "undefined") return;
  try {
    if (!mode) {
      window.localStorage.removeItem(REMOTE_LOGGING_MODE_OVERRIDE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(REMOTE_LOGGING_MODE_OVERRIDE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures.
  }
};

const getCurrentRemoteLoggingMode = (): RemoteErrorLoggingMode => {
  const override = readRemoteLoggingModeOverride();
  if (override) return override;
  return resolveEffectiveRemoteErrorLoggingMode(remoteLoggingPolicyCache.policy);
};

const resolveRemoteLoggingMode = async (): Promise<RemoteErrorLoggingMode> => {
  const override = readRemoteLoggingModeOverride();
  if (override) return override;

  const now = Date.now();
  const { tenantId } = await resolveRemoteContext();
  if (remoteLoggingPolicyCache.expiresAt > now) {
    return resolveEffectiveRemoteErrorLoggingModeForTenant(remoteLoggingPolicyCache.policy, tenantId);
  }

  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", REMOTE_LOGGING_POLICY_SETTING_KEY)
      .maybeSingle();

    if (error) throw error;
    const policy = normalizeRemoteErrorLoggingPolicy(data?.value, remoteLoggingPolicyCache.policy.mode);
    remoteLoggingPolicyCache = { policy, expiresAt: now + REMOTE_LOGGING_POLICY_CACHE_TTL_MS };
    return resolveEffectiveRemoteErrorLoggingModeForTenant(policy, tenantId);
  } catch {
    remoteLoggingPolicyCache = { policy: remoteLoggingPolicyCache.policy, expiresAt: now + 30 * 1000 };
    return resolveEffectiveRemoteErrorLoggingModeForTenant(remoteLoggingPolicyCache.policy, tenantId);
  }
};

export const getRemoteErrorLoggingMode = (): RemoteErrorLoggingMode => getCurrentRemoteLoggingMode();

export const setRemoteErrorLoggingMode = (mode: RemoteErrorLoggingMode): RemoteErrorLoggingMode => {
  const policy = normalizeRemoteErrorLoggingPolicy(
    { ...remoteLoggingPolicyCache.policy, mode: normalizeRemoteErrorLoggingMode(mode) },
    mode,
  );
  remoteLoggingPolicyCache = { policy, expiresAt: Date.now() + REMOTE_LOGGING_POLICY_CACHE_TTL_MS };
  return getCurrentRemoteLoggingMode();
};

export const setRemoteErrorLoggingPolicy = (policy: RemoteErrorLoggingPolicy): RemoteErrorLoggingMode => {
  const normalizedPolicy = normalizeRemoteErrorLoggingPolicy(policy, remoteLoggingPolicyCache.policy.mode);
  remoteLoggingPolicyCache = {
    policy: normalizedPolicy,
    expiresAt: Date.now() + REMOTE_LOGGING_POLICY_CACHE_TTL_MS,
  };
  return getCurrentRemoteLoggingMode();
};

export const setRemoteErrorLoggingModeOverride = (mode: RemoteErrorLoggingMode | null): RemoteErrorLoggingMode => {
  writeRemoteLoggingModeOverride(mode);
  if (mode) {
    remoteLoggingPolicyCache = {
      policy: normalizeRemoteErrorLoggingPolicy(
        { ...remoteLoggingPolicyCache.policy, mode },
        mode,
      ),
      expiresAt: Date.now() + REMOTE_LOGGING_POLICY_CACHE_TTL_MS,
    };
  }
  return getCurrentRemoteLoggingMode();
};

const resolveRemoteContext = async (): Promise<{ userId: string | null; tenantId: string | null }> => {
  const now = Date.now();
  if (remoteContextCache && remoteContextCache.expiresAt > now) {
    return { userId: remoteContextCache.userId, tenantId: remoteContextCache.tenantId };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData.session?.user?.id || null;
  const userId = sessionUserId || null;
  if (!userId) {
    remoteContextCache = { userId: null, tenantId: null, expiresAt: now + 30000 };
    return { userId: null, tenantId: null };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", userId)
    .not("tenant_id", "is", null)
    .limit(1);

  const tenantId = roleRows?.[0]?.tenant_id || null;
  remoteContextCache = { userId, tenantId, expiresAt: now + 60000 };
  return { userId, tenantId };
};

const scheduleRemoteFlush = (delayMs = REMOTE_LOG_DEBOUNCE_MS) => {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const nextDueAt = now + Math.max(0, delayMs);
  if (remoteFlushTimer !== null) {
    if (nextDueAt >= remoteFlushDueAt) return;
    window.clearTimeout(remoteFlushTimer);
    remoteFlushTimer = null;
  }
  remoteFlushDueAt = nextDueAt;
  remoteFlushTimer = window.setTimeout(() => {
    remoteFlushTimer = null;
    remoteFlushDueAt = 0;
    void flushRemoteLogs();
  }, Math.max(0, nextDueAt - now));
};

const flushRemoteLogs = async () => {
  if (isRemoteFlushRunning) return;
  if (pendingRemoteLogs.length === 0) return;

  isRemoteFlushRunning = true;
  let shouldRetry = false;
  try {
    const remoteLoggingMode = await resolveRemoteLoggingMode();
    if (remoteLoggingMode === "paused") {
      pendingRemoteLogs.splice(0, pendingRemoteLogs.length);
      return;
    }
    if (remoteLoggingMode === "critical_only") {
      const criticalEntries = pendingRemoteLogs.filter(
        (entry) => !isNonCriticalClientError(entry.context, entry.message),
      );
      pendingRemoteLogs.splice(0, pendingRemoteLogs.length, ...criticalEntries);
      if (pendingRemoteLogs.length === 0) return;
    }

    const { userId, tenantId } = await resolveRemoteContext();
    if (!userId) {
      shouldRetry = true;
      return;
    }

    const batch = pendingRemoteLogs.slice(0, REMOTE_LOG_BATCH_SIZE);
    const payload = batch.map((entry) => ({
      error_ref: entry.id,
      occurred_at: entry.timestamp,
      context: entry.context,
      message: entry.message,
      name: entry.name || null,
      stack: entry.stack || null,
      route: entry.route || null,
      metadata: entry.metadata ?? null,
      user_id: userId,
      tenant_id: tenantId,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      source: "web",
      is_non_critical: isNonCriticalClientError(entry.context, entry.message),
    }));

    const { error } = await supabase.from("client_error_logs" as never).insert(payload as never);
    if (error) throw error;
    pendingRemoteLogs.splice(0, batch.length);
  } catch {
    shouldRetry = true;
    // Do not recurse into reportError if centralized logging fails.
  } finally {
    isRemoteFlushRunning = false;
    if (pendingRemoteLogs.length > 0) {
      scheduleRemoteFlush(shouldRetry ? REMOTE_LOG_RETRY_DELAY_MS : REMOTE_LOG_DEBOUNCE_MS);
    }
  }
};

export const reportError = (error: unknown, context: string, metadata?: ErrorMetadata): string => {
  const normalized = normalizeError(error);
  const route = currentRoute();
  const budget = consumeGeneralErrorBudget(context, normalized.message, normalized.name, route);
  if (!budget.shouldLog && budget.ref) {
    return budget.ref;
  }

  const id = createLogId();
  const dedupKey = buildGeneralErrorDedupKey(context, normalized.message, normalized.name, route);
  const isCritical = !isNonCriticalClientError(context, normalized.message);
  const remoteMode = getCurrentRemoteLoggingMode();
  const remoteBudget =
    remoteMode === "paused"
      ? { shouldEnqueue: false, reason: "remote_logging_paused" }
      : remoteMode === "critical_only" && !isCritical
        ? { shouldEnqueue: false, reason: "remote_logging_critical_only" }
        : isCritical
          ? { shouldEnqueue: true }
          : consumeNonCriticalRemoteBudget(dedupKey);
  const nextMetadata =
    budget.suppressedCount > 0 || !remoteBudget.shouldEnqueue
      ? {
          ...(metadata || {}),
          ...(budget.suppressedCount > 0 ? { suppressed_repeat_count: budget.suppressedCount } : {}),
          ...(!remoteBudget.shouldEnqueue
            ? {
                remote_log_skipped: true,
                remote_skip_reason: remoteBudget.reason,
              }
            : {}),
        }
      : metadata;
  const entry: AppErrorLogEntry = {
    id,
    timestamp: new Date().toISOString(),
    context,
    message: normalized.message,
    name: normalized.name,
    stack: normalized.stack,
    route,
    metadata: nextMetadata,
  };

  generalErrorDedupCache.set(dedupKey, {
    lastLoggedAt: Date.now(),
    suppressedCount: 0,
    lastRef: id,
    windowMs: budget.windowMs,
  });

  const existing = readEntries();
  existing.push(entry);
  writeEntries(existing);
  if (remoteBudget.shouldEnqueue) {
    pendingRemoteLogs.push(entry);
    if (pendingRemoteLogs.length > MAX_ENTRIES) {
      pendingRemoteLogs.splice(0, pendingRemoteLogs.length - MAX_ENTRIES);
    }
    scheduleRemoteFlush(isCritical ? 250 : REMOTE_LOG_DEBOUNCE_MS);
  }

  console.error(`[APP_ERROR ${id}] ${context}: ${normalized.message}`, {
    id,
    context,
    metadata: nextMetadata,
    error,
  });

  try {
    captureClientException(error, context, nextMetadata, id);
  } catch {
    // Observability should never break the main flow.
  }

  return id;
};

export const getStoredErrorLogs = (): AppErrorLogEntry[] => readEntries();

export const clearStoredErrorLogs = () => writeEntries([]);

const resolveFetchUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
};

const resolveFetchMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const resolveFetchSignal = (input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined => {
  if (init?.signal) return init.signal;
  if (typeof Request !== "undefined" && input instanceof Request) return input.signal;
  return undefined;
};

const isAbortLikeError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    const message = (error.message || "").toLowerCase();
    if (error.name === "AbortError") return true;
    if (message.includes("aborted") || message.includes("aborterror")) return true;
    if (message.includes("signal is aborted")) return true;
  }
  return false;
};

const isNoisyUrl = (url: string): boolean => {
  return (
    url.includes("/@vite/") ||
    url.includes("__vite_ping") ||
    url.includes("hot-update") ||
    url.includes("sockjs-node") ||
    url.includes("client_error_logs")
  );
};

const normalizeFetchPathForNetworkKey = (pathname: string): string => {
  if (pathname.startsWith("/rest/v1/")) return "/rest/v1/*";
  if (pathname.startsWith("/auth/v1/")) return "/auth/v1/*";
  if (pathname.startsWith("/storage/v1/")) return "/storage/v1/*";
  if (pathname.startsWith("/functions/v1/")) return "/functions/v1/*";
  if (pathname.startsWith("/realtime/v1/")) return "/realtime/v1/*";
  return pathname;
};

const normalizeFetchUrlForNetworkKey = (url: string): string => {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, base);
    const normalizedPath = normalizeFetchPathForNetworkKey(parsed.pathname);
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    const [withoutQuery] = url.split("?");
    return withoutQuery || url;
  }
};

const normalizeNetworkErrorMessage = (error: unknown): string => {
  const message = normalizeError(error).message.toLowerCase();
  if (message.includes("failed to fetch")) return "failed_to_fetch";
  if (message.includes("networkerror")) return "network_error";
  if (message.includes("network request failed")) return "network_request_failed";
  return message.slice(0, 80);
};

const pruneFetchNetworkErrorCache = (now: number) => {
  if (fetchNetworkErrorCache.size <= FETCH_NETWORK_ERROR_CACHE_LIMIT) return;
  for (const [key, value] of fetchNetworkErrorCache) {
    if (now - value.lastLoggedAt > FETCH_NETWORK_ERROR_THROTTLE_MS * 3) {
      fetchNetworkErrorCache.delete(key);
    }
  }
  if (fetchNetworkErrorCache.size <= FETCH_NETWORK_ERROR_CACHE_LIMIT) return;
  const sorted = Array.from(fetchNetworkErrorCache.entries()).sort(
    (left, right) => left[1].lastLoggedAt - right[1].lastLoggedAt,
  );
  const overflow = fetchNetworkErrorCache.size - FETCH_NETWORK_ERROR_CACHE_LIMIT;
  for (let index = 0; index < overflow; index += 1) {
    fetchNetworkErrorCache.delete(sorted[index][0]);
  }
};

const consumeFetchNetworkErrorBudget = (url: string, method: string, error: unknown) => {
  const now = Date.now();
  pruneFetchNetworkErrorCache(now);
  const key = `${method}:${normalizeFetchUrlForNetworkKey(url)}:${normalizeNetworkErrorMessage(error)}`;
  const current = fetchNetworkErrorCache.get(key);
  if (!current) {
    fetchNetworkErrorCache.set(key, { lastLoggedAt: now, suppressedCount: 0 });
    return { shouldLog: true, suppressedCount: 0 };
  }

  if (now - current.lastLoggedAt < FETCH_NETWORK_ERROR_THROTTLE_MS) {
    current.suppressedCount += 1;
    fetchNetworkErrorCache.set(key, current);
    return { shouldLog: false, suppressedCount: current.suppressedCount };
  }

  const suppressedCount = current.suppressedCount;
  fetchNetworkErrorCache.set(key, { lastLoggedAt: now, suppressedCount: 0 });
  return { shouldLog: true, suppressedCount };
};

interface ParsedResponseErrorPayload {
  error?: string;
  traceId?: string;
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const normalizeHttpErrorText = (payload: ParsedResponseErrorPayload): string => {
  return [
    payload.code,
    payload.error,
    payload.message,
    payload.details,
    payload.hint,
  ]
    .map((part) => (part || "").toLowerCase())
    .join(" ");
};

const isExpectedAuthTokenHttpError = (
  url: string,
  status: number,
  payload: ParsedResponseErrorPayload,
): boolean => {
  if (!(status === 400 || status === 401)) return false;
  if (!url.includes("/auth/v1/token")) return false;
  const text = normalizeHttpErrorText(payload);
  return (
    text.includes("invalid_grant") ||
    text.includes("invalid login credentials") ||
    text.includes("invalid credentials") ||
    text.includes("invalid email or password") ||
    text.includes("email not confirmed")
  );
};

const isExpectedRpcAccessHttpError = (
  url: string,
  status: number,
  payload: ParsedResponseErrorPayload,
): boolean => {
  if (!(status === 400 || status === 401 || status === 403)) return false;
  if (!url.includes("/rest/v1/rpc/")) return false;
  const text = normalizeHttpErrorText(payload);
  return (
    text.includes("forbidden") ||
    text.includes("unauthorized") ||
    text.includes("permission denied") ||
    text.includes("insufficient privilege") ||
    text.includes("row level security") ||
    text.includes("access denied") ||
    text.includes("tidak memiliki akses") ||
    text.includes("code:42501") ||
    text.includes("p0001")
  );
};

const shouldSuppressHttpErrorLog = (
  url: string,
  status: number,
  payload: ParsedResponseErrorPayload,
): boolean => {
  return isExpectedAuthTokenHttpError(url, status, payload) || isExpectedRpcAccessHttpError(url, status, payload);
};

const parseResponseErrorPayload = async (response: Response): Promise<ParsedResponseErrorPayload> => {
  try {
    const contentType = response.headers.get("content-type") || "";
    const clone = response.clone();
    if (contentType.includes("application/json")) {
      const body = await clone.json();
      return {
        error: typeof body?.error === "string" ? body.error : undefined,
        code: typeof body?.code === "string" ? body.code : undefined,
        message: typeof body?.message === "string" ? body.message : undefined,
        details: typeof body?.details === "string" ? body.details : undefined,
        hint: typeof body?.hint === "string" ? body.hint : undefined,
        traceId: typeof body?.trace_id === "string" ? body.trace_id : undefined,
      };
    }
    const text = await clone.text();
    return { error: text ? text.slice(0, 300) : undefined };
  } catch {
    return {};
  }
};

export const installFetchErrorLogging = () => {
  if (typeof window === "undefined" || isFetchLoggingInstalled) return;
  const originalFetch = window.fetch.bind(window);
  isFetchLoggingInstalled = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = Date.now();
    const url = resolveFetchUrl(input);
    const method = resolveFetchMethod(input, init);
    const signal = resolveFetchSignal(input, init);

    try {
      const response = await originalFetch(input, init);
      if (response.status >= 400 && !isNoisyUrl(url)) {
        const payload = await parseResponseErrorPayload(response);
        if (shouldSuppressHttpErrorLog(url, response.status, payload)) {
          return response;
        }
        reportError(new Error(`HTTP ${response.status} ${response.statusText}`), "fetch.http_error", {
          url,
          method,
          status: response.status,
          duration_ms: Date.now() - startedAt,
          response_error: payload.error || payload.message,
          response_code: payload.code,
          response_details: payload.details,
          response_hint: payload.hint,
          trace_id: payload.traceId,
        });
      }
      return response;
    } catch (error) {
      if (signal?.aborted || isAbortLikeError(error)) {
        throw error;
      }

      if (!isNoisyUrl(url)) {
        const throttle = consumeFetchNetworkErrorBudget(url, method, error);
        if (throttle.shouldLog) {
          reportError(error, "fetch.network_error", {
            url,
            method,
            duration_ms: Date.now() - startedAt,
            online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
            suppressed_repeat_count: throttle.suppressedCount > 0 ? throttle.suppressedCount : undefined,
          });
        }
      }
      throw error;
    }
  };
};

export const installGlobalErrorLogging = () => {
  if (typeof window === "undefined" || isInstalled) return;
  isInstalled = true;

  window.absensikuErrorLogs = () => getStoredErrorLogs();
  window.clearAbsensikuErrorLogs = () => clearStoredErrorLogs();
  window.absensikuGetRemoteErrorLoggingMode = () => getRemoteErrorLoggingMode();
  window.absensikuSetRemoteErrorLoggingMode = (mode) =>
    setRemoteErrorLoggingModeOverride(mode === "default" ? null : mode);

  window.addEventListener("error", (event) => {
    reportError(event.error || event.message || "Uncaught window error", "window.error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isAbortLikeError(event.reason)) return;
    reportError(event.reason || "Unhandled promise rejection", "window.unhandledrejection");
  });

  // Flush pending remote logs when tab is hidden/offline transitions recover.
  window.addEventListener("pagehide", () => {
    void flushRemoteLogs();
  });
  window.addEventListener("online", () => {
    if (pendingRemoteLogs.length > 0) {
      scheduleRemoteFlush(200);
    }
  });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void flushRemoteLogs();
      }
    });
  }

  installFetchErrorLogging();
};

export const appendErrorReference = (message: string, ref?: string | null) => {
  if (!ref) return message;
  return `${message} (Ref: ${ref})`;
};
