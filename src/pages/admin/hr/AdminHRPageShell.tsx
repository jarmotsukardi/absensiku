import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AdminHRPageGuide } from "@/components/admin/hr/AdminHRPageGuide";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminHRPageShellProps {
  title: string;
  subtitle: string;
  description: string;
  children?: ReactNode;
}

export function AdminHRPageShell({
  title,
  subtitle,
  description,
  children,
}: AdminHRPageShellProps) {
  const location = useLocation();
  const isHelpdeskOrProfile =
    location.pathname.startsWith("/admin/hr/help/") || location.pathname === "/admin/hr/profile";

  return (
    <SuperAdminLayout title={title} subtitle={subtitle} workspaceMode="hr">
      <div className="space-y-6">
        {isHelpdeskOrProfile ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Navigasi halaman ini tersedia di sidebar: <strong>Bantuan Sistem</strong> atau <strong>Tenant HR</strong>.
          </div>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        <AdminHRPageGuide pathname={location.pathname} />
      </div>
    </SuperAdminLayout>
  );
}
