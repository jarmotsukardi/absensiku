import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import {
  DEFAULT_PAYROLL_ACCESS_MODE,
  normalizePayrollAccessMode,
} from "@/lib/payrollAccessMode";

describe("payrollAccessMode", () => {
  it("defaults to strict when setting is missing or malformed", () => {
    expect(normalizePayrollAccessMode(null)).toBe(DEFAULT_PAYROLL_ACCESS_MODE);
    expect(normalizePayrollAccessMode(undefined)).toBe(DEFAULT_PAYROLL_ACCESS_MODE);
    expect(normalizePayrollAccessMode({})).toBe(DEFAULT_PAYROLL_ACCESS_MODE);
    expect(normalizePayrollAccessMode({ mode: "unknown" })).toBe(DEFAULT_PAYROLL_ACCESS_MODE);
  });

  it("preserves explicit fallback and strict payloads", () => {
    expect(normalizePayrollAccessMode({ mode: "fallback" })).toBe("fallback");
    expect(normalizePayrollAccessMode({ mode: "strict" })).toBe("strict");
  });
});
