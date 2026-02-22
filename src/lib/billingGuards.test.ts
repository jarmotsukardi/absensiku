import { describe, expect, it } from "vitest";
import {
  isActiveInvoiceStatus,
  isAmountOverRemaining,
  parseIntegerAmountInput,
  toAmountCents,
} from "@/lib/billingGuards";

describe("billingGuards", () => {
  it("recognizes active invoice statuses", () => {
    expect(isActiveInvoiceStatus("PENDING")).toBe(true);
    expect(isActiveInvoiceStatus("AWAITING_VERIFICATION")).toBe(true);
    expect(isActiveInvoiceStatus("AWAITING_VERIFICATION_FULL")).toBe(true);
    expect(isActiveInvoiceStatus("PENDING_VERIFICATION_PARTIAL")).toBe(true);
    expect(isActiveInvoiceStatus("PARTIALLY_PAID")).toBe(true);
    expect(isActiveInvoiceStatus("REJECTED_NEEDS_REVISION")).toBe(true);
    expect(isActiveInvoiceStatus("PAID")).toBe(false);
    expect(isActiveInvoiceStatus(null)).toBe(false);
  });

  it("parses numeric amount input safely", () => {
    expect(parseIntegerAmountInput("445.940")).toBe(445940);
    expect(parseIntegerAmountInput("Rp 1.234.567")).toBe(1234567);
    expect(parseIntegerAmountInput("")).toBe(0);
  });

  it("converts to cents consistently", () => {
    expect(toAmountCents(10)).toBe(1000);
    expect(toAmountCents(10.01)).toBe(1001);
  });

  it("detects overpayment against remaining amount", () => {
    expect(isAmountOverRemaining(100000, 100000)).toBe(false);
    expect(isAmountOverRemaining(100001, 100000)).toBe(true);
  });
});
