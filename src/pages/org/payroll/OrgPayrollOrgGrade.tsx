import { PayrollScaffoldPage } from "./PayrollScaffoldPage";

export default function OrgPayrollOrgGrade() {
  return (
    <PayrollScaffoldPage
      title="Struktur Organisasi dan Grade"
      description="Halaman ini menjadi referensi struktur organisasi dan grade dari HR untuk membantu pembacaan konteks payroll."
      phase={4}
      routeKey="payroll_org_grade"
      badgeLabel="Referensi HR"
      phaseLabel="Tahap Referensi"
      routeKeyLabel="Kunci Referensi"
      flowTitle="Fokus Referensi"
      flowStatuses={["Struktur HR", "Jabatan", "Grade", "Konteks Payroll"]}
      guidanceTitle="Peran Halaman Ini"
      guidanceDescription="Payroll memakai struktur organisasi dan grade dari HR sebagai konteks kerja. Pada tahap lanjut, halaman ini sebaiknya membantu membaca dampak struktur dan grade terhadap payroll tanpa membuat master terpisah."
      backPath="/org/payroll/employees"
      nextPath="/org/payroll"
      homeLabel="Kembali ke Beranda Payroll"
      nextLabel="Kembali ke Alur Inti"
      guidePath="/org/payroll/org-grade"
    />
  );
}
