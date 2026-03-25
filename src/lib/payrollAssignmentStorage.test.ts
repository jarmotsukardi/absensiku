import { describe, expect, it } from "vitest";
import { isPayrollRoleAssignmentStorageMissing } from "@/lib/payrollAssignmentStorage";

describe("payrollAssignmentStorage", () => {
  it("mengenali missing table Postgres langsung", () => {
    expect(isPayrollRoleAssignmentStorageMissing({ code: "42P01" })).toBe(true);
  });

  it("mengenali missing table via PostgREST schema cache", () => {
    expect(
      isPayrollRoleAssignmentStorageMissing({
        code: "PGRST205",
        message: "Could not find the table 'public.payroll_role_assignments' in the schema cache",
      }),
    ).toBe(true);
  });

  it("mengabaikan error yang bukan missing assignment storage", () => {
    expect(
      isPayrollRoleAssignmentStorageMissing({
        code: "PGRST205",
        message: "Could not find the table 'public.payroll_income_components' in the schema cache",
      }),
    ).toBe(false);
    expect(isPayrollRoleAssignmentStorageMissing({ code: "42501" })).toBe(false);
    expect(isPayrollRoleAssignmentStorageMissing(null)).toBe(false);
  });
});
