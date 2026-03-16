import { PayrollScaffoldPage } from "./PayrollScaffoldPage";

export default function OrgPayrollEmployees() {
  return (
    <PayrollScaffoldPage
      title="Data Pegawai Payroll"
      description="Halaman ini menjadi referensi data pegawai dari HR untuk memastikan kesiapan payroll, bukan master payroll baru."
      phase={1}
      routeKey="payroll_employees"
      badgeLabel="Referensi HR"
      phaseLabel="Tahap Referensi"
      routeKeyLabel="Kunci Referensi"
      flowTitle="Fokus Referensi"
      flowStatuses={["Data HR", "Status Aktif", "Kontrak", "Kesiapan Payroll"]}
      guidanceTitle="Peran Halaman Ini"
      guidanceDescription="Payroll membaca konteks pegawai dari HR. Saat implementasi lanjut, halaman ini sebaiknya menampilkan ringkasan kesiapan data pegawai tanpa menduplikasi master data HR."
      nextPath="/org/payroll/org-grade"
      backPath="/org/payroll"
      homeLabel="Kembali ke Beranda Payroll"
      nextLabel="Buka Struktur Organisasi dan Grade"
      guidePath="/org/payroll/employees"
    />
  );
}
