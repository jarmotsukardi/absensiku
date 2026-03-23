import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";
import {
  fetchTenantHrPayrollAccessState,
  getWorkspaceLockedReason,
  type HrPayrollAccessStage,
  type WorkspaceAccessMode,
} from "@/lib/hrPayrollAccessPolicy";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { reportError } from "@/lib/errorLogger";
import { isPayrollRoleAssignmentStorageMissing } from "@/lib/payrollAssignmentStorage";
import { fetchTenantPayrollAccessMode } from "@/lib/payrollAccessMode";
import { fetchTenantOrgWorkspaceModules } from "@/lib/orgWorkspaceModules";
export {
  PAYROLL_ROLE_LABELS,
  PAYROLL_ROLE_PERMISSION_MAP,
  hasPayrollPermission,
  resolvePayrollPermissionsFromRoles,
} from "@/lib/payrollAccessCore";
import {
  PAYROLL_ROLE_PERMISSION_MAP,
  hasPayrollPermission,
  resolvePayrollPermissionsFromRoles,
  type PayrollPermission,
  type PayrollRole,
} from "@/lib/payrollAccessCore";

export type PayrollAccessResolution = {
  allowed: boolean;
  reason: string | null;
  redirectTo: string | null;
  requiredPermission: PayrollPermission;
  payrollRoles: PayrollRole[];
  permissions: PayrollPermission[];
  ref: string;
  stage: HrPayrollAccessStage | null;
  workspaceMode: WorkspaceAccessMode | null;
  readonly: boolean;
};

const FALLBACK_ALLOW_IF_NO_ASSIGNMENT = true;
const READ_TIMEOUT_MS = 12000;
const PAYROLL_RECOVERY_PERMISSIONS: PayrollPermission[] = [
  "payroll.roles.manage",
  "payroll.integration.manage",
];

const isPayrollRecoveryPermission = (permission: PayrollPermission): boolean =>
  PAYROLL_RECOVERY_PERMISSIONS.includes(permission);

export async function resolvePayrollRouteAccess(requiredPermission: PayrollPermission): Promise<PayrollAccessResolution> {
  const ref = `PAY-${Date.now().toString(36).toUpperCase()}`;

  try {
    const {
      data: { user },
    } = await withTimeout(
      () => supabase.auth.getUser(),
      READ_TIMEOUT_MS,
      "Permintaan sesi payroll timeout.",
    );

    if (!user) {
      return {
        allowed: false,
        reason: "Sesi tidak ditemukan.",
        redirectTo: "/org/login",
        requiredPermission,
        payrollRoles: [],
        permissions: [],
        ref,
        stage: null,
        workspaceMode: null,
        readonly: false,
      };
    }

    const { data: roleRows, error: roleError } = await withTimeout(
      () =>
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id),
      READ_TIMEOUT_MS,
      "Permintaan role payroll timeout.",
    );
    if (roleError) throw roleError;

    const appRoles = (roleRows || []).map((row) => row.role);
    if (appRoles.includes("super_admin")) {
      return {
        allowed: true,
        reason: null,
        redirectTo: null,
        requiredPermission,
        payrollRoles: ["payroll_admin"],
        permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
        ref,
        stage: null,
        workspaceMode: "full",
        readonly: false,
      };
    }

    if (!appRoles.includes("admin_instansi")) {
      const isEmployeeOnly = appRoles.includes("pegawai") && !appRoles.includes("atasan");
      return {
        allowed: false,
        reason: isEmployeeOnly
          ? "Akses payroll tidak tersedia untuk role pegawai."
          : "Akses payroll hanya untuk admin organisasi.",
        redirectTo: isEmployeeOnly ? "/employee/dashboard" : "/org",
        requiredPermission,
        payrollRoles: [],
        permissions: [],
        ref,
        stage: null,
        workspaceMode: null,
        readonly: false,
      };
    }

    const tenantId = await resolveOrgTenantId();
    if (!tenantId) {
      return {
        allowed: false,
        reason: "Tenant organisasi tidak ditemukan.",
        redirectTo: "/org",
        requiredPermission,
        payrollRoles: [],
        permissions: [],
        ref,
        stage: null,
        workspaceMode: null,
        readonly: false,
      };
    }

    const workspaceModules = await fetchTenantOrgWorkspaceModules(tenantId);
    if (!workspaceModules.modules.payroll) {
      return {
        allowed: false,
        reason: "Workspace payroll sedang dinonaktifkan.",
        redirectTo: "/org",
        requiredPermission,
        payrollRoles: [],
        permissions: [],
        ref,
        stage: null,
        workspaceMode: null,
        readonly: false,
      };
    }

    let hrPayrollAccessState: Awaited<ReturnType<typeof fetchTenantHrPayrollAccessState>>;
    try {
      hrPayrollAccessState = await fetchTenantHrPayrollAccessState(tenantId);
    } catch (error) {
      if (isPayrollRecoveryPermission(requiredPermission)) {
        reportError(error, "payroll.route_access.access_state_recovery", {
          required_permission: requiredPermission,
          ref,
          tenant_id: tenantId,
        });
        return {
          allowed: true,
          reason: null,
          redirectTo: null,
          requiredPermission,
          payrollRoles: ["payroll_admin"],
          permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
          ref,
          stage: null,
          workspaceMode: "full",
          readonly: false,
        };
      }
      throw error;
    }
    if (hrPayrollAccessState.payrollMode === "locked") {
      return {
        allowed: false,
        reason: getWorkspaceLockedReason("payroll", hrPayrollAccessState.readiness),
        redirectTo: null,
        requiredPermission,
        payrollRoles: [],
        permissions: [],
        ref,
        stage: hrPayrollAccessState.stage,
        workspaceMode: hrPayrollAccessState.payrollMode,
        readonly: false,
      };
    }

    if (hrPayrollAccessState.payrollMode === "readonly") {
      return {
        allowed: true,
        reason: null,
        redirectTo: null,
        requiredPermission,
        payrollRoles: [],
        permissions: [],
        ref,
        stage: hrPayrollAccessState.stage,
        workspaceMode: hrPayrollAccessState.payrollMode,
        readonly: true,
      };
    }

    // Recovery gate: admin organisasi tetap bisa membuka halaman role payroll
    // saat strict permission mengunci menu lain, tetapi hanya setelah payroll
    // memang berada pada fase editable penuh.
    if (requiredPermission === "payroll.roles.manage") {
      return {
        allowed: true,
        reason: null,
        redirectTo: null,
        requiredPermission,
        payrollRoles: ["payroll_admin"],
        permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
        ref,
        stage: hrPayrollAccessState.stage,
        workspaceMode: "full",
        readonly: false,
      };
    }

    const accessMode = await fetchTenantPayrollAccessMode(tenantId);
    const fallbackAllowIfNoAssignment =
      accessMode === "fallback" ? FALLBACK_ALLOW_IF_NO_ASSIGNMENT : false;

    const { data: assignmentRows, error: assignmentError } = await withTimeout(
      () =>
        supabase
          .from("payroll_role_assignments")
          .select("payroll_role, is_active")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .eq("is_active", true),
      READ_TIMEOUT_MS,
      "Permintaan assignment role payroll timeout.",
    );

    if (assignmentError) {
      // Fallback for admin organisasi hanya dipakai saat tenant memang
      // sengaja berada pada mode fallback dan storage assignment belum siap.
      if (
        fallbackAllowIfNoAssignment &&
        isPayrollRoleAssignmentStorageMissing(assignmentError)
      ) {
        return {
          allowed: true,
          reason: "Fallback akses payroll aktif saat assignment role belum tersedia di schema tenant.",
          redirectTo: null,
          requiredPermission,
          payrollRoles: ["payroll_admin"],
          permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
          ref,
          stage: hrPayrollAccessState.stage,
          workspaceMode: "full",
          readonly: false,
        };
      }
      throw assignmentError;
    }

    const payrollRoles = (assignmentRows || []).map((row) => row.payroll_role as PayrollRole);

    if (payrollRoles.length === 0 && fallbackAllowIfNoAssignment) {
      return {
        allowed: true,
        reason: "Fallback akses payroll aktif untuk admin karena assignment role belum diisi.",
        redirectTo: null,
        requiredPermission,
        payrollRoles: ["payroll_admin"],
        permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
        ref,
        stage: hrPayrollAccessState.stage,
        workspaceMode: "full",
        readonly: false,
      };
    }

    const permissions = resolvePayrollPermissionsFromRoles(payrollRoles);
    const allowed = hasPayrollPermission(permissions, requiredPermission);

    return {
      allowed,
      reason: allowed ? null : `Tidak punya izin ${requiredPermission}`,
      redirectTo: allowed ? null : "/org/payroll",
      requiredPermission,
      payrollRoles,
      permissions,
      ref,
      stage: hrPayrollAccessState.stage,
      workspaceMode: "full",
      readonly: false,
    };
  } catch (error) {
    reportError(error, "payroll.route_access.resolve", { required_permission: requiredPermission, ref });
    return {
      allowed: false,
      reason: "Gagal memverifikasi izin payroll.",
      redirectTo: "/org",
      requiredPermission,
      payrollRoles: [],
      permissions: [],
      ref,
      stage: null,
      workspaceMode: null,
      readonly: false,
    };
  }
}
