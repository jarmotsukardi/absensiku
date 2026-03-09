import { OrgPayrollComponentsBase } from "./OrgPayrollComponentsBase";

const DEDUCTION_COMPONENT_TYPES = [
  { value: "fixed", label: "Fixed" },
  { value: "variable", label: "Variable" },
  { value: "installment", label: "Cicilan" },
];

export default function OrgPayrollDeductionComponents() {
  return (
    <OrgPayrollComponentsBase
      title="Komponen Potongan"
      description="Kelola komponen potongan payroll seperti BPJS, PPh21, pinjaman, denda, dan iuran lainnya."
      tableName="payroll_deduction_components"
      createTitle="Tambah Komponen Potongan"
      editTitle="Edit Komponen Potongan"
      exportFilenamePrefix="payroll-deduction-components"
      searchPlaceholder="Cari kode, nama potongan, tipe, atau catatan..."
      componentTypeOptions={DEDUCTION_COMPONENT_TYPES}
      backPath="/org/payroll/income-components"
      routeErrorScope="org.payroll.deduction_components"
    />
  );
}
