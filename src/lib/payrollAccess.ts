import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { reportError } from "@/lib/errorLogger";
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
};

const FALLBACK_ALLOW_IF_NO_ASSIGNMENT = true;

export async function resolvePayrollRouteAccess(requiredPermission: PayrollPermission): Promise<PayrollAccessResolution> {
  const ref = `PAY-${Date.now().toString(36).toUpperCase()}`;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        allowed: false,
        reason: "Sesi tidak ditemukan.",
        redirectTo: "/org/login",
        requiredPermission,
        payrollRoles: [],
        permissions: [],
        ref,
      };
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
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
      };
    }

    // Recovery gate: admin organisasi harus selalu bisa membuka halaman role payroll
    // untuk memperbaiki assignment jika strict mode mengunci menu lain.
    if (requiredPermission === "payroll.roles.manage") {
      return {
        allowed: true,
        reason: null,
        redirectTo: null,
        requiredPermission,
        payrollRoles: ["payroll_admin"],
        permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
        ref,
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
      };
    }

    const accessMode = await fetchTenantPayrollAccessMode(tenantId);
    const fallbackAllowIfNoAssignment =
      accessMode === "strict" ? false : FALLBACK_ALLOW_IF_NO_ASSIGNMENT;

    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("payroll_role_assignments")
      .select("payroll_role, is_active")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (assignmentError) {
      // Fallback for admin organisasi when assignment storage is unavailable
      // (missing table / RLS issue / transient query error) in fallback mode.
      const assignmentErrorCode = (assignmentError as { code?: string }).code;
      if (assignmentErrorCode === "42P01" || fallbackAllowIfNoAssignment) {
        return {
          allowed: true,
          reason: assignmentErrorCode === "42P01"
            ? null
            : "Fallback akses payroll aktif saat assignment role belum dapat diverifikasi.",
          redirectTo: null,
          requiredPermission,
          payrollRoles: ["payroll_admin"],
          permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
          ref,
        };
      }
      throw assignmentError;
    }

    const payrollRoles = (assignmentRows || []).map((row) => row.payroll_role as PayrollRole);

    if (payrollRoles.length === 0 && fallbackAllowIfNoAssignment) {
      return {
        allowed: true,
        reason: null,
        redirectTo: null,
        requiredPermission,
        payrollRoles: ["payroll_admin"],
        permissions: PAYROLL_ROLE_PERMISSION_MAP.payroll_admin,
        ref,
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
    };
  }
}
