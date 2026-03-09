import { AdminPayrollPageScaffold } from "./AdminPayrollPageScaffold";

const links = [
  { title: "Tenant Payroll", path: "/admin/payroll/tenants" },
  { title: "Monitoring Payroll", path: "/admin/payroll/monitoring" },
  { title: "Log Error Payroll", path: "/admin/payroll/error-logs" },
  { title: "Audit Payroll", path: "/admin/payroll/audit" },
  { title: "Integrasi Payroll", path: "/admin/payroll/integrations" },
  { title: "Pengaturan Payroll", path: "/admin/payroll/settings" },
];

export default function AdminPayrollDashboard() {
  return (
    <AdminPayrollPageScaffold
      title="Dashboard Superadmin Payroll"
      subtitle="Ringkasan operasional payroll lintas tenant"
      description="Pusat kontrol payroll untuk superadmin. Gunakan halaman ini sebagai entry point semua modul payroll global."
      links={links}
    />
  );
}
