import { supabase } from "@/integrations/supabase/client";

export const HR_TICKET_POLICY_DEFAULTS_KEY = "hr_ticket_policy_defaults_v1";
export const HR_TICKET_POLICY_SETTING_KEY = "hr_ticket_policy_settings_v1";

export type HrTicketRole = "super_admin" | "admin_instansi" | "atasan" | "operator";

export interface HrTicketPolicySettings {
  defaultSlaHours: number;
  canCreate: HrTicketRole[];
  canAssign: HrTicketRole[];
  canComment: HrTicketRole[];
  canTake: HrTicketRole[];
  canResolve: HrTicketRole[];
  canReopen: HrTicketRole[];
}

export const DEFAULT_HR_TICKET_POLICY_SETTINGS: HrTicketPolicySettings = {
  defaultSlaHours: 24,
  canCreate: ["super_admin", "admin_instansi"],
  canAssign: ["super_admin", "admin_instansi"],
  canComment: ["super_admin", "admin_instansi", "atasan"],
  canTake: ["super_admin", "admin_instansi", "atasan"],
  canResolve: ["super_admin", "admin_instansi"],
  canReopen: ["super_admin", "admin_instansi"],
};

const ALL_ROLES: HrTicketRole[] = ["super_admin", "admin_instansi", "atasan", "operator"];

const normalizeRoles = (value: unknown, fallback: HrTicketRole[]): HrTicketRole[] => {
  if (!Array.isArray(value)) return fallback;
  const sanitized = value.filter((item): item is HrTicketRole =>
    typeof item === "string" && ALL_ROLES.includes(item as HrTicketRole),
  );
  if (sanitized.length === 0) return fallback;
  return Array.from(new Set(sanitized));
};

export const normalizeHrTicketPolicySettings = (value: unknown): HrTicketPolicySettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_HR_TICKET_POLICY_SETTINGS;
  }

  const raw = value as Record<string, unknown>;
  const defaultSlaHoursRaw =
    typeof raw.default_sla_hours === "number"
      ? raw.default_sla_hours
      : typeof raw.default_sla_hours === "string"
        ? Number(raw.default_sla_hours)
        : DEFAULT_HR_TICKET_POLICY_SETTINGS.defaultSlaHours;

  return {
    defaultSlaHours:
      Number.isFinite(defaultSlaHoursRaw) && defaultSlaHoursRaw > 0
        ? Math.max(1, Math.min(720, Math.floor(defaultSlaHoursRaw)))
        : DEFAULT_HR_TICKET_POLICY_SETTINGS.defaultSlaHours,
    canCreate: normalizeRoles(raw.can_create, DEFAULT_HR_TICKET_POLICY_SETTINGS.canCreate),
    canAssign: normalizeRoles(raw.can_assign, DEFAULT_HR_TICKET_POLICY_SETTINGS.canAssign),
    canComment: normalizeRoles(raw.can_comment, DEFAULT_HR_TICKET_POLICY_SETTINGS.canComment),
    canTake: normalizeRoles(raw.can_take, DEFAULT_HR_TICKET_POLICY_SETTINGS.canTake),
    canResolve: normalizeRoles(raw.can_resolve, DEFAULT_HR_TICKET_POLICY_SETTINGS.canResolve),
    canReopen: normalizeRoles(raw.can_reopen, DEFAULT_HR_TICKET_POLICY_SETTINGS.canReopen),
  };
};

export const serializeHrTicketPolicySettings = (value: HrTicketPolicySettings) => ({
  default_sla_hours: value.defaultSlaHours,
  can_create: value.canCreate,
  can_assign: value.canAssign,
  can_comment: value.canComment,
  can_take: value.canTake,
  can_resolve: value.canResolve,
  can_reopen: value.canReopen,
});

export const canRolePerform = (
  policy: HrTicketPolicySettings,
  role: HrTicketRole,
  capability: "create" | "assign" | "comment" | "take" | "resolve" | "reopen",
): boolean => {
  if (capability === "create") return policy.canCreate.includes(role);
  if (capability === "assign") return policy.canAssign.includes(role);
  if (capability === "comment") return policy.canComment.includes(role);
  if (capability === "take") return policy.canTake.includes(role);
  if (capability === "resolve") return policy.canResolve.includes(role);
  return policy.canReopen.includes(role);
};

export async function fetchGlobalHrTicketPolicySettings(): Promise<HrTicketPolicySettings> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", HR_TICKET_POLICY_DEFAULTS_KEY)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return normalizeHrTicketPolicySettings(data?.value);
}

export async function saveTenantHrTicketPolicySettings(
  tenantId: string,
  settings: HrTicketPolicySettings,
): Promise<void> {
  const payload = serializeHrTicketPolicySettings(settings);
  const { data: existing, error: existingError } = await supabase
    .from("organization_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("setting_key", HR_TICKET_POLICY_SETTING_KEY)
    .maybeSingle();
  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("organization_settings")
      .update({
        setting_value: payload,
        description: "Pengaturan SLA dan role matrix tiket HR.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase.from("organization_settings").insert({
    tenant_id: tenantId,
    setting_key: HR_TICKET_POLICY_SETTING_KEY,
    setting_value: payload,
    description: "Pengaturan SLA dan role matrix tiket HR.",
  });
  if (insertError) throw insertError;
}
