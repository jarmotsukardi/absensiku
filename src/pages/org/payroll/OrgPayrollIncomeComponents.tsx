import { OrgPayrollComponentsBase } from "./OrgPayrollComponentsBase";

const INCOME_COMPONENT_TYPES = [
  { value: "fixed", label: "Tetap" },
  { value: "variable", label: "Variabel" },
  { value: "formula", label: "Formula" },
];

export default function OrgPayrollIncomeComponents() {
  return (
    <OrgPayrollComponentsBase
      title="Komponen Penghasilan"
      description="Kelola komponen penghasilan payroll seperti gaji pokok, tunjangan, lembur, bonus, dan formula penghasilan."
      tableName="payroll_income_components"
      createTitle="Tambah Komponen Penghasilan"
      editTitle="Edit Komponen Penghasilan"
      exportFilenamePrefix="payroll-income-components"
      searchPlaceholder="Cari kode, nama komponen, tipe, atau catatan..."
      componentTypeOptions={INCOME_COMPONENT_TYPES}
      backPath="/org/payroll/employees"
      routeErrorScope="org.payroll.income_components"
      guidePath="/org/payroll/income-components"
    />
  );
}
