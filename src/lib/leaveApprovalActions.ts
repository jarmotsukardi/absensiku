import { differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTenantApprovalWorkflow,
  getApprovalRoleLabel,
  getRequiredApprovalLevels,
  getWorkflowLevel,
  type HrApprovalHistoryEntry,
} from "@/lib/hrApprovalWorkflow";
import type { Database } from "@/integrations/supabase/types";
import { logAuditIfEnabled } from "@/lib/auditLoggingPolicy";

type LeaveApprovalTarget = {
  id: string;
  employee_id: string;
  status?: string | null;
  start_date: string;
  end_date: string;
  is_half_day?: boolean | null;
  leave_type_id?: string | null;
  approval_type_code?: string | null;
  current_approval_level?: number | null;
  required_approval_levels?: number | null;
  approval_history?: HrApprovalHistoryEntry[] | null;
  leave_type_meta?: {
    approval_type_code?: string | null;
    max_days_per_year?: number | null;
  } | null;
};

type AppRole = Database["public"]["Enums"]["app_role"];

type ApproverContext = {
  employeeId: string | null;
  positionName: string | null;
  roles: Array<{
    role: AppRole;
    tenant_id: string | null;
  }>;
};

type RequestEmployeeContext = {
  tenantId: string | null;
  supervisorId: string | null;
};

async function resolveTenantIdForRequest(request: LeaveApprovalTarget, tenantId?: string | null) {
  if (tenantId) return tenantId;
  const { data, error } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("id", request.employee_id)
    .single();
  if (error) throw error;
  return data?.tenant_id || null;
}

async function resolveApproverContext(
  approverUserId: string,
  approverEmployeeId?: string | null,
): Promise<ApproverContext> {
  const [{ data: roleRows, error: roleError }, employeeResult] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", approverUserId),
    approverEmployeeId
      ? supabase
          .from("employees")
          .select("id, position:position_id(name)")
          .eq("id", approverEmployeeId)
          .maybeSingle()
      : supabase
          .from("employees")
          .select("id, position:position_id(name)")
          .eq("user_id", approverUserId)
          .maybeSingle(),
  ]);

  if (roleError) throw roleError;
  if (employeeResult.error) throw employeeResult.error;

  return {
    employeeId: employeeResult.data?.id || approverEmployeeId || null,
    positionName:
      typeof employeeResult.data?.position === "object" &&
      employeeResult.data?.position &&
      "name" in employeeResult.data.position
        ? String((employeeResult.data.position as Record<string, unknown>).name || "")
        : null,
    roles: (roleRows || []) as ApproverContext["roles"],
  };
}

async function resolveRequestEmployeeContext(request: LeaveApprovalTarget): Promise<RequestEmployeeContext> {
  const { data, error } = await supabase
    .from("employees")
    .select("tenant_id, supervisor_id")
    .eq("id", request.employee_id)
    .single();

  if (error) throw error;

  return {
    tenantId: data?.tenant_id || null,
    supervisorId: data?.supervisor_id || null,
  };
}

function hasTenantAdminOverride(
  roles: ApproverContext["roles"],
  tenantId: string | null,
) {
  return roles.some((item) => {
    if (item.role === "super_admin") return true;
    if (item.role !== "admin_instansi") return false;
    return !tenantId || item.tenant_id === tenantId;
  });
}

function hasTenantOperatorAccess(
  roles: ApproverContext["roles"],
  tenantId: string | null,
) {
  return roles.some((item) => {
    if (item.role !== "atasan") return false;
    return !tenantId || item.tenant_id === tenantId;
  });
}

function getWorkflowRoleDenialMessage(approverRole: string | null | undefined) {
  return `Tahap persetujuan ini hanya dapat diproses oleh ${getApprovalRoleLabel(approverRole)}.`;
}

function getFallbackApprovalDenialMessage() {
  return "Tenant ini belum memakai workflow HR. Persetujuan dasar hanya dapat diproses oleh atasan langsung, operator organisasi, atau admin instansi.";
}

function normalizePositionName(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function isHrAdminByPosition(positionName: string | null | undefined) {
  const normalized = normalizePositionName(positionName);
  return normalized.includes("sdm") || normalized.includes("hr") || normalized.includes("kepegawaian");
}

function isHeadOfDivisionPosition(positionName: string | null | undefined) {
  const normalized = normalizePositionName(positionName);
  return normalized.includes("kepala bidang") || normalized.includes("kabid");
}

function isHeadOfAgencyPosition(positionName: string | null | undefined) {
  const normalized = normalizePositionName(positionName);
  return normalized.includes("kepala dinas") || normalized.includes("kadis");
}

function ensureApproverCanHandleLevel({
  approver,
  approverRole,
  requestEmployee,
}: {
  approver: ApproverContext;
  approverRole: string | null | undefined;
  requestEmployee: RequestEmployeeContext;
}) {
  const tenantAdminOverride = hasTenantAdminOverride(approver.roles, requestEmployee.tenantId);
  if (!approverRole) {
    return;
  }

  switch (approverRole) {
    case "atasan_langsung":
      if (tenantAdminOverride || approver.employeeId === requestEmployee.supervisorId) {
        return;
      }
      break;
    case "hr_admin":
      if (tenantAdminOverride || isHrAdminByPosition(approver.positionName)) {
        return;
      }
      break;
    case "kepala_bidang":
      if (tenantAdminOverride || isHeadOfDivisionPosition(approver.positionName)) {
        return;
      }
      break;
    case "kepala_dinas":
      if (tenantAdminOverride || isHeadOfAgencyPosition(approver.positionName)) {
        return;
      }
      break;
    case "admin_instansi":
      if (tenantAdminOverride) {
        return;
      }
      break;
    default:
      if (tenantAdminOverride) {
        return;
      }
      break;
  }

  throw new Error(getWorkflowRoleDenialMessage(approverRole));
}

function ensureApproverCanHandleFallbackApproval({
  approver,
  requestEmployee,
}: {
  approver: ApproverContext;
  requestEmployee: RequestEmployeeContext;
}) {
  const tenantAdminOverride = hasTenantAdminOverride(approver.roles, requestEmployee.tenantId);
  const tenantOperatorAccess = hasTenantOperatorAccess(approver.roles, requestEmployee.tenantId);
  const isDirectSupervisor =
    Boolean(requestEmployee.supervisorId) && approver.employeeId === requestEmployee.supervisorId;

  if (tenantAdminOverride || tenantOperatorAccess || isDirectSupervisor) {
    return;
  }

  throw new Error(getFallbackApprovalDenialMessage());
}

async function resolveLeaveTypeMeta(request: LeaveApprovalTarget) {
  if (request.leave_type_meta?.approval_type_code || request.leave_type_meta?.max_days_per_year !== undefined) {
    return request.leave_type_meta;
  }
  if (!request.leave_type_id) return null;

  const { data, error } = await supabase
    .from("leave_types")
    .select("approval_type_code, max_days_per_year")
    .eq("id", request.leave_type_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function applyLeaveQuotaOnFinalApproval(request: LeaveApprovalTarget, tenantId: string | null) {
  if (!request.leave_type_id || !tenantId) return;

  const leaveTypeMeta = await resolveLeaveTypeMeta(request);
  const startDate = new Date(request.start_date);
  const endDate = new Date(request.end_date);
  const rawRequestedDays = differenceInDays(endDate, startDate) + 1;
  const requestedDays = request.is_half_day ? 0.5 : Math.max(1, rawRequestedDays);
  const quotaYear = startDate.getFullYear();

  const { data: existingQuota, error: quotaLookupError } = await supabase
    .from("leave_quotas")
    .select("id, total_days, used_days, remaining_days, carry_over_days, expired_days")
    .eq("employee_id", request.employee_id)
    .eq("leave_type_id", request.leave_type_id)
    .eq("quota_year", quotaYear)
    .maybeSingle();

  if (quotaLookupError) throw quotaLookupError;

  if (existingQuota?.id) {
    const totalDays = Number(existingQuota.total_days || 0);
    const usedDays = Number(existingQuota.used_days || 0);
    const carryOverDays = Number(existingQuota.carry_over_days || 0);
    const expiredDays = Number(existingQuota.expired_days || 0);
    const nextUsedDays = usedDays + requestedDays;
    const nextRemainingDays = Math.max(totalDays + carryOverDays - expiredDays - nextUsedDays, 0);

    const { error: quotaUpdateError } = await supabase
      .from("leave_quotas")
      .update({
        used_days: nextUsedDays,
        remaining_days: nextRemainingDays,
      } as never)
      .eq("id", existingQuota.id);

    if (quotaUpdateError) throw quotaUpdateError;
    return;
  }

  const totalDays = Number(leaveTypeMeta?.max_days_per_year || 0);
  const { error: quotaInsertError } = await supabase.from("leave_quotas").insert({
    tenant_id: tenantId,
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    quota_year: quotaYear,
    total_days: totalDays,
    used_days: requestedDays,
    remaining_days: Math.max(totalDays - requestedDays, 0),
    carry_over_days: 0,
    expired_days: 0,
  } as never);

  if (quotaInsertError) throw quotaInsertError;
}

export async function processLeaveApprovalStep({
  request,
  approverUserId,
  approverEmployeeId,
  tenantId,
}: {
  request: LeaveApprovalTarget;
  approverUserId: string;
  approverEmployeeId?: string | null;
  tenantId?: string | null;
}) {
  const resolvedTenantId = await resolveTenantIdForRequest(request, tenantId);
  const [requestEmployeeContext, approverContext] = await Promise.all([
    resolveRequestEmployeeContext(request),
    resolveApproverContext(approverUserId, approverEmployeeId),
  ]);
  const leaveTypeMeta = await resolveLeaveTypeMeta(request);
  const approvalTypeCode = request.approval_type_code || leaveTypeMeta?.approval_type_code || "LEAVE";
  const workflow = resolvedTenantId ? await fetchTenantApprovalWorkflow(resolvedTenantId, approvalTypeCode) : null;
  const requiredApprovalLevels = Math.max(
    Number(request.required_approval_levels || 0),
    getRequiredApprovalLevels(workflow),
  );
  const currentApprovalLevel = Math.max(1, Number(request.current_approval_level || 1));
  const currentWorkflowLevel = getWorkflowLevel(workflow, currentApprovalLevel);
  const fallbackOrgApproval = !currentWorkflowLevel;
  if (fallbackOrgApproval) {
    ensureApproverCanHandleFallbackApproval({
      approver: approverContext,
      requestEmployee: requestEmployeeContext,
    });
  } else {
    ensureApproverCanHandleLevel({
      approver: approverContext,
      approverRole: currentWorkflowLevel?.approver_role,
      requestEmployee: requestEmployeeContext,
    });
  }
  const approvedAt = new Date().toISOString();
  const approvalHistory = Array.isArray(request.approval_history) ? [...request.approval_history] : [];
  const isFinalApproval = currentApprovalLevel >= requiredApprovalLevels;

  const nextHistoryEntry: HrApprovalHistoryEntry = {
    action: "approved",
    at: approvedAt,
    actor_user_id: approverUserId,
    actor_employee_id: approverEmployeeId || null,
    approval_type_code: approvalTypeCode,
    level_order: currentApprovalLevel,
    approver_role: currentWorkflowLevel?.approver_role || (fallbackOrgApproval ? "approval_organisasi" : null),
    status_after: isFinalApproval ? "disetujui" : "menunggu",
    notes: currentWorkflowLevel?.notes || null,
  };

  const { data: updatedRows, error } = await supabase
    .from("leave_requests")
    .update({
      status: isFinalApproval ? "disetujui" : "menunggu",
      approved_by: isFinalApproval ? approverEmployeeId || null : null,
      approved_at: isFinalApproval ? approvedAt : null,
      rejection_reason: null,
      approval_type_code: approvalTypeCode,
      current_approval_level: isFinalApproval ? requiredApprovalLevels : currentApprovalLevel + 1,
      required_approval_levels: requiredApprovalLevels,
      approval_history: [...approvalHistory, nextHistoryEntry],
    } as never)
    .eq("id", request.id)
    .eq("employee_id", request.employee_id)
    .eq("status", "menunggu")
    .select("id");

  if (error) throw error;
  if (!updatedRows || updatedRows.length === 0) {
    return {
      updated: false,
      isFinalApproval,
      currentApprovalLevel,
      requiredApprovalLevels,
    };
  }

  if (isFinalApproval) {
    await applyLeaveQuotaOnFinalApproval({ ...request, leave_type_meta: leaveTypeMeta }, resolvedTenantId);
  }

  if (resolvedTenantId) {
    await logAuditIfEnabled({
      tenantId: resolvedTenantId,
      payload: {
        tenant_id: resolvedTenantId,
        employee_id: request.employee_id,
        user_id: approverUserId,
        table_name: "leave_requests",
        action: isFinalApproval ? "leave_request_approved_final" : "leave_request_approved_step",
        record_id: request.id,
        old_values: {
          status: request.status || "menunggu",
          current_approval_level: request.current_approval_level || 1,
          required_approval_levels: request.required_approval_levels || requiredApprovalLevels,
        },
        new_values: {
          status: isFinalApproval ? "disetujui" : "menunggu",
          current_approval_level: isFinalApproval ? requiredApprovalLevels : currentApprovalLevel + 1,
          required_approval_levels: requiredApprovalLevels,
          approval_type_code: approvalTypeCode,
          actor_employee_id: approverEmployeeId || null,
        },
      },
    });
  }

  return {
    updated: true,
    isFinalApproval,
    currentApprovalLevel,
    requiredApprovalLevels,
  };
}

export async function processLeaveRejection({
  request,
  approverUserId,
  approverEmployeeId,
  rejectionReason,
}: {
  request: LeaveApprovalTarget;
  approverUserId?: string | null;
  approverEmployeeId?: string | null;
  rejectionReason: string;
}) {
  const resolvedTenantId = await resolveTenantIdForRequest(request);
  const leaveTypeMeta = await resolveLeaveTypeMeta(request);
  const approvalTypeCode = request.approval_type_code || leaveTypeMeta?.approval_type_code || "LEAVE";
  const currentApprovalLevel = Math.max(1, Number(request.current_approval_level || 1));
  const approvalHistory = Array.isArray(request.approval_history) ? [...request.approval_history] : [];
  const [requestEmployeeContext, approverContext] =
    approverUserId
      ? await Promise.all([
          resolveRequestEmployeeContext(request),
          resolveApproverContext(approverUserId, approverEmployeeId),
        ])
      : [await resolveRequestEmployeeContext(request), { employeeId: approverEmployeeId || null, roles: [] }];
  const currentWorkflow = requestEmployeeContext.tenantId
    ? await fetchTenantApprovalWorkflow(requestEmployeeContext.tenantId, approvalTypeCode)
    : null;
  const currentWorkflowLevel = getWorkflowLevel(currentWorkflow, currentApprovalLevel);
  const fallbackOrgApproval = !currentWorkflowLevel;
  if (fallbackOrgApproval) {
    ensureApproverCanHandleFallbackApproval({
      approver: approverContext,
      requestEmployee: requestEmployeeContext,
    });
  } else {
    ensureApproverCanHandleLevel({
      approver: approverContext,
      approverRole: currentWorkflowLevel?.approver_role,
      requestEmployee: requestEmployeeContext,
    });
  }

  const { data: updatedRows, error } = await supabase
    .from("leave_requests")
    .update({
      status: "ditolak",
      rejection_reason: rejectionReason,
      approved_by: approverEmployeeId || null,
      approved_at: new Date().toISOString(),
      approval_history: [
        ...approvalHistory,
        {
          action: "rejected",
          at: new Date().toISOString(),
          actor_user_id: approverUserId || null,
          actor_employee_id: approverEmployeeId || null,
          approval_type_code: approvalTypeCode,
          level_order: currentApprovalLevel,
          approver_role: currentWorkflowLevel?.approver_role || (fallbackOrgApproval ? "approval_organisasi" : null),
          status_after: "ditolak",
          notes: rejectionReason,
        } satisfies HrApprovalHistoryEntry,
      ],
    } as never)
    .eq("id", request.id)
    .eq("employee_id", request.employee_id)
    .eq("status", "menunggu")
    .select("id");

  if (error) throw error;
  if (resolvedTenantId && updatedRows && updatedRows.length > 0) {
    await logAuditIfEnabled({
      tenantId: resolvedTenantId,
      payload: {
        tenant_id: resolvedTenantId,
        employee_id: request.employee_id,
        user_id: approverUserId || null,
        table_name: "leave_requests",
        action: "leave_request_rejected",
        record_id: request.id,
        old_values: {
          status: request.status || "menunggu",
          current_approval_level: request.current_approval_level || 1,
        },
        new_values: {
          status: "ditolak",
          current_approval_level: currentApprovalLevel,
          approval_type_code: approvalTypeCode,
          actor_employee_id: approverEmployeeId || null,
          rejection_reason: rejectionReason,
        },
      },
    });
  }
  return { updated: Boolean(updatedRows && updatedRows.length > 0) };
}
