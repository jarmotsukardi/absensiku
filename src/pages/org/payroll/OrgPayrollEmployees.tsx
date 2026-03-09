import { PayrollScaffoldPage } from "./PayrollScaffoldPage";

export default function OrgPayrollEmployees() {
  return (
    <PayrollScaffoldPage
      title="Master Karyawan Payroll"
      description="Kelola data payroll pegawai: metode pembayaran, rekening, NPWP/NIK, PTKP, dan status aktif payroll."
      phase={1}
      routeKey="payroll_employees"
      nextPath="/org/payroll/income-components"
    />
  );
}
