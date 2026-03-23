export type RemoteErrorLoggingMode = "full" | "critical_only" | "paused";

export interface RemoteErrorLoggingSchedule {
  enabled: boolean;
  timezone: string;
  businessStart: string;
  businessEnd: string;
  businessMode: RemoteErrorLoggingMode;
  offHoursMode: RemoteErrorLoggingMode;
}

export interface RemoteErrorLoggingPolicy {
  mode: RemoteErrorLoggingMode;
  schedule: RemoteErrorLoggingSchedule;
  tenantOverrides: Record<string, RemoteErrorLoggingMode>;
}

const DEFAULT_TIMEZONE = "Asia/Jakarta";
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_SCHEDULE: RemoteErrorLoggingSchedule = {
  enabled: false,
  timezone: DEFAULT_TIMEZONE,
  businessStart: "07:00",
  businessEnd: "18:00",
  businessMode: "critical_only",
  offHoursMode: "full",
};

export const isRemoteErrorLoggingMode = (value: unknown): value is RemoteErrorLoggingMode =>
  value === "full" || value === "critical_only" || value === "paused";

export const normalizeRemoteErrorLoggingMode = (
  value: unknown,
  fallback: RemoteErrorLoggingMode = "full",
): RemoteErrorLoggingMode => {
  if (isRemoteErrorLoggingMode(value)) return value;
  return fallback;
};

const normalizeTimeOfDay = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (!TIME_OF_DAY_PATTERN.test(normalized)) return fallback;
  return normalized;
};

const parseTimeToMinutes = (value: string): number => {
  const match = TIME_OF_DAY_PATTERN.exec(value);
  if (!match) return 0;
  const hours = Number(match[1] || "0");
  const minutes = Number(match[2] || "0");
  return hours * 60 + minutes;
};

const resolveMinutesInTimezone = (now: Date, timezone: string): number => {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return hour * 60 + minute;
    }
  } catch {
    // Fallback to local time below.
  }
  return now.getHours() * 60 + now.getMinutes();
};

const isMinuteInWindow = (minute: number, start: number, end: number): boolean => {
  if (start === end) return true;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
};

const readObjectValue = (
  raw: Record<string, unknown>,
  keys: readonly string[],
): unknown => {
  for (const key of keys) {
    if (key in raw) {
      return raw[key];
    }
  }
  return undefined;
};

export const createDefaultRemoteErrorLoggingPolicy = (
  mode: RemoteErrorLoggingMode = "full",
): RemoteErrorLoggingPolicy => ({
  mode,
  schedule: {
    ...DEFAULT_SCHEDULE,
    offHoursMode: mode === "critical_only" ? "critical_only" : DEFAULT_SCHEDULE.offHoursMode,
  },
  tenantOverrides: {},
});

export const normalizeRemoteErrorLoggingPolicy = (
  value: unknown,
  fallbackMode: RemoteErrorLoggingMode = "full",
): RemoteErrorLoggingPolicy => {
  if (typeof value === "string") {
    const mode = normalizeRemoteErrorLoggingMode(value, fallbackMode);
    return createDefaultRemoteErrorLoggingPolicy(mode);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultRemoteErrorLoggingPolicy(fallbackMode);
  }

  const raw = value as Record<string, unknown>;
  const mode = normalizeRemoteErrorLoggingMode(
    readObjectValue(raw, ["mode", "default_mode", "defaultMode"]),
    fallbackMode,
  );

  const basePolicy = createDefaultRemoteErrorLoggingPolicy(mode);
  const overridesRaw = readObjectValue(raw, ["tenant_overrides", "tenantOverrides"]);
  const tenantOverrides: Record<string, RemoteErrorLoggingMode> = {};
  if (overridesRaw && typeof overridesRaw === "object" && !Array.isArray(overridesRaw)) {
    for (const [tenantId, flag] of Object.entries(overridesRaw as Record<string, unknown>)) {
      if (isRemoteErrorLoggingMode(flag)) {
        tenantOverrides[tenantId] = flag;
      }
    }
  }
  const scheduleRaw = readObjectValue(raw, ["schedule", "schedule_config", "scheduleConfig"]);
  if (!scheduleRaw || typeof scheduleRaw !== "object" || Array.isArray(scheduleRaw)) {
    return { ...basePolicy, tenantOverrides };
  }

  const scheduleRecord = scheduleRaw as Record<string, unknown>;
  const timezoneCandidate = readObjectValue(scheduleRecord, ["timezone", "time_zone", "timeZone"]);
  const enabledCandidate = readObjectValue(scheduleRecord, ["enabled", "is_enabled", "isEnabled"]);
  const businessStartCandidate = readObjectValue(scheduleRecord, ["business_start", "businessStart"]);
  const businessEndCandidate = readObjectValue(scheduleRecord, ["business_end", "businessEnd"]);
  const businessModeCandidate = readObjectValue(scheduleRecord, ["business_mode", "businessMode"]);
  const offHoursModeCandidate = readObjectValue(scheduleRecord, ["off_hours_mode", "offHoursMode"]);

  return {
    mode,
    schedule: {
      enabled: typeof enabledCandidate === "boolean" ? enabledCandidate : basePolicy.schedule.enabled,
      timezone:
        typeof timezoneCandidate === "string" && timezoneCandidate.trim().length > 0
          ? timezoneCandidate.trim()
          : basePolicy.schedule.timezone,
      businessStart: normalizeTimeOfDay(businessStartCandidate, basePolicy.schedule.businessStart),
      businessEnd: normalizeTimeOfDay(businessEndCandidate, basePolicy.schedule.businessEnd),
      businessMode: normalizeRemoteErrorLoggingMode(businessModeCandidate, basePolicy.schedule.businessMode),
      offHoursMode: normalizeRemoteErrorLoggingMode(offHoursModeCandidate, basePolicy.schedule.offHoursMode),
    },
    tenantOverrides,
  };
};

export const serializeRemoteErrorLoggingPolicy = (policy: RemoteErrorLoggingPolicy) => {
  const normalized = normalizeRemoteErrorLoggingPolicy(policy, policy.mode);
  return {
    mode: normalized.mode,
    schedule: {
      enabled: normalized.schedule.enabled,
      timezone: normalized.schedule.timezone,
      business_start: normalized.schedule.businessStart,
      business_end: normalized.schedule.businessEnd,
      business_mode: normalized.schedule.businessMode,
      off_hours_mode: normalized.schedule.offHoursMode,
    },
    tenant_overrides: normalized.tenantOverrides,
    updated_at: new Date().toISOString(),
  };
};

export const resolveEffectiveRemoteErrorLoggingMode = (
  policy: RemoteErrorLoggingPolicy,
  now: Date = new Date(),
): RemoteErrorLoggingMode => {
  const normalized = normalizeRemoteErrorLoggingPolicy(policy, policy.mode);
  if (!normalized.schedule.enabled) {
    return normalized.mode;
  }

  const minuteNow = resolveMinutesInTimezone(now, normalized.schedule.timezone);
  const start = parseTimeToMinutes(normalized.schedule.businessStart);
  const end = parseTimeToMinutes(normalized.schedule.businessEnd);
  const inBusinessHours = isMinuteInWindow(minuteNow, start, end);
  return inBusinessHours ? normalized.schedule.businessMode : normalized.schedule.offHoursMode;
};

export const resolveEffectiveRemoteErrorLoggingModeForTenant = (
  policy: RemoteErrorLoggingPolicy,
  tenantId?: string | null,
  now: Date = new Date(),
): RemoteErrorLoggingMode => {
  const normalized = normalizeRemoteErrorLoggingPolicy(policy, policy.mode);
  if (tenantId && normalized.tenantOverrides[tenantId]) {
    return normalized.tenantOverrides[tenantId];
  }
  return resolveEffectiveRemoteErrorLoggingMode(normalized, now);
};
