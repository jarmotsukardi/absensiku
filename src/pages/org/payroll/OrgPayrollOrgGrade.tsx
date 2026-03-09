import { PayrollScaffoldPage } from "./PayrollScaffoldPage";

export default function OrgPayrollOrgGrade() {
  return (
    <PayrollScaffoldPage
      title="Struktur Organisasi & Grade"
      description="Kelola grade/level/golongan payroll sebagai baseline skala gaji dan kebijakan per grade."
      phase={4}
      routeKey="payroll_org_grade"
      backPath="/org/payroll/employees"
      nextPath="/org/payroll/tax-compliance"
    />
  );
}
