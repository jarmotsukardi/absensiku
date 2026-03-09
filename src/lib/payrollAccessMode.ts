import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";

export const ORG_PAYROLL_ACCESS_MODE_KEY = "org_payroll_access_mode_v1";

const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 15000;

export type PayrollAccessMode = "fallback" | "strict";

const normalizeMode = (value: unknown): PayrollAccessMode => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const mode = (value as Record<string, unknown>).mode;
    if (mode === "strict") return "strict";
  }
  return "fallback";
};

export async function fetchTenantPayrollAccessMode(tenantId: string): Promise<PayrollAccessMode> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_PAYROLL_ACCESS_MODE_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan mode akses payroll timeout.",
  );

  if (error && error.code !== "PGRST116") throw error;
  return normalizeMode(data?.setting_value);
}

export async function saveTenantPayrollAccessMode(
  tenantId: string,
  mode: PayrollAccessMode,
): Promise<PayrollAccessMode> {
  const nextMode: PayrollAccessMode = mode === "strict" ? "strict" : "fallback";
  const value = { version: 1, mode: nextMode };

  const { data: existing, error: existingError } = await withTimeout(
    () =>
      supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ORG_PAYROLL_ACCESS_MODE_KEY)
        .maybeSingle(),
    READ_TIMEOUT_MS,
    "Permintaan cek mode akses payroll timeout.",
  );
  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { error } = await withTimeout(
      () =>
        supabase
          .from("organization_settings")
          .update({
            setting_value: value,
            description: "Mode akses route payroll (fallback/strict)",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id),
      WRITE_TIMEOUT_MS,
      "Simpan mode akses payroll timeout.",
    );
    if (error) throw error;
  } else {
    const { error } = await withTimeout(
      () =>
        supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: ORG_PAYROLL_ACCESS_MODE_KEY,
          setting_value: value,
          description: "Mode akses route payroll (fallback/strict)",
        }),
      WRITE_TIMEOUT_MS,
      "Tambah mode akses payroll timeout.",
    );
    if (error) throw error;
  }

  return nextMode;
}
