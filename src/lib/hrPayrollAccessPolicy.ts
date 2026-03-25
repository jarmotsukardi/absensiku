import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";
import { fetchOrgOnboardingCounts, type OrgOnboardingCounts } from "@/lib/orgOnboardingTemplates";
import { getTenantEmployeeIds } from "@/lib/orgTenantContext";

export const ORG_HR_PAYROLL_ACCESS_POLICY_KEY = "org_hr_payroll_access_policy_v1";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

export type HrPayrollAccessStage =
  | "setup_required"
  | "attendance_active"
  | "payment_committed"
  | "paid_active";

export type WorkspaceAccessMode = "locked" | "readonly" | "full";

export type WorkspaceAccessScope = "hr" | "payroll";

export interface HrPayrollAccessSetting {
  paymentCommitted: boolean;
  committedAt: string | null;
  note: string | null;
}

export interface HrPayrollReadinessSnapshot {
  onboardingReady: boolean;
  activeAdminReady: boolean;
  employeesReady: boolean;
  attendanceReady: boolean;
  onboardingCounts: OrgOnboardingCounts;
  adminCount: number;
  employeeCount: number;
  attendanceCount: number;
}

export interface TenantHrPayrollAccessState {
  stage: HrPayrollAccessStage;
  subscriptionStatus: string | null;
  accessSetting: HrPayrollAccessSetting;
  readiness: HrPayrollReadinessSnapshot;
  hrMode: WorkspaceAccessMode;
  payrollMode: WorkspaceAccessMode;
}

const DEFAULT_ACCESS_SETTING: HrPayrollAccessSetting = {
  paymentCommitted: false,
  committedAt: null,
  note: null,
};

const parseAccessSetting = (value: unknown): HrPayrollAccessSetting => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_ACCESS_SETTING;
  }

  const source = value as Record<string, unknown>;
  return {
    paymentCommitted: source.paymentCommitted === true,
    committedAt: typeof source.committedAt === "string" ? source.committedAt : null,
    note: typeof source.note === "string" && source.note.trim() ? source.note.trim() : null,
  };
};

const buildAccessSettingValue = (setting: HrPayrollAccessSetting) => ({
  version: 1,
  paymentCommitted: setting.paymentCommitted,
  committedAt: setting.committedAt,
  note: setting.note,
});

export const isAttendanceFoundationReady = (counts: OrgOnboardingCounts): boolean =>
  counts.work_units > 0 &&
  counts.offices > 0 &&
  counts.work_hours > 0 &&
  counts.absence_limits > 0;

export const deriveHrPayrollAccessStage = (args: {
  readinessReady: boolean;
  paymentCommitted: boolean;
  subscriptionStatus: string | null;
}): HrPayrollAccessStage => {
  if (args.subscriptionStatus === "active") return "paid_active";
  if (!args.readinessReady) return "setup_required";
  if (args.paymentCommitted) return "payment_committed";
  return "attendance_active";
};

export const resolveWorkspaceAccessMode = (
  stage: HrPayrollAccessStage,
  scope: WorkspaceAccessScope,
): WorkspaceAccessMode => {
  if (stage === "setup_required") return "locked";
  if (scope === "hr") {
    return stage === "attendance_active" ? "readonly" : "full";
  }
  return stage === "paid_active" ? "full" : "readonly";
};

export const getAccessStageLabel = (stage: HrPayrollAccessStage): string => {
  switch (stage) {
    case "attendance_active":
      return "Preview Read-Only";
    case "payment_committed":
      return "Komitmen Pembayaran";
    case "paid_active":
      return "Aktif Penuh";
    default:
      return "Menunggu Readiness Absensi";
  }
};

export const getWorkspaceModeLabel = (mode: WorkspaceAccessMode): string => {
  switch (mode) {
    case "full":
      return "Bisa Diedit";
    case "readonly":
      return "Lihat Saja";
    default:
      return "Terkunci";
  }
};

export const getWorkspaceLockedReason = (
  scope: WorkspaceAccessScope,
  readiness: HrPayrollReadinessSnapshot,
): string => {
  const scopeLabel = scope === "hr" ? "HR" : "Payroll";
  const missing: string[] = [];

  if (!readiness.onboardingReady) missing.push("fondasi absensi");
  if (!readiness.activeAdminReady) missing.push("admin organisasi aktif");
  if (!readiness.employeesReady) missing.push("pegawai terdaftar");
  if (!readiness.attendanceReady) missing.push("rekam absensi awal");

  const suffix =
    missing.length > 0 ? ` Lengkapi: ${missing.join(", ")}.` : "";
  return `${scopeLabel} baru dibuka setelah absensi siap dipakai secara objektif.${suffix}`;
};

export const getWorkspaceReadonlyReason = (
  scope: WorkspaceAccessScope,
  stage: HrPayrollAccessStage,
): string => {
  if (scope === "hr" && stage === "attendance_active") {
    return "Workspace HR masih preview. Semua menu bisa dilihat, tetapi edit dan tambah data baru dibuka setelah komitmen pembayaran dicatat.";
  }
  if (scope === "payroll" && stage === "payment_committed") {
    return "Workspace Payroll masih read-only. Edit payroll dibuka setelah status langganan aktif penuh.";
  }
  return `Workspace ${scope === "hr" ? "HR" : "Payroll"} masih preview. Semua menu bisa dilihat, tetapi edit dan tambah data belum dibuka.`;
};

export async function fetchTenantHrPayrollAccessSetting(
  tenantId: string,
): Promise<{ settingId: string | null; setting: HrPayrollAccessSetting }> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_HR_PAYROLL_ACCESS_POLICY_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan policy akses HR/Payroll timeout.",
  );

  if (error && error.code !== "PGRST116") throw error;

  return {
    settingId: data?.id ?? null,
    setting: parseAccessSetting(data?.setting_value),
  };
}

export async function saveTenantHrPayrollAccessSetting(
  tenantId: string,
  setting: HrPayrollAccessSetting,
): Promise<HrPayrollAccessSetting> {
  const normalized: HrPayrollAccessSetting = {
    paymentCommitted: Boolean(setting.paymentCommitted),
    committedAt: setting.paymentCommitted ? setting.committedAt ?? new Date().toISOString() : null,
    note: setting.note?.trim() || null,
  };
  const value = buildAccessSettingValue(normalized);

  const { settingId } = await fetchTenantHrPayrollAccessSetting(tenantId);

  if (settingId) {
    const { error } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: value,
            description:
              "Policy akses preview/read-only HR dan Payroll berdasarkan readiness absensi dan komitmen pembayaran.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", settingId),
      WRITE_TIMEOUT_MS,
      "Simpan policy akses HR/Payroll timeout.",
    );
    if (error) throw error;
  } else {
    const { error } = await withTimeout(
      () =>
        supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: ORG_HR_PAYROLL_ACCESS_POLICY_KEY,
          setting_value: value,
          description:
            "Policy akses preview/read-only HR dan Payroll berdasarkan readiness absensi dan komitmen pembayaran.",
        }),
      WRITE_TIMEOUT_MS,
      "Tambah policy akses HR/Payroll timeout.",
    );
    if (error) throw error;
  }

  return normalized;
}

export async function fetchTenantHrPayrollAccessState(
  tenantId: string,
): Promise<TenantHrPayrollAccessState> {
  const employeeIdsPromise = getTenantEmployeeIds(tenantId);

  const attendanceCountPromise = (async () => {
    const employeeIds = await employeeIdsPromise;
    if (employeeIds.length === 0) {
      return { count: 0, error: null, status: 200, statusText: "OK", data: null };
    }

    const partitionedRes = await supabase
      .from("attendance_records_partitioned")
      .select("id", { count: "exact", head: true })
      .in("employee_id", employeeIds);

    if (!partitionedRes.error) {
      return partitionedRes;
    }

    const shouldFallbackToSharedTable =
      partitionedRes.status === 400 || partitionedRes.error.code === "PGRST204";

    if (!shouldFallbackToSharedTable) {
      return partitionedRes;
    }

    return supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .in("employee_id", employeeIds);
  })();

  const [
    onboardingCounts,
    adminCountRes,
    employeeCountRes,
    attendanceCountRes,
    subscriptionRes,
    accessSettingRes,
  ] = await withTimeout(
    () =>
      Promise.all([
        fetchOrgOnboardingCounts(tenantId),
        supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("role", "admin_instansi"),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
        attendanceCountPromise,
        supabase
          .from("subscriptions")
          .select("status")
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        fetchTenantHrPayrollAccessSetting(tenantId),
      ]),
    READ_TIMEOUT_MS,
    "Permintaan status akses HR/Payroll timeout.",
  );

  if (adminCountRes.error) throw adminCountRes.error;
  if (employeeCountRes.error) throw employeeCountRes.error;
  if (attendanceCountRes.error) throw attendanceCountRes.error;
  if (subscriptionRes.error && subscriptionRes.error.code !== "PGRST116") throw subscriptionRes.error;

  const readiness: HrPayrollReadinessSnapshot = {
    onboardingReady: isAttendanceFoundationReady(onboardingCounts),
    activeAdminReady: (adminCountRes.count ?? 0) > 0,
    employeesReady: (employeeCountRes.count ?? 0) > 0,
    attendanceReady: (attendanceCountRes.count ?? 0) > 0,
    onboardingCounts,
    adminCount: adminCountRes.count ?? 0,
    employeeCount: employeeCountRes.count ?? 0,
    attendanceCount: attendanceCountRes.count ?? 0,
  };

  const readinessReady =
    readiness.onboardingReady &&
    readiness.activeAdminReady &&
    readiness.employeesReady &&
    readiness.attendanceReady;
  const stage = deriveHrPayrollAccessStage({
    readinessReady,
    paymentCommitted: accessSettingRes.setting.paymentCommitted,
    subscriptionStatus: subscriptionRes.data?.status ?? null,
  });

  return {
    stage,
    subscriptionStatus: subscriptionRes.data?.status ?? null,
    accessSetting: accessSettingRes.setting,
    readiness,
    hrMode: resolveWorkspaceAccessMode(stage, "hr"),
    payrollMode: resolveWorkspaceAccessMode(stage, "payroll"),
  };
}
