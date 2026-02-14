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

const currentRoute = () =>
  typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;

export const reportError = (error: unknown, context: string, metadata?: ErrorMetadata): string => {
  const normalized = normalizeError(error);
  const id = createLogId();
  const entry: AppErrorLogEntry = {
    id,
    timestamp: new Date().toISOString(),
    context,
    message: normalized.message,
    name: normalized.name,
    stack: normalized.stack,
    route: currentRoute(),
    metadata,
  };

  const existing = readEntries();
  existing.push(entry);
  writeEntries(existing);

  console.error(`[APP_ERROR ${id}] ${context}: ${normalized.message}`, {
    id,
    context,
    metadata,
    error,
  });

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

const isNoisyUrl = (url: string): boolean => {
  return (
    url.includes("/@vite/") ||
    url.includes("__vite_ping") ||
    url.includes("hot-update") ||
    url.includes("sockjs-node")
  );
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
      if (!isNoisyUrl(url)) {
        reportError(error, "fetch.network_error", {
          url,
          method,
          duration_ms: Date.now() - startedAt,
        });
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
    reportError(event.reason || "Unhandled promise rejection", "window.unhandledrejection");
  });

  installFetchErrorLogging();
};

export const appendErrorReference = (message: string, ref?: string | null) => {
  if (!ref) return message;
  return `${message} (Ref: ${ref})`;
};
