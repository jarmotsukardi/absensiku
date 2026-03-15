export const LATE_PERMISSION_REASON_PREFIX = "[IZIN_TERLAMBAT_V1]";
export const EARLY_LEAVE_PERMISSION_REASON_PREFIX = "[IZIN_PULANG_CEPAT_V1]";
export const APPROVED_LATE_PERMISSION_NOTE_MARKER = "[IZIN_TERLAMBAT_DISETUJUI]";
export const APPROVED_EARLY_LEAVE_PERMISSION_NOTE_MARKER = "[IZIN_PULANG_CEPAT_DISETUJUI]";
export const AUTO_CANCEL_ON_TIME_REJECTION_MARKER = "[AUTO_CANCEL_ON_TIME]";
export const AUTO_CANCEL_ON_TIME_REJECTION_MESSAGE = "Otomatis dibatalkan karena absen masuk tercatat tepat waktu.";

const ETA_LINE_PREFIX = "ETA:";
const EARLY_LEAVE_TIME_LINE_PREFIX = "JAM_PULANG:";
const REASON_LINE_PREFIX = "ALASAN:";

export interface LatePermissionReasonDetails {
  isLatePermission: boolean;
  estimatedArrivalTime: string | null;
  reason: string;
}

export interface LatePermissionQueueItem {
  requestDate: string;
  estimatedArrivalTime: string;
  reason: string;
  queuedAt: string;
}

export interface EarlyLeavePermissionReasonDetails {
  isEarlyLeavePermission: boolean;
  plannedLeaveTime: string | null;
  reason: string;
}

export interface EarlyLeavePermissionQueueItem {
  requestDate: string;
  plannedLeaveTime: string;
  reason: string;
  queuedAt: string;
}

export interface SpecialPermissionNoteDetails {
  hasApprovedLatePermission: boolean;
  hasApprovedEarlyLeavePermission: boolean;
  cleanedNote: string;
}

export const makeLatePermissionQueueKey = (employeeId: string) =>
  `absensiku_late_permission_queue_v1_${employeeId}`;

export const makeEarlyLeavePermissionQueueKey = (employeeId: string) =>
  `absensiku_early_leave_permission_queue_v1_${employeeId}`;

export const isLatePermissionReason = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  return value.startsWith(LATE_PERMISSION_REASON_PREFIX);
};

export const isEarlyLeavePermissionReason = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  return value.startsWith(EARLY_LEAVE_PERMISSION_REASON_PREFIX);
};

export const buildAutoCancelLatePermissionRejectionReason = (): string =>
  `${AUTO_CANCEL_ON_TIME_REJECTION_MARKER} ${AUTO_CANCEL_ON_TIME_REJECTION_MESSAGE}`;

export const isAutoCanceledLatePermissionRejectionReason = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  return value.trim().startsWith(AUTO_CANCEL_ON_TIME_REJECTION_MARKER);
};

export const buildLatePermissionReason = (estimatedArrivalTime: string, reason: string): string => {
  const trimmedReason = reason.trim();
  return [
    LATE_PERMISSION_REASON_PREFIX,
    `${ETA_LINE_PREFIX} ${estimatedArrivalTime}`,
    `${REASON_LINE_PREFIX} ${trimmedReason}`,
  ].join("\n");
};

export const buildEarlyLeavePermissionReason = (plannedLeaveTime: string, reason: string): string => {
  const trimmedReason = reason.trim();
  return [
    EARLY_LEAVE_PERMISSION_REASON_PREFIX,
    `${EARLY_LEAVE_TIME_LINE_PREFIX} ${plannedLeaveTime}`,
    `${REASON_LINE_PREFIX} ${trimmedReason}`,
  ].join("\n");
};

export const parseLatePermissionReason = (value: unknown): LatePermissionReasonDetails => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      isLatePermission: false,
      estimatedArrivalTime: null,
      reason: "",
    };
  }

  if (!isLatePermissionReason(value)) {
    return {
      isLatePermission: false,
      estimatedArrivalTime: null,
      reason: value.trim(),
    };
  }

  const lines = value.split("\n").map((line) => line.trim());
  const etaLine = lines.find((line) => line.startsWith(ETA_LINE_PREFIX)) ?? "";
  const reasonLine = lines.find((line) => line.startsWith(REASON_LINE_PREFIX)) ?? "";

  const estimatedArrivalTimeRaw = etaLine.slice(ETA_LINE_PREFIX.length).trim();
  const estimatedArrivalTime = estimatedArrivalTimeRaw || null;

  const reasonFromLine = reasonLine.slice(REASON_LINE_PREFIX.length).trim();
  const fallbackReason = lines
    .slice(1)
    .filter((line) => !line.startsWith(ETA_LINE_PREFIX) && !line.startsWith(REASON_LINE_PREFIX))
    .join(" ")
    .trim();

  return {
    isLatePermission: true,
    estimatedArrivalTime,
    reason: reasonFromLine || fallbackReason,
  };
};

export const parseEarlyLeavePermissionReason = (value: unknown): EarlyLeavePermissionReasonDetails => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      isEarlyLeavePermission: false,
      plannedLeaveTime: null,
      reason: "",
    };
  }

  if (!isEarlyLeavePermissionReason(value)) {
    return {
      isEarlyLeavePermission: false,
      plannedLeaveTime: null,
      reason: value.trim(),
    };
  }

  const lines = value.split("\n").map((line) => line.trim());
  const timeLine = lines.find((line) => line.startsWith(EARLY_LEAVE_TIME_LINE_PREFIX)) ?? "";
  const reasonLine = lines.find((line) => line.startsWith(REASON_LINE_PREFIX)) ?? "";

  const plannedLeaveTimeRaw = timeLine.slice(EARLY_LEAVE_TIME_LINE_PREFIX.length).trim();
  const plannedLeaveTime = plannedLeaveTimeRaw || null;

  const reasonFromLine = reasonLine.slice(REASON_LINE_PREFIX.length).trim();
  const fallbackReason = lines
    .slice(1)
    .filter((line) => !line.startsWith(EARLY_LEAVE_TIME_LINE_PREFIX) && !line.startsWith(REASON_LINE_PREFIX))
    .join(" ")
    .trim();

  return {
    isEarlyLeavePermission: true,
    plannedLeaveTime,
    reason: reasonFromLine || fallbackReason,
  };
};

export const parseSpecialPermissionNotes = (value: unknown): SpecialPermissionNoteDetails => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      hasApprovedLatePermission: false,
      hasApprovedEarlyLeavePermission: false,
      cleanedNote: "",
    };
  }

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let hasApprovedLatePermission = false;
  let hasApprovedEarlyLeavePermission = false;
  const cleanedLines: string[] = [];

  lines.forEach((line) => {
    if (line === APPROVED_LATE_PERMISSION_NOTE_MARKER) {
      hasApprovedLatePermission = true;
      return;
    }
    if (line === APPROVED_EARLY_LEAVE_PERMISSION_NOTE_MARKER) {
      hasApprovedEarlyLeavePermission = true;
      return;
    }
    cleanedLines.push(line);
  });

  return {
    hasApprovedLatePermission,
    hasApprovedEarlyLeavePermission,
    cleanedNote: cleanedLines.join("\n").trim(),
  };
};

export const readLatePermissionQueue = (employeeId: string): LatePermissionQueueItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(makeLatePermissionQueueKey(employeeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LatePermissionQueueItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<LatePermissionQueueItem>;
      return (
        typeof candidate.requestDate === "string" &&
        typeof candidate.estimatedArrivalTime === "string" &&
        typeof candidate.reason === "string" &&
        typeof candidate.queuedAt === "string"
      );
    });
  } catch {
    return [];
  }
};

export const writeLatePermissionQueue = (
  employeeId: string,
  items: LatePermissionQueueItem[],
): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(makeLatePermissionQueueKey(employeeId), JSON.stringify(items));
  } catch {
    // noop
  }
};

export const readEarlyLeavePermissionQueue = (employeeId: string): EarlyLeavePermissionQueueItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(makeEarlyLeavePermissionQueueKey(employeeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is EarlyLeavePermissionQueueItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<EarlyLeavePermissionQueueItem>;
      return (
        typeof candidate.requestDate === "string" &&
        typeof candidate.plannedLeaveTime === "string" &&
        typeof candidate.reason === "string" &&
        typeof candidate.queuedAt === "string"
      );
    });
  } catch {
    return [];
  }
};

export const writeEarlyLeavePermissionQueue = (
  employeeId: string,
  items: EarlyLeavePermissionQueueItem[],
): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(makeEarlyLeavePermissionQueueKey(employeeId), JSON.stringify(items));
  } catch {
    // noop
  }
};
