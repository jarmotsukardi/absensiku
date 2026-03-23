import { AdminPayrollPageScaffold } from "./AdminPayrollPageScaffold";

const links = [
  { title: "Kembali ke Dashboard Payroll", path: "/admin/payroll" },
  { title: "Monitoring Payroll", path: "/admin/payroll/monitoring" },
  { title: "Pengaturan Payroll", path: "/admin/payroll/settings" },
];

export default function AdminPayrollIntegrations() {
  return (
    <AdminPayrollPageScaffold
      title="Integrasi Payroll (Superadmin)"
      subtitle="Kontrol integrasi payroll tingkat platform"
      description="Halaman ini disiapkan untuk kontrol kebijakan integrasi payroll lintas tenant (webhook, connector, dan fallback)."
      links={links}
    />
  );
}
