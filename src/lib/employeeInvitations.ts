import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { clearRpcUnavailableMark, isRpcMarkedUnavailable, isRpcMissingFunctionError, markRpcUnavailable } from "@/lib/rpcAvailability";
import { buildEmployeeLoginPath, buildEmployeeLoginUrl } from "@/lib/employeeAuthRoutes";

export type EmployeeInvitationRow = Pick<
  Tables<"employee_invitations">,
  "id" | "email" | "status" | "is_used" | "expires_at" | "invitation_code" | "created_at"
>;

const INVITATION_CODE_MAX_RETRIES = 5;
const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

export type EmployeeInvitationDeliveryStatus =
  | "not_invited"
  | "pending_active"
  | "pending_expired"
  | "rejected"
  | "verified"
  | "used";

export interface EnsureIndividualEmployeeInvitationInput {
  tenantId: string;
  name: string;
  email: string;
  nik: string;
  phone?: string | null;
  officeId?: string | null;
  opdId?: string | null;
  invitedByEmployeeId?: string | null;
  expiresInDays?: number;
}

export interface EnsureIndividualEmployeeInvitationResult {
  invitation: EmployeeInvitationRow;
  reused: boolean;
}

export interface SendEmployeeInvitationEmailResult {
  email?: string | null;
  message: string;
  traceId?: string | null;
}

export type EmployeeInvitationFlowAuditEvent =
  | "INVITATION_CREATE_NEW"
  | "INVITATION_REUSE_EXISTING";

export interface LogEmployeeInvitationFlowAuditInput {
  tenantId: string;
  invitationId: string;
  event: EmployeeInvitationFlowAuditEvent;
  payload?: Json;
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
};

const isReusablePendingInvitation = (invitation: EmployeeInvitationRow | null): invitation is EmployeeInvitationRow =>
  Boolean(invitation && invitation.status === "pending" && !invitation.is_used && !isExpired(invitation.expires_at));

const generateInvitationCode = (): string =>
  `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export async function findLatestIndividualInvitationByEmail(
  tenantId: string,
  email: string
): Promise<EmployeeInvitationRow | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("employee_invitations")
    .select("id, email, status, is_used, expires_at, invitation_code, created_at")
    .eq("tenant_id", tenantId)
    .eq("invitation_type", "individual")
    .is("archived_at", null)
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as EmployeeInvitationRow | null) ?? null;
}

export async function ensureIndividualEmployeeInvitation(
  input: EnsureIndividualEmployeeInvitationInput
): Promise<EnsureIndividualEmployeeInvitationResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedNik = input.nik.trim();
  if (!normalizedEmail) {
    throw new Error("Email undangan tidak boleh kosong.");
  }
  if (!normalizedNik) {
    throw new Error("NIK undangan tidak boleh kosong.");
  }

  const latestInvitation = await findLatestIndividualInvitationByEmail(input.tenantId, normalizedEmail);
  if (isReusablePendingInvitation(latestInvitation)) {
    return { invitation: latestInvitation, reused: true };
  }

  const expiryDays = Number.isFinite(input.expiresInDays) && (input.expiresInDays ?? 0) > 0
    ? Number(input.expiresInDays)
    : DEFAULT_INVITATION_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  const payloadBase: Omit<TablesInsert<"employee_invitations">, "invitation_code"> = {
    tenant_id: input.tenantId,
    invitation_type: "individual",
    name: input.name.trim() || "Undangan Pegawai",
    email: normalizedEmail,
    nik: normalizedNik,
    phone: input.phone?.trim() || null,
    office_id: input.officeId || null,
    opd_id: input.opdId || null,
    invited_by: input.invitedByEmployeeId || null,
    status: "pending",
    expires_at: expiresAt,
    is_used: false,
    used_at: null,
    verified_at: null,
    verified_by: null,
    rejection_reason: null,
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < INVITATION_CODE_MAX_RETRIES; attempt += 1) {
    const invitationCode = generateInvitationCode();
    const { data, error } = await supabase
      .from("employee_invitations")
      .insert({
        ...payloadBase,
        invitation_code: invitationCode,
      })
      .select("id, email, status, is_used, expires_at, invitation_code, created_at")
      .single();

    if (!error) {
      return {
        invitation: data as EmployeeInvitationRow,
        reused: false,
      };
    }

    // 23505 = unique_violation, retry with a new code.
    if (error.code === "23505") {
      lastError = error;
      continue;
    }

    throw error;
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Gagal membuat undangan unik setelah beberapa percobaan.");
}

export function buildInvitationLink(invitationCode: string): string {
  if (typeof window === "undefined") {
    return buildEmployeeLoginPath(invitationCode);
  }
  return buildEmployeeLoginUrl(invitationCode);
}

export function deriveEmployeeInvitationDeliveryStatus(
  invitation: EmployeeInvitationRow | null
): EmployeeInvitationDeliveryStatus {
  if (!invitation) return "not_invited";
  if (invitation.status === "rejected") return "rejected";
  if (invitation.is_used) return "used";
  if (invitation.status === "pending") {
    return isExpired(invitation.expires_at) ? "pending_expired" : "pending_active";
  }
  if (invitation.status === "verified") return "verified";
  return "not_invited";
}

export async function logEmployeeInvitationFlowAudit(
  input: LogEmployeeInvitationFlowAuditInput
): Promise<string | null> {
  const rpcName = "log_employee_invitation_flow_audit";
  if (isRpcMarkedUnavailable(rpcName)) {
    return null;
  }

  const { data, error } = await supabase.rpc("log_employee_invitation_flow_audit", {
    p_tenant_id: input.tenantId,
    p_invitation_id: input.invitationId,
    p_event: input.event,
    p_payload: (input.payload ?? {}) as Json,
  });

  if (error) {
    if (isRpcMissingFunctionError(error)) {
      markRpcUnavailable(rpcName, error.message);
      return null;
    }
    throw error;
  }
  clearRpcUnavailableMark(rpcName);
  return data ?? null;
}

export async function sendEmployeeInvitationEmail(
  invitationId: string
): Promise<SendEmployeeInvitationEmailResult> {
  const { data, error } = await supabase.functions.invoke("send-employee-invitation-email", {
    body: { invitation_id: invitationId },
  });

  if (error) throw error;

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    email: typeof payload.email === "string" ? payload.email : null,
    message: typeof payload.message === "string" ? payload.message : "Email undangan berhasil dikirim",
    traceId:
      typeof payload.trace_id === "string"
        ? payload.trace_id
        : typeof payload.traceId === "string"
          ? payload.traceId
          : null,
  };
}
