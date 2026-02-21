import { captureClientException } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";

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
  }
}

const STORAGE_KEY = "absensiku:error_logs";
const MAX_ENTRIES = 200;
let isInstalled = false;
let isFetchLoggingInstalled = false;
const FETCH_NETWORK_ERROR_THROTTLE_MS = 20000;
const FETCH_NETWORK_ERROR_CACHE_LIMIT = 250;
const GENERAL_ERROR_DEDUP_WINDOW_MS = 15000;
const GENERAL_ERROR_CACHE_LIMIT = 500;
const REMOTE_LOG_BATCH_SIZE = 10;
const REMOTE_LOG_DEBOUNCE_MS = 1500;
const REMOTE_LOG_RETRY_DELAY_MS = 5000;
let remoteFlushTimer: number | null = null;
let remoteFlushDueAt = 0;
let isRemoteFlushRunning = false;
const pendingRemoteLogs: AppErrorLogEntry[] = [];
let remoteContextCache: { userId: string | null; tenantId: string | null; expiresAt: number } | null = null;
const fetchNetworkErrorCache = new Map<string, { lastLoggedAt: number; suppressedCount: number }>();
const generalErrorDedupCache = new Map<string, { lastLoggedAt: number; suppressedCount: number; lastRef: string }>();

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

const buildGeneralErrorDedupKey = (context: string, message: string, name?: string, route?: string): string =>
  [
    normalizeTextForDedup(context),
    normalizeTextForDedup(message),
    normalizeTextForDedup(name),
    normalizeTextForDedup(normalizeRouteForDedup(route)),
  ].join("|");

const pruneGeneralErrorCache = (now: number) => {
  if (generalErrorDedupCache.size <= GENERAL_ERROR_CACHE_LIMIT) return;
  for (const [key, value] of generalErrorDedupCache) {
    if (now - value.lastLoggedAt > GENERAL_ERROR_DEDUP_WINDOW_MS * 3) {
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
  pruneGeneralErrorCache(now);
  const key = buildGeneralErrorDedupKey(context, message, name, route);
  const current = generalErrorDedupCache.get(key);
  if (!current) {
    return { shouldLog: true, suppressedCount: 0 };
  }

  if (now - current.lastLoggedAt < GENERAL_ERROR_DEDUP_WINDOW_MS) {
    current.suppressedCount += 1;
    generalErrorDedupCache.set(key, current);
    return { shouldLog: false, suppressedCount: current.suppressedCount, ref: current.lastRef };
  }

  return { shouldLog: true, suppressedCount: current.suppressedCount };
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
  const nextMetadata =
    budget.suppressedCount > 0
      ? {
          ...(metadata || {}),
          suppressed_repeat_count: budget.suppressedCount,
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

  const dedupKey = buildGeneralErrorDedupKey(context, normalized.message, normalized.name, route);
  generalErrorDedupCache.set(dedupKey, { lastLoggedAt: Date.now(), suppressedCount: 0, lastRef: id });

  const existing = readEntries();
  existing.push(entry);
  writeEntries(existing);
  pendingRemoteLogs.push(entry);
  if (pendingRemoteLogs.length > MAX_ENTRIES) {
    pendingRemoteLogs.splice(0, pendingRemoteLogs.length - MAX_ENTRIES);
  }
  const isCritical = !isNonCriticalClientError(context, normalized.message);
  scheduleRemoteFlush(isCritical ? 250 : REMOTE_LOG_DEBOUNCE_MS);

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

const parseResponseErrorPayload = async (response: Response): Promise<{ error?: string; traceId?: string }> => {
  try {
    const contentType = response.headers.get("content-type") || "";
    const clone = response.clone();
    if (contentType.includes("application/json")) {
      const body = await clone.json();
      return {
        error: typeof body?.error === "string" ? body.error : undefined,
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
        reportError(new Error(`HTTP ${response.status} ${response.statusText}`), "fetch.http_error", {
          url,
          method,
          status: response.status,
          duration_ms: Date.now() - startedAt,
          response_error: payload.error,
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
