export const ACTIVE_INVOICE_STATUSES = [
  "PENDING",
  "AWAITING_VERIFICATION",
  "AWAITING_VERIFICATION_FULL",
  "PENDING_VERIFICATION_PARTIAL",
  "PARTIALLY_PAID",
  "REJECTED_NEEDS_REVISION",
] as const;

export const isActiveInvoiceStatus = (status: string | null | undefined): boolean =>
  ACTIVE_INVOICE_STATUSES.includes((status || "").toUpperCase() as (typeof ACTIVE_INVOICE_STATUSES)[number]);

export const parseIntegerAmountInput = (raw: string): number => {
  const normalized = (raw || "").replace(/[^\d]/g, "");
  if (!normalized) return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
};

export const toAmountCents = (value: number): number => Math.round(Number(value || 0) * 100);

export const isAmountOverRemaining = (paidAmount: number, remainingAmount: number): boolean =>
  toAmountCents(paidAmount) > toAmountCents(Math.max(0, remainingAmount));
