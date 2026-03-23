import { supabase } from "@/integrations/supabase/client";

interface EmployeeInvoiceSnapshot {
  id: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  package_duration_months: number | null;
  metadata?: unknown;
}

const parseMetadataScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const raw = metadata as Record<string, unknown>;
  return raw.billing_scope === "individual" ? "individual" : "centralized";
};

const parseMetadataEmployeeId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  if (typeof raw.employee_id === "string" && raw.employee_id.trim().length > 0) {
    return raw.employee_id.trim();
  }
  return null;
};

const computeCoverageEnd = (paidInvoices: EmployeeInvoiceSnapshot[]): Date | null => {
  if (paidInvoices.length === 0) return null;

  const sorted = [...paidInvoices].sort((a, b) => {
    const aTime = Date.parse(a.paid_at || a.created_at);
    const bTime = Date.parse(b.paid_at || b.created_at);
    return aTime - bTime;
  });

  let coverageEnd: Date | null = null;
  for (const invoice of sorted) {
    const baseStart = new Date(invoice.paid_at || invoice.created_at);
    if (Number.isNaN(baseStart.getTime())) continue;
    const startAt =
      coverageEnd && coverageEnd.getTime() > baseStart.getTime() ? new Date(coverageEnd) : baseStart;
    const endAt = new Date(startAt);
    endAt.setMonth(endAt.getMonth() + Math.max(1, invoice.package_duration_months || 1));
    coverageEnd = endAt;
  }

  return coverageEnd;
};

export const hasActiveIndividualBillingCoverage = async ({
  tenantId,
  employeeId,
  billingMode,
}: {
  tenantId: string;
  employeeId: string;
  billingMode: string;
}): Promise<boolean> => {
  if (billingMode !== "individual") return true;

  const now = new Date();
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, paid_at, created_at, package_duration_months, metadata")
    .eq("tenant_id", tenantId)
    .eq("metadata->>billing_scope", "individual")
    .eq("metadata->>employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (invoiceError) throw invoiceError;

  const scopedInvoices = ((invoiceRows || []) as EmployeeInvoiceSnapshot[]).filter((invoice) => {
    return parseMetadataScope(invoice.metadata) === "individual" && parseMetadataEmployeeId(invoice.metadata) === employeeId;
  });
  const paidInvoices = scopedInvoices.filter((invoice) => (invoice.status || "").toUpperCase() === "PAID");
  const coverageEnd = computeCoverageEnd(paidInvoices);
  if (coverageEnd && coverageEnd.getTime() > now.getTime()) {
    return true;
  }

  // Fallback grace period to avoid hard lock while tenant is still in tracking/grace.
  const { data: streak, error: streakError } = await supabase
    .from("stability_streaks")
    .select("status, reached_target, grace_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (streakError) throw streakError;

  if (streak?.status === "tracking" || !streak?.reached_target) return true;
  if (streak?.grace_period_end) return new Date(streak.grace_period_end) > now;
  return false;
};

