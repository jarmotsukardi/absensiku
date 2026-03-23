export type PayrollRole =
  | "payroll_admin"
  | "payroll_officer"
  | "payroll_finance"
  | "payroll_approver"
  | "payroll_auditor";

export type PayrollPermission =
  | "payroll.workspace.view"
  | "payroll.master.manage"
  | "payroll.policy.manage"
  | "payroll.period.manage"
  | "payroll.variable.manage"
  | "payroll.validation.manage"
  | "payroll.run.manage"
  | "payroll.approval.manage"
  | "payroll.slips.manage"
  | "payroll.payment.manage"
  | "payroll.tax.manage"
  | "payroll.reports.view"
  | "payroll.audit.view"
  | "payroll.roles.manage"
  | "payroll.integration.manage";

export const PAYROLL_ROLE_LABELS: Record<PayrollRole, string> = {
  payroll_admin: "Payroll Admin",
  payroll_officer: "Payroll Officer",
  payroll_finance: "Payroll Finance",
  payroll_approver: "Payroll Approver",
  payroll_auditor: "Payroll Auditor",
};

export const PAYROLL_ROLE_PERMISSION_MAP: Record<PayrollRole, PayrollPermission[]> = {
  payroll_admin: [
    "payroll.workspace.view",
    "payroll.master.manage",
    "payroll.policy.manage",
    "payroll.period.manage",
    "payroll.variable.manage",
    "payroll.validation.manage",
    "payroll.run.manage",
    "payroll.approval.manage",
    "payroll.slips.manage",
    "payroll.payment.manage",
    "payroll.tax.manage",
    "payroll.reports.view",
    "payroll.audit.view",
    "payroll.roles.manage",
    "payroll.integration.manage",
  ],
  payroll_officer: [
    "payroll.workspace.view",
    "payroll.master.manage",
    "payroll.policy.manage",
    "payroll.period.manage",
    "payroll.variable.manage",
    "payroll.validation.manage",
    "payroll.run.manage",
    "payroll.slips.manage",
  ],
  payroll_finance: [
    "payroll.workspace.view",
    "payroll.payment.manage",
    "payroll.tax.manage",
    "payroll.reports.view",
  ],
  payroll_approver: [
    "payroll.workspace.view",
    "payroll.approval.manage",
    "payroll.reports.view",
  ],
  payroll_auditor: [
    "payroll.workspace.view",
    "payroll.reports.view",
    "payroll.audit.view",
  ],
};

export const resolvePayrollPermissionsFromRoles = (roles: PayrollRole[]) => {
  const permissions = new Set<PayrollPermission>();
  for (const role of roles) {
    const mapped = PAYROLL_ROLE_PERMISSION_MAP[role] || [];
    for (const permission of mapped) permissions.add(permission);
  }
  return Array.from(permissions);
};

export const hasPayrollPermission = (
  permissions: PayrollPermission[],
  required: PayrollPermission,
) => permissions.includes(required);
