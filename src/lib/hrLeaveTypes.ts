import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { fetchTenantOrgWorkspaceModules } from "@/lib/orgWorkspaceModules";

export type HrLeaveRequestType = Enums<"leave_type">;

export type HrManagedLeaveType = {
  id: string;
  tenant_id: string;
  leave_name: string;
  leave_code: string;
  description: string | null;
  is_paid: boolean;
  requires_document: boolean;
  max_days_per_year: number;
  is_active: boolean;
  request_type: HrLeaveRequestType;
  approval_type_code: string;
  document_template_id?: string | null;
  document_template?: {
    template_name: string;
    template_type: string;
  } | null;
};

export type LeaveRequestOption = {
  id?: string;
  leave_name: string;
  leave_code: string;
  description: string | null;
  requires_document: boolean;
  request_type: HrLeaveRequestType;
  approval_type_code: string;
  source: "hr" | "attendance";
  document_template?: {
    template_name: string;
    template_type: string;
  } | null;
};

type HrLeaveTypeSeed = Omit<HrManagedLeaveType, "id" | "tenant_id">;

export const HR_LEAVE_REQUEST_TYPE_LABELS: Record<HrLeaveRequestType, string> = {
  izin: "Izin",
  cuti_tahunan: "Cuti Tahunan",
  cuti_penting: "Cuti Penting",
  cuti_lainnya: "Cuti Lainnya",
  sakit: "Sakit",
  tugas_luar: "Tugas Luar",
};

const DEFAULT_HR_LEAVE_TYPES: HrLeaveTypeSeed[] = [
  {
    leave_name: "Izin",
    leave_code: "IZIN",
    description: "Izin keperluan pribadi yang tidak memotong kuota tahunan.",
    is_paid: true,
    requires_document: false,
    max_days_per_year: 0,
    is_active: true,
    request_type: "izin",
    approval_type_code: "LEAVE",
  },
  {
    leave_name: "Cuti Tahunan",
    leave_code: "ANNUAL",
    description: "Cuti tahunan reguler pegawai.",
    is_paid: true,
    requires_document: false,
    max_days_per_year: 12,
    is_active: true,
    request_type: "cuti_tahunan",
    approval_type_code: "LEAVE",
  },
  {
    leave_name: "Cuti Penting",
    leave_code: "IMPORTANT",
    description: "Cuti untuk kebutuhan penting atau keluarga inti.",
    is_paid: true,
    requires_document: true,
    max_days_per_year: 7,
    is_active: true,
    request_type: "cuti_penting",
    approval_type_code: "LEAVE",
  },
  {
    leave_name: "Cuti Lainnya",
    leave_code: "OTHER",
    description: "Kategori cuti lain yang masih berada di bawah workflow HR.",
    is_paid: false,
    requires_document: false,
    max_days_per_year: 5,
    is_active: true,
    request_type: "cuti_lainnya",
    approval_type_code: "LEAVE",
  },
  {
    leave_name: "Sakit",
    leave_code: "SICK",
    description: "Izin sakit dengan referensi dokumen bernomor bila diperlukan.",
    is_paid: true,
    requires_document: true,
    max_days_per_year: 30,
    is_active: true,
    request_type: "sakit",
    approval_type_code: "LEAVE",
  },
  {
    leave_name: "Tugas Luar",
    leave_code: "OFFICIAL_TRAVEL",
    description: "Perjalanan dinas atau tugas luar organisasi dengan rujukan surat tugas bila diperlukan.",
    is_paid: true,
    requires_document: true,
    max_days_per_year: 365,
    is_active: true,
    request_type: "tugas_luar",
    approval_type_code: "LEAVE",
  },
];

const DEFAULT_ATTENDANCE_LEAVE_OPTIONS: LeaveRequestOption[] = DEFAULT_HR_LEAVE_TYPES.map((item) => ({
  leave_name: item.leave_name,
  leave_code: item.leave_code,
  description: item.description,
  requires_document: false,
  request_type: item.request_type,
  approval_type_code: "LEAVE",
  source: "attendance",
  document_template: null,
}));

const normalizeLeaveType = (value: Record<string, unknown>): HrManagedLeaveType => ({
  id: String(value.id || ""),
  tenant_id: String(value.tenant_id || ""),
  leave_name: String(value.leave_name || ""),
  leave_code: String(value.leave_code || ""),
  description: typeof value.description === "string" ? value.description : null,
  is_paid: Boolean(value.is_paid),
  requires_document: Boolean(value.requires_document),
  max_days_per_year: Number(value.max_days_per_year || 0),
  is_active: value.is_active !== false,
  request_type: String(value.request_type || "cuti_lainnya") as HrLeaveRequestType,
  approval_type_code: String(value.approval_type_code || "LEAVE"),
  document_template_id: typeof value.document_template_id === "string" ? value.document_template_id : null,
  document_template:
    value.document_template && typeof value.document_template === "object"
      ? {
          template_name: String((value.document_template as Record<string, unknown>).template_name || ""),
          template_type: String((value.document_template as Record<string, unknown>).template_type || ""),
        }
      : null,
});

export const formatLeaveDayAmount = (value: number | string | null | undefined) => {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
};

export async function ensureTenantHrLeaveTypesSeeded(tenantId: string) {
  const { count, error: countError } = await supabase
    .from("leave_types")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (countError) throw countError;
  if ((count || 0) > 0) return false;

  const payload = DEFAULT_HR_LEAVE_TYPES.map((item) => ({
    tenant_id: tenantId,
    leave_name: item.leave_name,
    leave_code: item.leave_code,
    description: item.description,
    is_paid: item.is_paid,
    requires_document: item.requires_document,
    max_days_per_year: item.max_days_per_year,
    is_active: item.is_active,
    request_type: item.request_type,
    approval_type_code: item.approval_type_code,
  }));

  const { error } = await supabase.from("leave_types").insert(payload as never);
  if (error) throw error;
  return true;
}

export async function fetchTenantHrLeaveTypes(tenantId: string, seedIfEmpty = false) {
  if (seedIfEmpty) {
    await ensureTenantHrLeaveTypesSeeded(tenantId);
  }

  const { data, error } = await supabase
    .from("leave_types")
    .select(
      "id, tenant_id, leave_name, leave_code, description, is_paid, requires_document, max_days_per_year, is_active, request_type, approval_type_code, document_template_id, document_template:document_template_id(template_name, template_type)",
    )
    .eq("tenant_id", tenantId)
    .order("leave_name", { ascending: true });

  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(normalizeLeaveType);
}

export function getDefaultAttendanceLeaveOptions(): LeaveRequestOption[] {
  return DEFAULT_ATTENDANCE_LEAVE_OPTIONS.map((item) => ({ ...item }));
}

export async function fetchTenantLeaveRequestOptions(tenantId: string): Promise<LeaveRequestOption[]> {
  try {
    const { modules } = await fetchTenantOrgWorkspaceModules(tenantId);
    if (!modules.hr) {
      return getDefaultAttendanceLeaveOptions();
    }

    const hrLeaveTypes = await fetchTenantHrLeaveTypes(tenantId, false);
    const activeHrLeaveTypes = hrLeaveTypes.filter((item) => item.is_active);
    if (activeHrLeaveTypes.length === 0) {
      return getDefaultAttendanceLeaveOptions();
    }

    return activeHrLeaveTypes.map((item) => ({
      id: item.id,
      leave_name: item.leave_name,
      leave_code: item.leave_code,
      description: item.description,
      requires_document: item.requires_document,
      request_type: item.request_type,
      approval_type_code: item.approval_type_code,
      source: "hr",
      document_template: item.document_template || null,
    }));
  } catch {
    return getDefaultAttendanceLeaveOptions();
  }
}
