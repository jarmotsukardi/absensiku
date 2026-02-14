import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { DashboardWidgets } from "@/components/admin/superadmin/DashboardWidgets";
import { RecentOrganizations } from "@/components/admin/superadmin/RecentOrganizations";
import { RecentActivity } from "@/components/admin/superadmin/RecentActivity";

export default function AdminDashboard() {
  return (
    <SuperAdminLayout 
      title="Dashboard" 
      subtitle="Selamat datang di panel Super Admin AbsensiKu"
    >
      <div className="space-y-6">
        {/* Stats Widgets */}
        <DashboardWidgets />

        {/* Recent Data Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentOrganizations />
          <RecentActivity />
        </div>
      </div>
    </SuperAdminLayout>
  );
}