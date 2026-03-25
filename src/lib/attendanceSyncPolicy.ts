import {
  type AttendanceScalabilitySetting,
  type ScalabilityProfile,
  getDeferredAttendanceSyncDelayMs,
  normalizeAttendanceScalabilitySetting,
  shouldUseDeferredAttendanceSync,
} from "@/lib/scalabilityConfig";

export interface AttendanceSyncDecision {
  shouldDefer: boolean;
  deferredBaseMs: number;
  shouldTriggerClientSync: boolean;
  detailMessage: string;
}

export type AttendanceActionType = "check_in" | "check_out";

export interface DeferredAttendanceMessages {
  scheduledMessage: string;
  delayedMessage: string;
  successMessage: string;
  initialBufferedMessage: string;
}

export interface AttendancePendingStateSnapshot {
  status: "buffered" | "jitter" | "processing" | "success" | "error";
  type: AttendanceActionType;
  message: string;
  detail: string;
  syncStatus: "pending" | "syncing" | "synced" | "failed";
  jitterMs?: number;
}

export interface AttendanceSyncFailureMessage {
  userMessage: string;
  detailMessage: string;
}

export interface AttendanceActionResult {
  success: boolean;
  message: string;
  distance?: number;
}

export function resolveAttendanceSyncDecision(
  profile: ScalabilityProfile,
  isBusyHours: boolean,
  runtimeSetting?: AttendanceScalabilitySetting,
): AttendanceSyncDecision {
  const setting = normalizeAttendanceScalabilitySetting(runtimeSetting);
  const holdDuringPeak = isBusyHours && setting.peak_hour_enabled && setting.peak_hour_hold_sync;
  const workerOnly = setting.offpeak_release_strategy === "worker_only";
  const queueFirst = setting.queue_only_ingest || setting.offpeak_release_strategy === "worker_preferred";
  const shouldDefer = shouldUseDeferredAttendanceSync(profile, isBusyHours) || holdDuringPeak || workerOnly || queueFirst;
  const deferredBaseMs = shouldDefer
    ? getDeferredAttendanceSyncDelayMs(profile, isBusyHours)
    : 0;

  let detailMessage = "Status ini belum final sampai server mengonfirmasi.";
  if (holdDuringPeak) {
    detailMessage = "Jam sibuk aktif. Data disimpan di perangkat dan akan dilepas setelah window sibuk berakhir.";
  } else if (workerOnly) {
    detailMessage = "Sinkronisasi diproses worker server. Aplikasi hanya menyimpan antrean lokal sampai server mengonfirmasi.";
  } else if (setting.queue_only_ingest) {
    detailMessage = "Permintaan foreground tidak dikirim langsung. Data masuk antrean sinkronisasi lebih dulu.";
  } else if (setting.offpeak_release_strategy === "worker_preferred") {
    detailMessage = "Worker server diprioritaskan. Aplikasi akan membantu sinkronisasi bertahap di luar jam sibuk.";
  } else if (isBusyHours) {
    detailMessage = "Jam sibuk terdeteksi. Sinkronisasi ditunda sebentar agar antrean server tetap stabil.";
  }

  return {
    shouldDefer,
    deferredBaseMs,
    shouldTriggerClientSync: !holdDuringPeak && !workerOnly,
    detailMessage,
  };
}

export function buildDeferredAttendanceMessages(
  actionType: AttendanceActionType,
  deferredMs: number,
): DeferredAttendanceMessages {
  const subject = actionType === "check_in" ? "Absensi masuk" : "Absensi pulang";
  const successSubject = actionType === "check_in" ? "Absen masuk" : "Absen pulang";

  return {
    scheduledMessage: `${subject} tersimpan di perangkat. Sinkronisasi dijadwalkan ~${Math.ceil(deferredMs / 1000)} detik.`,
    delayedMessage: `${subject} tersimpan di perangkat, sinkronisasi ditunda`,
    successMessage: `${successSubject} tersimpan di perangkat dan akan disinkronkan otomatis.`,
    initialBufferedMessage: `${subject} tersimpan di perangkat`,
  };
}

export function buildInitialBufferedPendingState(
  actionType: AttendanceActionType,
): AttendancePendingStateSnapshot {
  const messages = buildDeferredAttendanceMessages(actionType, 0);

  return {
    status: "buffered",
    type: actionType,
    message: messages.initialBufferedMessage,
    detail: "Belum tercatat final di server. Tidak perlu menekan tombol lagi.",
    syncStatus: "pending",
  };
}

export function buildDeferredBufferedPendingState(
  actionType: AttendanceActionType,
  deferredMs: number,
  detailMessage: string,
): AttendancePendingStateSnapshot {
  const messages = buildDeferredAttendanceMessages(actionType, deferredMs);

  return {
    status: "buffered",
    type: actionType,
    message: messages.scheduledMessage,
    detail: detailMessage,
    syncStatus: "pending",
  };
}

export function buildDelayedBufferedPendingState(
  actionType: AttendanceActionType,
): AttendancePendingStateSnapshot {
  const messages = buildDeferredAttendanceMessages(actionType, 0);

  return {
    status: "buffered",
    type: actionType,
    message: messages.delayedMessage,
    detail: "Belum tercatat final di server.",
    syncStatus: "pending",
  };
}

export function buildHeldBufferedPendingState(
  actionType: AttendanceActionType,
  detailMessage: string,
): AttendancePendingStateSnapshot {
  const subject = actionType === "check_in" ? "Absensi masuk" : "Absensi pulang";

  return {
    status: "buffered",
    type: actionType,
    message: `${subject} tersimpan di perangkat, menunggu window sinkronisasi`,
    detail: detailMessage,
    syncStatus: "pending",
  };
}

export function buildJitterPendingState(
  actionType: AttendanceActionType,
  jitterMs: number,
  isBusyHours: boolean,
): AttendancePendingStateSnapshot {
  const actionLabel = actionType === "check_in" ? "absensi masuk" : "absensi pulang";
  const peakInfo = isBusyHours ? " (jam sibuk)" : "";

  return {
    status: "jitter",
    type: actionType,
    message: `Menghubungkan ke server${peakInfo}...`,
    detail: `${capitalize(actionLabel)} tetap tersimpan di perangkat sampai server memberi konfirmasi.`,
    jitterMs,
    syncStatus: "pending",
  };
}

export function buildProcessingPendingState(
  actionType: AttendanceActionType,
): AttendancePendingStateSnapshot {
  const actionLabel = actionType === "check_in" ? "absensi masuk" : "absensi pulang";

  return {
    status: "processing",
    type: actionType,
    message: `Sedang mengirim ${actionLabel} ke server...`,
    detail: "Status akan final setelah server mengonfirmasi.",
    syncStatus: "syncing",
  };
}

export function buildSuccessPendingState(
  actionType: AttendanceActionType,
  detailMessage: string,
): AttendancePendingStateSnapshot {
  const message = actionType === "check_in"
    ? "Absensi masuk sudah tercatat di server."
    : "Absensi pulang sudah tercatat di server.";

  return {
    status: "success",
    type: actionType,
    message,
    detail: detailMessage,
    syncStatus: "synced",
  };
}

export function buildErrorPendingState(
  actionType: AttendanceActionType,
  message: string,
  detailMessage: string,
): AttendancePendingStateSnapshot {
  return {
    status: "error",
    type: actionType,
    message,
    detail: detailMessage,
    syncStatus: "failed",
  };
}

export function buildSyncFailureMessage(
  actionType: AttendanceActionType,
  isTimeout: boolean,
): AttendanceSyncFailureMessage {
  const subject = actionType === "check_in" ? "absensi" : "absensi pulang";

  return {
    userMessage: isTimeout
      ? `Timeout, ${subject} tersimpan di perangkat dan akan disinkronkan otomatis.`
      : "Gagal sinkronisasi, data aman di perangkat. Akan dicoba ulang otomatis.",
    detailMessage: "Absensi masih tersimpan di perangkat dan akan dicoba sinkron ulang.",
  };
}

export function buildDeferredAttendanceResult(
  actionType: AttendanceActionType,
  distance?: number,
): AttendanceActionResult {
  const successMessage = buildDeferredAttendanceMessages(actionType, 0).successMessage;
  return {
    success: true,
    message: successMessage,
    distance,
  };
}

export function buildDelayedAttendanceResult(
  actionType: AttendanceActionType,
  distance?: number,
): AttendanceActionResult {
  const message = actionType === "check_in"
    ? "Absen masuk tersimpan (sinkronisasi tertunda)"
    : "Absen pulang tersimpan (sinkronisasi tertunda)";

  return {
    success: true,
    message,
    distance,
  };
}

export function buildRpcFailureAttendanceResult(
  message: string,
): AttendanceActionResult {
  return {
    success: false,
    message,
  };
}

export function buildRpcSuccessAttendanceResult(
  message: string,
  distance?: number,
): AttendanceActionResult {
  return {
    success: true,
    message,
    distance,
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
