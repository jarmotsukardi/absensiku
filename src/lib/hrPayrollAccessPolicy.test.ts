import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import {
  deriveHrPayrollAccessStage,
  getWorkspaceModeLabel,
  isAttendanceFoundationReady,
  resolveWorkspaceAccessMode,
} from "@/lib/hrPayrollAccessPolicy";

describe("hrPayrollAccessPolicy", () => {
  it("marks attendance foundation ready only when core setup exists", () => {
    expect(
      isAttendanceFoundationReady({
        opd: 1,
        work_units: 1,
        positions: 0,
        offices: 1,
        work_hours: 1,
        absence_limits: 1,
        announcements: 0,
      }),
    ).toBe(true);

    expect(
      isAttendanceFoundationReady({
        opd: 1,
        work_units: 0,
        positions: 1,
        offices: 1,
        work_hours: 1,
        absence_limits: 1,
        announcements: 0,
      }),
    ).toBe(false);
  });

  it("derives access stages in the expected order", () => {
    expect(
      deriveHrPayrollAccessStage({
        readinessReady: false,
        paymentCommitted: true,
        subscriptionStatus: "active",
      }),
    ).toBe("paid_active");

    expect(
      deriveHrPayrollAccessStage({
        readinessReady: true,
        paymentCommitted: false,
        subscriptionStatus: null,
      }),
    ).toBe("attendance_active");

    expect(
      deriveHrPayrollAccessStage({
        readinessReady: true,
        paymentCommitted: true,
        subscriptionStatus: "trial",
      }),
    ).toBe("payment_committed");

    expect(
      deriveHrPayrollAccessStage({
        readinessReady: true,
        paymentCommitted: false,
        subscriptionStatus: "active",
      }),
    ).toBe("paid_active");
  });

  it("maps stage into workspace modes", () => {
    expect(resolveWorkspaceAccessMode("attendance_active", "hr")).toBe("readonly");
    expect(resolveWorkspaceAccessMode("payment_committed", "hr")).toBe("full");
    expect(resolveWorkspaceAccessMode("payment_committed", "payroll")).toBe("readonly");
    expect(resolveWorkspaceAccessMode("paid_active", "payroll")).toBe("full");
  });

  it("provides stable labels for workspace modes", () => {
    expect(getWorkspaceModeLabel("locked")).toBe("Terkunci");
    expect(getWorkspaceModeLabel("readonly")).toBe("Lihat Saja");
    expect(getWorkspaceModeLabel("full")).toBe("Bisa Diedit");
  });
});
