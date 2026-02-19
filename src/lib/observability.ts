import * as Sentry from "@sentry/react";

type ObservabilityMetadata = Record<string, unknown> | undefined;

let initialized = false;
let sentryEnabled = false;

const getNumericEnv = (raw: string | undefined, fallback: number) => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

const toSafeRecord = (value: unknown): Record<string, string | number | boolean> => {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>);
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, val] of entries) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      safe[key] = val;
      continue;
    }
    if (val === null || val === undefined) continue;
    try {
      safe[key] = JSON.stringify(val).slice(0, 500);
    } catch {
      safe[key] = String(val).slice(0, 500);
    }
  }
  return safe;
};

export const initClientObservability = () => {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) {
    console.info("[observability] Sentry nonaktif (VITE_SENTRY_DSN kosong).");
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    tracesSampleRate: getNumericEnv(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0),
    replaysSessionSampleRate: getNumericEnv(import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0),
    replaysOnErrorSampleRate: getNumericEnv(import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 0.2),
  });

  sentryEnabled = true;
  console.info("[observability] Sentry aktif.");
};

export const captureClientException = (
  error: unknown,
  context: string,
  metadata?: ObservabilityMetadata,
  refId?: string,
) => {
  if (!sentryEnabled) return;

  const normalized = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  Sentry.withScope((scope) => {
    scope.setTag("app_context", context);
    if (refId) scope.setTag("ref_id", refId);
    if (metadata) scope.setContext("metadata", toSafeRecord(metadata));
    Sentry.captureException(normalized);
  });
};

