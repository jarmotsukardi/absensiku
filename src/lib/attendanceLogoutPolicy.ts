import { getPendingEntries } from "@/lib/attendanceDB";
import { loadAttendanceScalabilitySetting, type LogoutPendingPolicy } from "@/lib/scalabilityConfig";

export interface AttendanceLogoutGuardResult {
  policy: LogoutPendingPolicy;
  pendingCount: number;
  shouldWarn: boolean;
  shouldBlock: boolean;
}

export async function evaluateAttendanceLogoutGuard(employeeId: string | null): Promise<AttendanceLogoutGuardResult> {
  const setting = loadAttendanceScalabilitySetting();
  const policy = setting.logout_pending_policy;

  if (!employeeId || policy === "keep_local_pending") {
    return {
      policy,
      pendingCount: 0,
      shouldWarn: false,
      shouldBlock: false,
    };
  }

  const pendingEntries = await getPendingEntries(employeeId);
  const pendingCount = pendingEntries.length;

  return {
    policy,
    pendingCount,
    shouldWarn: policy === "warn_then_logout" && pendingCount > 0,
    shouldBlock: policy === "block_logout" && pendingCount > 0,
  };
}
