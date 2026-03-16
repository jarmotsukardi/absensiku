import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SETTING_SHORTCUTS = [
  {
    title: "Role & Permission Payroll",
    desc: "Kelola akses pengguna payroll tanpa keluar dari workspace payroll.",
    path: "/org/payroll/roles",
  },
  {
    title: "Integrasi Payroll",
    desc: "Atur webhook, koneksi absensi, payout, dan accounting.",
    path: "/org/payroll/integrations",
  },
  {
    title: "Log Error Payroll",
    desc: "Monitoring error kritis dan pengaturan alert realtime.",
    path: "/org/payroll/error-log",
  },
];

export default function OrgPayrollSettings() {
  const navigate = useNavigate();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Pengaturan Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Pusat pengaturan payroll terisolasi dari menu absensi.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Shortcut Pengaturan</CardTitle>
            <CardDescription>
              Semua kebutuhan konfigurasi payroll tersedia langsung di workspace payroll.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {SETTING_SHORTCUTS.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => navigate(item.path)}
                className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40"
              >
                <p className="mb-1 text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={() => navigate("/org/payroll")}>Beranda Payroll</Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/help")}>
            Bantuan Payroll
          </Button>
        </div>

        <OrgPayrollPageGuide pathname="/org/payroll/settings" />
      </div>
    </OrganizationLayout>
  );
}
