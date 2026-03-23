import { supabase } from "@/integrations/supabase/client";

export type HrApprovalWorkflowLevel = {
  level_order: number;
  approver_role: string;
  sla_hours: number;
  notes?: string | null;
};

export type HrApprovalWorkflowConfig = {
  id: string;
  tenant_id: string;
  type_name: string;
  type_code: string;
  is_active: boolean;
  levels: HrApprovalWorkflowLevel[];
};

export type HrApprovalHistoryEntry = {
  action: "submitted" | "approved" | "rejected";
  at: string;
  actor_user_id?: string | null;
  actor_employee_id?: string | null;
  approval_type_code?: string | null;
  level_order?: number | null;
  approver_role?: string | null;
  status_after?: string | null;
  notes?: string | null;
};

export const APPROVAL_TYPE_LABELS: Record<string, string> = {
  LEAVE: "Cuti dan Izin",
  WFH: "Kerja dari Rumah",
  OVERTIME: "Lembur",
  MUTATION: "Mutasi",
  OTHER: "Lainnya",
};

export const APPROVAL_ROLE_LABELS: Record<string, string> = {
  atasan_langsung: "Atasan Langsung",
  kepala_bidang: "Kepala Bidang",
  kepala_dinas: "Kepala Dinas",
  hr_admin: "Admin SDM",
  admin_instansi: "Admin Instansi",
  approval_organisasi: "Persetujuan Organisasi",
};

const normalizeWorkflow = (value: Record<string, unknown>): HrApprovalWorkflowConfig => ({
  id: String(value.id || ""),
  tenant_id: String(value.tenant_id || ""),
  type_name: String(value.type_name || ""),
  type_code: String(value.type_code || ""),
  is_active: value.is_active !== false,
  levels: Array.isArray(value.levels)
    ? value.levels
        .map((level) => {
          if (!level || typeof level !== "object") return null;
          const candidate = level as Record<string, unknown>;
          return {
            level_order: Number(candidate.level_order || 0),
            approver_role: String(candidate.approver_role || ""),
            sla_hours: Number(candidate.sla_hours || 0),
            notes: typeof candidate.notes === "string" ? candidate.notes : null,
          } satisfies HrApprovalWorkflowLevel;
        })
        .filter((level): level is HrApprovalWorkflowLevel => Boolean(level))
        .sort((a, b) => a.level_order - b.level_order)
    : [],
});

export async function fetchTenantApprovalWorkflow(tenantId: string, approvalTypeCode: string) {
  const { data, error } = await supabase
    .from("hr_approval_types")
    .select("id, tenant_id, type_name, type_code, is_active, levels")
    .eq("tenant_id", tenantId)
    .eq("type_code", approvalTypeCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizeWorkflow(data as Record<string, unknown>);
}

export function getApprovalTypeLabel(code: string | null | undefined) {
  if (!code) return "Cuti dan Izin";
  return APPROVAL_TYPE_LABELS[code] || code;
}

export function getApprovalRoleLabel(role: string | null | undefined) {
  if (!role) return "Penanggung Jawab";
  return APPROVAL_ROLE_LABELS[role] || role;
}

export function getRequiredApprovalLevels(workflow: HrApprovalWorkflowConfig | null | undefined) {
  return Math.max(1, workflow?.levels.length || 1);
}

export function getWorkflowLevel(
  workflow: HrApprovalWorkflowConfig | null | undefined,
  levelOrder: number,
) {
  return workflow?.levels.find((level) => level.level_order === levelOrder) || null;
}
