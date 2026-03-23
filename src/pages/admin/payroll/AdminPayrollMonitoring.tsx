import { AdminPayrollPageScaffold } from "./AdminPayrollPageScaffold";

const links = [
  { title: "Kembali ke Dashboard Payroll", path: "/admin/payroll" },
  { title: "Log Error Payroll", path: "/admin/payroll/error-logs" },
  { title: "Audit Payroll", path: "/admin/payroll/audit" },
];

export default function AdminPayrollMonitoring() {
  return (
    <AdminPayrollPageScaffold
      title="Monitoring Payroll"
      subtitle="Monitoring eksekusi payroll lintas tenant"
      description="Halaman monitoring disiapkan untuk observability proses payroll (run rate, failure trend, dan anomali)."
      links={links}
    />
  );
}
