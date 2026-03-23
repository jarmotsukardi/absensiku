import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

type AuditLoggingPolicy = {
  defaultOrgLoggingEnabled: boolean;
  tenantOverrides: Record<string, boolean>;
};

const AUDIT_ACTIVITY_POLICY_KEY = "audit_logs_activity_policy";
const AUDIT_POLICY_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_AUDIT_LOGGING_POLICY: AuditLoggingPolicy = {
  defaultOrgLoggingEnabled: true,
  tenantOverrides: {},
};

let auditPolicyCache: {
  policy: AuditLoggingPolicy;
  expiresAt: number;
  inFlight: Promise<AuditLoggingPolicy> | null;
} = {
  policy: DEFAULT_AUDIT_LOGGING_POLICY,
  expiresAt: 0,
  inFlight: null,
};

const normalizeAuditLoggingPolicy = (value: unknown): AuditLoggingPolicy => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_AUDIT_LOGGING_POLICY;
  }

  const raw = value as Record<string, unknown>;
  const overridesRaw =
    raw.tenant_overrides && typeof raw.tenant_overrides === "object" && !Array.isArray(raw.tenant_overrides)
      ? (raw.tenant_overrides as Record<string, unknown>)
      : {};
  const tenantOverrides: Record<string, boolean> = {};

  for (const [tenantId, flag] of Object.entries(overridesRaw)) {
    if (typeof flag === "boolean") {
      tenantOverrides[tenantId] = flag;
    }
  }

  return {
    defaultOrgLoggingEnabled:
      typeof raw.default_org_logging_enabled === "boolean"
        ? raw.default_org_logging_enabled
        : DEFAULT_AUDIT_LOGGING_POLICY.defaultOrgLoggingEnabled,
    tenantOverrides,
  };
};

const resolvePolicyFromServer = async (): Promise<AuditLoggingPolicy> => {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", AUDIT_ACTIVITY_POLICY_KEY)
    .maybeSingle();

  if (error) throw error;
  return normalizeAuditLoggingPolicy(data?.value);
};

const resolveAuditLoggingPolicy = async (): Promise<AuditLoggingPolicy> => {
  const now = Date.now();
  if (auditPolicyCache.expiresAt > now) {
    return auditPolicyCache.policy;
  }

  if (auditPolicyCache.inFlight) {
    return auditPolicyCache.inFlight;
  }

  auditPolicyCache.inFlight = resolvePolicyFromServer()
    .then((policy) => {
      auditPolicyCache = {
        policy,
        expiresAt: now + AUDIT_POLICY_CACHE_TTL_MS,
        inFlight: null,
      };
      return policy;
    })
    .catch(() => {
      auditPolicyCache = {
        policy: auditPolicyCache.policy,
        expiresAt: now + 30 * 1000,
        inFlight: null,
      };
      return auditPolicyCache.policy;
    });

  return auditPolicyCache.inFlight;
};

const resolveEffectiveTenantId = (
  tenantId: string | null | undefined,
  payload: AuditLogInsert | AuditLogInsert[],
) => {
  if (tenantId) return tenantId;
  if (Array.isArray(payload)) {
    return payload[0]?.tenant_id ?? null;
  }
  return payload.tenant_id ?? null;
};

export const isAuditLoggingEnabledForTenant = async (tenantId?: string | null): Promise<boolean> => {
  const policy = await resolveAuditLoggingPolicy();
  if (tenantId && Object.prototype.hasOwnProperty.call(policy.tenantOverrides, tenantId)) {
    return policy.tenantOverrides[tenantId];
  }
  return policy.defaultOrgLoggingEnabled;
};

export const logAuditIfEnabled = async ({
  tenantId,
  payload,
}: {
  tenantId?: string | null;
  payload: AuditLogInsert | AuditLogInsert[];
}): Promise<{ skipped: boolean; error: PostgrestError | null }> => {
  const effectiveTenantId = resolveEffectiveTenantId(tenantId, payload);
  const shouldLog = await isAuditLoggingEnabledForTenant(effectiveTenantId);

  if (!shouldLog) {
    return { skipped: true, error: null };
  }

  const { error } = await supabase.from("audit_logs").insert(payload);
  return { skipped: false, error };
};

export const logCriticalAudit = async ({
  payload,
}: {
  payload: AuditLogInsert | AuditLogInsert[];
}): Promise<{ error: PostgrestError | null }> => {
  const { error } = await supabase.from("audit_logs").insert(payload);
  return { error };
};
