import { describe, expect, it } from "vitest";
import { hasPayrollPermission, resolvePayrollPermissionsFromRoles } from "@/lib/payrollAccessCore";

describe("payrollAccess", () => {
  it("maps payroll_finance permissions", () => {
    const permissions = resolvePayrollPermissionsFromRoles(["payroll_finance"]);
    expect(permissions).toContain("payroll.payment.manage");
    expect(permissions).toContain("payroll.tax.manage");
    expect(permissions).not.toContain("payroll.roles.manage");
  });

  it("unions permissions from multiple roles", () => {
    const permissions = resolvePayrollPermissionsFromRoles(["payroll_approver", "payroll_auditor"]);
    expect(permissions).toContain("payroll.approval.manage");
    expect(permissions).toContain("payroll.audit.view");
    expect(permissions).toContain("payroll.reports.view");
  });

  it("checks required permission correctly", () => {
    const permissions = resolvePayrollPermissionsFromRoles(["payroll_officer"]);
    expect(hasPayrollPermission(permissions, "payroll.run.manage")).toBe(true);
    expect(hasPayrollPermission(permissions, "payroll.roles.manage")).toBe(false);
  });
});
