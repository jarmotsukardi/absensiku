import { supabase } from "@/integrations/supabase/client";
import {
  fetchTenantHrPayrollAccessState,
  getWorkspaceLockedReason,
  type HrPayrollAccessStage,
  type WorkspaceAccessMode,
} from "@/lib/hrPayrollAccessPolicy";
import {
  getHrWorkspaceRouteDefinition,
  HR_HELP_REDIRECT,
  HR_WORKSPACE_REDIRECT,
  type HrWorkspaceRouteMinimumRole,
  type HrWorkspaceRouteStatus,
} from "@/lib/hrWorkspaceRegistry";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { fetchTenantOrgWorkspaceModules } from "@/lib/orgWorkspaceModules";
import { reportError } from "@/lib/errorLogger";

export type HrRouteRole = "super_admin" | "admin_instansi" | "atasan" | "pegawai" | "unknown";
export type HrRouteStatus = HrWorkspaceRouteStatus;

type HrRoutePolicy = {
  label: string;
  minimumRole: HrWorkspaceRouteMinimumRole;
  status: HrRouteStatus;
  redirectTo: string;
};

export type HrRouteAccessResolution = {
  allowed: boolean;
  reason: string | null;
  redirectTo: string | null;
  requiredRole: HrRoutePolicy["minimumRole"];
  role: HrRouteRole;
  status: HrRouteStatus;
  ref: string;
  routePath: string;
  label: string;
  stage: HrPayrollAccessStage | null;
  workspaceMode: WorkspaceAccessMode | null;
};

const resolveHrRole = (roles: string[]): HrRouteRole => {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin_instansi")) return "admin_instansi";
  if (roles.includes("atasan")) return "atasan";
  if (roles.includes("pegawai")) return "pegawai";
  return "unknown";
};

const buildHrRef = () => `HR-${Date.now().toString(36).toUpperCase()}`;

const getDefaultPolicy = (routePath: string): HrRoutePolicy => ({
  label: routePath,
  minimumRole: "admin_instansi",
  status: "internal",
  redirectTo: HR_WORKSPACE_REDIRECT,
});

export function getHrRoutePolicy(routePath: string): HrRoutePolicy {
  const definition = getHrWorkspaceRouteDefinition(routePath);
  if (!definition) return getDefaultPolicy(routePath);
  return {
    label: definition.label,
    minimumRole: definition.minimumRole,
    status: definition.status,
    redirectTo: definition.redirectTo,
  };
}

export async function resolveHrRouteAccess(routePath: string): Promise<HrRouteAccessResolution> {
  const ref = buildHrRef();
  const policy = getHrRoutePolicy(routePath);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        allowed: false,
        reason: "Sesi organisasi tidak ditemukan.",
        redirectTo: "/org/login",
        requiredRole: policy.minimumRole,
        role: "unknown",
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
        stage: null,
        workspaceMode: null,
      };
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleError) throw roleError;

    const appRoles = (roleRows || []).map((row) => row.role);
    const role = resolveHrRole(appRoles);
    if (role === "super_admin") {
      return {
        allowed: true,
        reason: null,
        redirectTo: policy.status === "tampil" ? null : policy.redirectTo,
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
        stage: null,
        workspaceMode: null,
      };
    }

    const tenantId = await resolveOrgTenantId();
    if (!tenantId) {
      return {
        allowed: false,
        reason: "Tenant organisasi tidak ditemukan untuk workspace HR.",
        redirectTo: role === "pegawai" ? "/employee/dashboard" : "/org",
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
        stage: null,
        workspaceMode: null,
      };
    }

    const workspaceModules = await fetchTenantOrgWorkspaceModules(tenantId);
    if (!workspaceModules.modules.hr) {
      return {
        allowed: false,
        reason: "Workspace HR sedang dinonaktifkan untuk organisasi ini.",
        redirectTo: "/org",
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
        stage: null,
        workspaceMode: null,
      };
    }

    const accessState = await fetchTenantHrPayrollAccessState(tenantId);
    if (accessState.hrMode === "locked" && role === "admin_instansi") {
      return {
        allowed: false,
        reason: getWorkspaceLockedReason("hr", accessState.readiness),
        redirectTo: null,
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
        stage: accessState.stage,
        workspaceMode: accessState.hrMode,
      };
    }

    const allowed =
      policy.minimumRole === "atasan"
        ? role === "admin_instansi" || role === "atasan"
        : role === "admin_instansi";

    if (allowed) {
      return {
        allowed: true,
        reason: null,
        redirectTo: policy.status === "tampil" ? null : policy.redirectTo,
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
        stage: accessState.stage,
        workspaceMode: accessState.hrMode,
      };
    }

    const reason =
      policy.minimumRole === "atasan"
        ? "Menu HR ini hanya tersedia untuk admin organisasi atau operator HR yang menangani bantuan."
        : "Menu HR ini hanya tersedia untuk admin organisasi.";

    const redirectTo =
      role === "atasan"
        ? HR_HELP_REDIRECT
        : role === "pegawai"
          ? "/employee/dashboard"
          : "/org";

    return {
      allowed: false,
      reason,
      redirectTo,
      requiredRole: policy.minimumRole,
      role,
      status: policy.status,
      ref,
      routePath,
      label: policy.label,
      stage: accessState.stage,
      workspaceMode: accessState.hrMode,
    };
  } catch (error) {
    reportError(error, "hr.route_access.resolve", { route_path: routePath, ref });
    return {
      allowed: false,
      reason: "Gagal memverifikasi akses HR.",
      redirectTo: "/org",
      requiredRole: policy.minimumRole,
      role: "unknown",
      status: policy.status,
      ref,
      routePath,
      label: policy.label,
      stage: null,
      workspaceMode: null,
    };
  }
}
