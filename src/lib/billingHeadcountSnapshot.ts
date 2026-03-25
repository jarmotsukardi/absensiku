import type { TablesUpdate } from "@/integrations/supabase/types";

export type BillingHeadcountMode = "actual_active_employee" | "manual_contract";

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const toPositiveInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      const rounded = Math.floor(parsed);
      return rounded > 0 ? rounded : null;
    }
  }

  return null;
};

const toMode = (value: unknown): BillingHeadcountMode | null => {
  if (value === "manual_contract" || value === "actual_active_employee") {
    return value;
  }
  return null;
};

export const buildSubscriptionHeadcountSnapshotFromInvoice = (
  invoice: Pick<{ employee_count?: number | null; metadata?: unknown }, "employee_count" | "metadata">,
  currentState?: Pick<
    TablesUpdate<"subscriptions">,
    "billing_headcount_mode" | "contracted_employee_count" | "max_employees"
  > | null,
): Pick<TablesUpdate<"subscriptions">, "billing_headcount_mode" | "contracted_employee_count" | "max_employees"> => {
  const metadataRecord = toRecord(invoice.metadata);
  const billingScope =
    typeof metadataRecord?.billing_scope === "string" ? metadataRecord.billing_scope.trim() : "centralized";
  const invoiceEmployeeCount = Math.max(1, Math.floor(toPositiveInteger(invoice.employee_count) ?? 1));

  if (billingScope === "individual") {
    return {
      billing_headcount_mode:
        toMode(currentState?.billing_headcount_mode) ?? "actual_active_employee",
      contracted_employee_count: currentState?.contracted_employee_count ?? null,
      max_employees: currentState?.max_employees ?? null,
    };
  }

  const explicitMode =
    toMode(metadataRecord?.billing_headcount_mode_after_payment) ??
    toMode(metadataRecord?.billing_headcount_mode);
  const explicitContractCount =
    toPositiveInteger(metadataRecord?.contracted_employee_count_after_payment) ??
    toPositiveInteger(metadataRecord?.contracted_employee_count);
  const employeeCountSource =
    typeof metadataRecord?.employee_count_source === "string"
      ? metadataRecord.employee_count_source.trim()
      : null;
  const billingOrigin =
    typeof metadataRecord?.billing_origin === "string"
      ? metadataRecord.billing_origin.trim()
      : null;

  const inferredManualContract =
    explicitMode === "manual_contract" ||
    employeeCountSource === "manual_contract" ||
    billingOrigin === "activation_early";
  const resolvedMode =
    explicitMode ??
    (inferredManualContract
      ? "manual_contract"
      : toMode(currentState?.billing_headcount_mode) ?? "actual_active_employee");
  const resolvedContractCount =
    resolvedMode === "manual_contract"
      ? explicitContractCount ??
        toPositiveInteger(currentState?.contracted_employee_count) ??
        invoiceEmployeeCount
      : null;

  return {
    billing_headcount_mode: resolvedMode,
    contracted_employee_count: resolvedContractCount,
    max_employees:
      resolvedMode === "manual_contract"
        ? resolvedContractCount
        : currentState?.max_employees ?? null,
  };
};
