import { describe, expect, it } from "vitest";
import {
  APPROVED_EARLY_LEAVE_PERMISSION_NOTE_MARKER,
  APPROVED_LATE_PERMISSION_NOTE_MARKER,
  AUTO_CANCEL_ON_TIME_REJECTION_MARKER,
  AUTO_CANCEL_ON_TIME_REJECTION_MESSAGE,
  buildAutoCancelLatePermissionRejectionReason,
  buildEarlyLeavePermissionReason,
  buildLatePermissionReason,
  isAutoCanceledLatePermissionRejectionReason,
  isEarlyLeavePermissionReason,
  isLatePermissionReason,
  makeEarlyLeavePermissionQueueKey,
  makeLatePermissionQueueKey,
  parseEarlyLeavePermissionReason,
  parseLatePermissionReason,
  parseSpecialPermissionNotes,
} from "@/lib/latePermissionRequest";

describe("latePermissionRequest", () => {
  it("builds and parses late permission reason payload", () => {
    const raw = buildLatePermissionReason("09:35", "Macet di jalur utama");
    const parsed = parseLatePermissionReason(raw);

    expect(parsed.isLatePermission).toBe(true);
    expect(parsed.estimatedArrivalTime).toBe("09:35");
    expect(parsed.reason).toBe("Macet di jalur utama");
  });

  it("detects non-late reason payload", () => {
    expect(isLatePermissionReason("Izin biasa")).toBe(false);
    expect(parseLatePermissionReason("Izin biasa").isLatePermission).toBe(false);
  });

  it("builds and parses early leave permission reason payload", () => {
    const raw = buildEarlyLeavePermissionReason("15:30", "Perlu kontrol kesehatan keluarga");
    const parsed = parseEarlyLeavePermissionReason(raw);

    expect(parsed.isEarlyLeavePermission).toBe(true);
    expect(parsed.plannedLeaveTime).toBe("15:30");
    expect(parsed.reason).toBe("Perlu kontrol kesehatan keluarga");
  });

  it("detects non-early reason payload", () => {
    expect(isEarlyLeavePermissionReason("Izin biasa")).toBe(false);
    expect(parseEarlyLeavePermissionReason("Izin biasa").isEarlyLeavePermission).toBe(false);
  });

  it("creates deterministic queue key", () => {
    expect(makeLatePermissionQueueKey("emp-123")).toBe("absensiku_late_permission_queue_v1_emp-123");
    expect(makeEarlyLeavePermissionQueueKey("emp-123")).toBe("absensiku_early_leave_permission_queue_v1_emp-123");
  });

  it("parses approval markers from attendance notes", () => {
    const parsed = parseSpecialPermissionNotes(
      `${APPROVED_LATE_PERMISSION_NOTE_MARKER}\n${APPROVED_EARLY_LEAVE_PERMISSION_NOTE_MARKER}\nCatatan tambahan`,
    );
    expect(parsed.hasApprovedLatePermission).toBe(true);
    expect(parsed.hasApprovedEarlyLeavePermission).toBe(true);
    expect(parsed.cleanedNote).toBe("Catatan tambahan");
  });

  it("builds and detects auto-cancel late permission rejection reason", () => {
    const value = buildAutoCancelLatePermissionRejectionReason();
    expect(value).toBe(`${AUTO_CANCEL_ON_TIME_REJECTION_MARKER} ${AUTO_CANCEL_ON_TIME_REJECTION_MESSAGE}`);
    expect(isAutoCanceledLatePermissionRejectionReason(value)).toBe(true);
    expect(isAutoCanceledLatePermissionRejectionReason("Ditolak admin")).toBe(false);
  });
});
