import { env } from "./env.js";
import { supabaseRestRequest } from "./supabase.js";

export type RateLimitConfig = {
  windowSeconds: number;
  maxAttempts: number;
};

type RateLimitRow = {
  attempt_count?: number;
  first_attempt_at?: string | null;
  last_attempt_at?: string | null;
  locked_until?: string | null;
};

const DEFAULT_CONFIG: RateLimitConfig = {
  windowSeconds: 600,
  maxAttempts: 5,
};

const hasRateLimitStorage = () => Boolean(env.supabaseServiceRoleKey);

const parseConfig = (value: unknown): RateLimitConfig => {
  if (!value) return DEFAULT_CONFIG;
  if (typeof value === "string") {
    try {
      return parseConfig(JSON.parse(value));
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const enabled = record.enabled !== undefined ? Boolean(record.enabled) : true;
    const maxAttempts = Number(record.max_attempts ?? record.maxAttempts);
    const windowSecondsRaw =
      Number(record.window_seconds ?? record.windowSeconds) ||
      Number(record.lockout_duration_minutes ?? record.lockoutDurationMinutes) * 60;

    if (!enabled) {
      return { windowSeconds: 0, maxAttempts: 0 };
    }

    return {
      windowSeconds: Number.isFinite(windowSecondsRaw) && windowSecondsRaw > 0
        ? windowSecondsRaw
        : DEFAULT_CONFIG.windowSeconds,
      maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : DEFAULT_CONFIG.maxAttempts,
    };
  }
  return DEFAULT_CONFIG;
};

export const getRateLimitConfig = async (): Promise<RateLimitConfig> => {
  if (env.rateLimitDisabled || !hasRateLimitStorage()) {
    return { windowSeconds: 0, maxAttempts: 0 };
  }
  const response = await supabaseRestRequest(
    "/rest/v1/system_settings?select=value&key=eq.login_rate_limit_config&limit=1",
    { method: "GET", useServiceRole: true }
  );
  if (!response.ok || !Array.isArray(response.json)) {
    return DEFAULT_CONFIG;
  }
  const row = response.json[0] as Record<string, unknown> | undefined;
  if (!row) return DEFAULT_CONFIG;
  return parseConfig(row.value);
};

const getRateLimitRow = async (identifier: string) => {
  const query = new URLSearchParams({
    select: "attempt_count,first_attempt_at,last_attempt_at,locked_until",
    identifier: `eq.${identifier}`,
    attempt_type: "eq.login",
    limit: "1",
  }).toString();

  const response = await supabaseRestRequest(`/rest/v1/rate_limit_otp?${query}`, {
    method: "GET",
    useServiceRole: true,
  });

  if (!response.ok || !Array.isArray(response.json)) {
    throw new Error("RATE_LIMIT_QUERY_FAILED");
  }

  return (response.json[0] as RateLimitRow | undefined) ?? null;
};

export const isRateLimited = async (
  identifier: string,
  config: RateLimitConfig,
  now = new Date()
): Promise<{ limited: boolean; lockedUntil?: string | null; row?: RateLimitRow | null }> => {
  if (!hasRateLimitStorage() || config.windowSeconds <= 0 || config.maxAttempts <= 0) {
    return { limited: false, row: null };
  }

  const row = await getRateLimitRow(identifier);
  const nowIso = now.toISOString();
  const lockedUntil = row?.locked_until ?? null;
  if (lockedUntil && lockedUntil > nowIso) {
    return { limited: true, lockedUntil, row };
  }

  if (!row?.last_attempt_at) {
    return { limited: false, row };
  }

  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000).toISOString();
  const isOutsideWindow = row.last_attempt_at < windowStart;
  if (isOutsideWindow) {
    return { limited: false, row };
  }

  const attempts = Number(row.attempt_count ?? 0);
  if (attempts >= config.maxAttempts) {
    return { limited: true, lockedUntil: row.locked_until ?? null, row };
  }

  return { limited: false, row };
};

export const recordAttempt = async (
  identifier: string,
  config: RateLimitConfig,
  now = new Date()
) => {
  if (!hasRateLimitStorage() || config.windowSeconds <= 0 || config.maxAttempts <= 0) return;

  const row = await getRateLimitRow(identifier).catch(() => null);
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000).toISOString();
  const lastAttemptAt = row?.last_attempt_at ?? null;
  const isOutsideWindow = !lastAttemptAt || lastAttemptAt < windowStart;
  const currentCount = isOutsideWindow ? 0 : Number(row?.attempt_count ?? 0);
  const newCount = currentCount + 1;
  const firstAttemptAt = isOutsideWindow ? nowIso : row?.first_attempt_at ?? nowIso;
  const lockedUntil = newCount >= config.maxAttempts ? new Date(now.getTime() + config.windowSeconds * 1000).toISOString() : null;

  await supabaseRestRequest("/rest/v1/rate_limit_otp?on_conflict=identifier,attempt_type", {
    method: "POST",
    useServiceRole: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      identifier,
      attempt_type: "login",
      attempt_count: newCount,
      first_attempt_at: firstAttemptAt,
      last_attempt_at: nowIso,
      locked_until: lockedUntil,
    },
  });
};
