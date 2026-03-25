export type BillingPackageModuleScope =
  | "attendance"
  | "attendance_hr"
  | "attendance_hr_payroll";

export const DEFAULT_BILLING_PACKAGE_MODULE_SCOPE: BillingPackageModuleScope = "attendance";

export const BILLING_PACKAGE_MODULE_SCOPE_OPTIONS = [
  { value: "attendance", label: "Absensi" },
  { value: "attendance_hr", label: "Absensi + HR" },
  { value: "attendance_hr_payroll", label: "Absensi + HR + Payroll" },
] as const satisfies ReadonlyArray<{
  value: BillingPackageModuleScope;
  label: string;
}>;

export const normalizeBillingPackageModuleScope = (
  value: unknown,
): BillingPackageModuleScope => {
  if (
    value === "attendance" ||
    value === "attendance_hr" ||
    value === "attendance_hr_payroll"
  ) {
    return value;
  }

  return DEFAULT_BILLING_PACKAGE_MODULE_SCOPE;
};

export const getBillingPackageModuleScopeLabel = (value: unknown): string =>
  BILLING_PACKAGE_MODULE_SCOPE_OPTIONS.find((option) => option.value === value)?.label ||
  BILLING_PACKAGE_MODULE_SCOPE_OPTIONS[0].label;

export const isAttendanceOnlyBillingPackage = (
  pkg: { module_scope?: unknown } | null | undefined,
): boolean => normalizeBillingPackageModuleScope(pkg?.module_scope) === "attendance";

export const getBillingPackageDisplayName = (
  packageName: string | null | undefined,
  moduleScope: unknown,
): string => {
  const safePackageName = typeof packageName === "string" && packageName.trim().length > 0
    ? packageName.trim()
    : "Paket Langganan";
  const normalizedScope = normalizeBillingPackageModuleScope(moduleScope);
  if (normalizedScope === "attendance") return safePackageName;
  return `${safePackageName} • ${getBillingPackageModuleScopeLabel(normalizedScope)}`;
};
