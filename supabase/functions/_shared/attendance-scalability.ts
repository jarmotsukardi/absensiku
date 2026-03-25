export type PeakHourWindowSetting = {
  name?: string;
  start: string;
  end: string;
};

export type AttendanceScalabilitySetting = {
  effective_tier?: 'small' | 'medium' | 'large' | 'enterprise';
  peak_hour_enabled?: boolean;
  peak_hour_windows?: PeakHourWindowSetting[];
  peak_hour_hold_sync?: boolean;
  queue_only_ingest?: boolean;
  offpeak_release_strategy?: 'client_after_window' | 'worker_preferred' | 'worker_only';
};

export type BatchIngestDecision = {
  shouldProcessQueueNow: boolean;
  reason: 'immediate_processing' | 'queue_only_ingest' | 'peak_hour_hold_sync' | 'worker_only_release';
  peakHourActive: boolean;
  queueOnlyIngest: boolean;
  offpeakReleaseStrategy: 'client_after_window' | 'worker_preferred' | 'worker_only';
};

const DEFAULT_PEAK_HOUR_WINDOWS: PeakHourWindowSetting[] = [
  { name: 'check_in', start: '06:30', end: '09:00' },
  { name: 'check_out', start: '16:00', end: '18:30' },
];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeTimeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  const [hour, minute] = trimmed.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const normalizePeakHourWindows = (value: unknown): PeakHourWindowSetting[] => {
  if (!Array.isArray(value)) return DEFAULT_PEAK_HOUR_WINDOWS;

  const normalized = value
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

  return normalized.length > 0 ? normalized : DEFAULT_PEAK_HOUR_WINDOWS;
};

export const normalizeAttendanceScalabilitySetting = (value: unknown): Required<AttendanceScalabilitySetting> => {
  const record = isObject(value) ? value : {};
  const effectiveTier = record.effective_tier === 'small'
    || record.effective_tier === 'medium'
    || record.effective_tier === 'large'
    || record.effective_tier === 'enterprise'
    ? record.effective_tier
    : 'medium';
  const offpeakReleaseStrategy = record.offpeak_release_strategy === 'client_after_window'
    || record.offpeak_release_strategy === 'worker_preferred'
    || record.offpeak_release_strategy === 'worker_only'
    ? record.offpeak_release_strategy
    : 'client_after_window';

  return {
    effective_tier: effectiveTier,
    peak_hour_enabled: typeof record.peak_hour_enabled === 'boolean' ? record.peak_hour_enabled : true,
    peak_hour_windows: normalizePeakHourWindows(record.peak_hour_windows),
    peak_hour_hold_sync: typeof record.peak_hour_hold_sync === 'boolean'
      ? record.peak_hour_hold_sync
      : effectiveTier === 'large' || effectiveTier === 'enterprise',
    queue_only_ingest: typeof record.queue_only_ingest === 'boolean'
      ? record.queue_only_ingest
      : effectiveTier === 'enterprise',
    offpeak_release_strategy: offpeakReleaseStrategy,
  };
};

const getJakartaMinutes = (now: Date): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return (hour * 60) + minute;
};

const toMinutes = (value: string): number => {
  const [hour, minute] = value.split(':').map(Number);
  return (hour * 60) + minute;
};

const isInsidePeakWindow = (windows: PeakHourWindowSetting[], now: Date): boolean => {
  const currentMinutes = getJakartaMinutes(now);
  return windows.some((window) => {
    const startMinutes = toMinutes(window.start);
    const endMinutes = toMinutes(window.end);

    if (endMinutes >= startMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  });
};

export const decideBatchIngestPolicy = (
  value: unknown,
  now: Date = new Date(),
): BatchIngestDecision => {
  const setting = normalizeAttendanceScalabilitySetting(value);
  const peakHourActive = setting.peak_hour_enabled && isInsidePeakWindow(setting.peak_hour_windows, now);

  if (setting.queue_only_ingest) {
    return {
      shouldProcessQueueNow: false,
      reason: 'queue_only_ingest',
      peakHourActive,
      queueOnlyIngest: true,
      offpeakReleaseStrategy: setting.offpeak_release_strategy,
    };
  }

  if (peakHourActive && setting.peak_hour_hold_sync) {
    return {
      shouldProcessQueueNow: false,
      reason: 'peak_hour_hold_sync',
      peakHourActive: true,
      queueOnlyIngest: false,
      offpeakReleaseStrategy: setting.offpeak_release_strategy,
    };
  }

  if (setting.offpeak_release_strategy === 'worker_only') {
    return {
      shouldProcessQueueNow: false,
      reason: 'worker_only_release',
      peakHourActive,
      queueOnlyIngest: false,
      offpeakReleaseStrategy: setting.offpeak_release_strategy,
    };
  }

  return {
    shouldProcessQueueNow: true,
    reason: 'immediate_processing',
    peakHourActive,
    queueOnlyIngest: setting.queue_only_ingest,
    offpeakReleaseStrategy: setting.offpeak_release_strategy,
  };
};
