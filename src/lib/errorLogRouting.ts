export type ErrorLogRoutingEntry = {
  metadata?: Record<string, unknown> | null;
  isArchived?: boolean | null;
  isNonCritical?: boolean | null;
  isResolved?: boolean | null;
};

export type ErrorSeverityTab =
  | "critical"
  | "non_critical"
  | "resolved_critical"
  | "archived_critical"
  | "archived_non_critical";

const readMetadataString = (entry: ErrorLogRoutingEntry, key: string): string | null => {
  if (!entry.metadata || typeof entry.metadata !== "object" || Array.isArray(entry.metadata)) return null;
  const raw = entry.metadata[key];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
};

export const getTopupRequestIdFromErrorEntry = (entry: ErrorLogRoutingEntry): string | null =>
  readMetadataString(entry, "topup_request_id") || readMetadataString(entry, "request_id");

export const resolveTabForErrorEntry = (
  entry: ErrorLogRoutingEntry,
  isNonCritical: boolean,
): ErrorSeverityTab => {
  const archived = Boolean(entry.isArchived);
  const resolved = Boolean(entry.isResolved);
  if (archived && isNonCritical) return "archived_non_critical";
  if (archived) return "archived_critical";
  if (isNonCritical) return "non_critical";
  if (resolved) return "resolved_critical";
  return "critical";
};

