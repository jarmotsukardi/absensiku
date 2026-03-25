import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errorLogger", () => ({
  reportError: vi.fn(),
}));

import { getProfile } from "@/lib/scalabilityConfig";
import {
  buildDeferredAttendanceResult,
  buildDelayedBufferedPendingState,
  buildDelayedAttendanceResult,
  buildDeferredAttendanceMessages,
  buildDeferredBufferedPendingState,
  buildErrorPendingState,
  buildHeldBufferedPendingState,
  buildInitialBufferedPendingState,
  buildJitterPendingState,
  buildProcessingPendingState,
  buildRpcFailureAttendanceResult,
  buildRpcSuccessAttendanceResult,
  resolveAttendanceSyncDecision,
  buildSyncFailureMessage,
  buildSuccessPendingState,
} from "@/lib/attendanceSyncPolicy";

describe("attendanceSyncPolicy", () => {
  it("menggunakan immediate path untuk tier small di luar jam sibuk", () => {
    const decision = resolveAttendanceSyncDecision(getProfile("small"), false);

    expect(decision).toEqual({
      shouldDefer: false,
      deferredBaseMs: 0,
      shouldTriggerClientSync: true,
      detailMessage: "Status ini belum final sampai server mengonfirmasi.",
    });
  });

  it("memaksa deferred path untuk tier small saat jam sibuk", () => {
    const decision = resolveAttendanceSyncDecision(getProfile("small"), true);

    expect(decision.shouldDefer).toBe(true);
    expect(decision.deferredBaseMs).toBe(5000);
    expect(decision.shouldTriggerClientSync).toBe(true);
    expect(decision.detailMessage).toContain("Jam sibuk terdeteksi");
  });

  it("menjaga tier medium tetap deferred di luar jam sibuk", () => {
    const profile = getProfile("medium");
    const decision = resolveAttendanceSyncDecision(profile, false);

    expect(decision.shouldDefer).toBe(true);
    expect(decision.deferredBaseMs).toBe(profile.deferredSyncDelayMs);
    expect(decision.shouldTriggerClientSync).toBe(true);
    expect(decision.detailMessage).toBe("Status ini belum final sampai server mengonfirmasi.");
  });

  it("tetap memberi pesan jam sibuk untuk tier deferred saat peak hour", () => {
    const profile = getProfile("large");
    const decision = resolveAttendanceSyncDecision(profile, true, {
      effective_tier: "large",
      peak_hour_hold_sync: true,
    });

    expect(decision.shouldDefer).toBe(true);
    expect(decision.deferredBaseMs).toBe(profile.deferredSyncDelayMs);
    expect(decision.shouldTriggerClientSync).toBe(false);
    expect(decision.detailMessage).toContain("window sibuk berakhir");
  });

  it("menghormati worker-only release strategy tanpa trigger client sync", () => {
    const decision = resolveAttendanceSyncDecision(getProfile("small"), false, {
      effective_tier: "small",
      offpeak_release_strategy: "worker_only",
    });

    expect(decision.shouldDefer).toBe(true);
    expect(decision.shouldTriggerClientSync).toBe(false);
    expect(decision.detailMessage).toContain("worker server");
  });

  it("membangun copy deferred yang benar untuk check-in", () => {
    const copy = buildDeferredAttendanceMessages("check_in", 12000);

    expect(copy).toEqual({
      scheduledMessage: "Absensi masuk tersimpan di perangkat. Sinkronisasi dijadwalkan ~12 detik.",
      delayedMessage: "Absensi masuk tersimpan di perangkat, sinkronisasi ditunda",
      successMessage: "Absen masuk tersimpan di perangkat dan akan disinkronkan otomatis.",
      initialBufferedMessage: "Absensi masuk tersimpan di perangkat",
    });
  });

  it("membangun copy deferred yang benar untuk check-out", () => {
    const copy = buildDeferredAttendanceMessages("check_out", 8000);

    expect(copy).toEqual({
      scheduledMessage: "Absensi pulang tersimpan di perangkat. Sinkronisasi dijadwalkan ~8 detik.",
      delayedMessage: "Absensi pulang tersimpan di perangkat, sinkronisasi ditunda",
      successMessage: "Absen pulang tersimpan di perangkat dan akan disinkronkan otomatis.",
      initialBufferedMessage: "Absensi pulang tersimpan di perangkat",
    });
  });

  it("membangun pending state buffered awal yang benar", () => {
    expect(buildInitialBufferedPendingState("check_in")).toEqual({
      status: "buffered",
      type: "check_in",
      message: "Absensi masuk tersimpan di perangkat",
      detail: "Belum tercatat final di server. Tidak perlu menekan tombol lagi.",
      syncStatus: "pending",
    });
  });

  it("membangun pending state deferred dan delayed yang benar", () => {
    expect(buildDeferredBufferedPendingState("check_out", 9000, "Jam sibuk terdeteksi.")).toEqual({
      status: "buffered",
      type: "check_out",
      message: "Absensi pulang tersimpan di perangkat. Sinkronisasi dijadwalkan ~9 detik.",
      detail: "Jam sibuk terdeteksi.",
      syncStatus: "pending",
    });

    expect(buildDelayedBufferedPendingState("check_out")).toEqual({
      status: "buffered",
      type: "check_out",
      message: "Absensi pulang tersimpan di perangkat, sinkronisasi ditunda",
      detail: "Belum tercatat final di server.",
      syncStatus: "pending",
    });

    expect(buildHeldBufferedPendingState("check_in", "Menunggu window.")).toEqual({
      status: "buffered",
      type: "check_in",
      message: "Absensi masuk tersimpan di perangkat, menunggu window sinkronisasi",
      detail: "Menunggu window.",
      syncStatus: "pending",
    });
  });

  it("membangun pending state jitter dan processing yang benar", () => {
    expect(buildJitterPendingState("check_in", 4500, true)).toEqual({
      status: "jitter",
      type: "check_in",
      message: "Menghubungkan ke server (jam sibuk)...",
      detail: "Absensi masuk tetap tersimpan di perangkat sampai server memberi konfirmasi.",
      jitterMs: 4500,
      syncStatus: "pending",
    });

    expect(buildProcessingPendingState("check_out")).toEqual({
      status: "processing",
      type: "check_out",
      message: "Sedang mengirim absensi pulang ke server...",
      detail: "Status akan final setelah server mengonfirmasi.",
      syncStatus: "syncing",
    });
  });

  it("membangun pending state success dan error yang benar", () => {
    expect(buildSuccessPendingState("check_in", "Server OK")).toEqual({
      status: "success",
      type: "check_in",
      message: "Absensi masuk sudah tercatat di server.",
      detail: "Server OK",
      syncStatus: "synced",
    });

    expect(buildErrorPendingState("check_out", "Timeout", "Masih tersimpan lokal")).toEqual({
      status: "error",
      type: "check_out",
      message: "Timeout",
      detail: "Masih tersimpan lokal",
      syncStatus: "failed",
    });
  });

  it("membangun failure message timeout dan non-timeout yang benar", () => {
    expect(buildSyncFailureMessage("check_in", true)).toEqual({
      userMessage: "Timeout, absensi tersimpan di perangkat dan akan disinkronkan otomatis.",
      detailMessage: "Absensi masih tersimpan di perangkat dan akan dicoba sinkron ulang.",
    });

    expect(buildSyncFailureMessage("check_out", true)).toEqual({
      userMessage: "Timeout, absensi pulang tersimpan di perangkat dan akan disinkronkan otomatis.",
      detailMessage: "Absensi masih tersimpan di perangkat dan akan dicoba sinkron ulang.",
    });

    expect(buildSyncFailureMessage("check_in", false)).toEqual({
      userMessage: "Gagal sinkronisasi, data aman di perangkat. Akan dicoba ulang otomatis.",
      detailMessage: "Absensi masih tersimpan di perangkat dan akan dicoba sinkron ulang.",
    });
  });

  it("membangun return result deferred dan delayed yang benar", () => {
    expect(buildDeferredAttendanceResult("check_in", 42)).toEqual({
      success: true,
      message: "Absen masuk tersimpan di perangkat dan akan disinkronkan otomatis.",
      distance: 42,
    });

    expect(buildDelayedAttendanceResult("check_out")).toEqual({
      success: true,
      message: "Absen pulang tersimpan (sinkronisasi tertunda)",
      distance: undefined,
    });
  });

  it("membangun return result RPC success dan failure yang benar", () => {
    expect(buildRpcSuccessAttendanceResult("Server OK", 11)).toEqual({
      success: true,
      message: "Server OK",
      distance: 11,
    });

    expect(buildRpcFailureAttendanceResult("Gagal validasi")).toEqual({
      success: false,
      message: "Gagal validasi",
    });
  });
});
