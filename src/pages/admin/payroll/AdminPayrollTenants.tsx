import { AdminPayrollPageScaffold } from "./AdminPayrollPageScaffold";

const links = [
  { title: "Kembali ke Dashboard Payroll", path: "/admin/payroll" },
  { title: "Monitoring Payroll", path: "/admin/payroll/monitoring" },
  { title: "Integrasi Payroll", path: "/admin/payroll/integrations" },
];

export default function AdminPayrollTenants() {
  return (
    <AdminPayrollPageScaffold
      title="Tenant Payroll"
      subtitle="Visibilitas tenant yang mengaktifkan payroll"
      description="Halaman ini disiapkan untuk manajemen tenant payroll lintas organisasi (aktivasi, health status, dan readiness)."
      links={links}
    />
  );
}
