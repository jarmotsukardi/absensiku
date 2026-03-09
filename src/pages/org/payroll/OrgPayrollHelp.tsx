import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HELP_ITEMS = [
  {
    title: "FAQ Payroll",
    desc: "Panduan dasar menu payroll dan alur operasional.",
    actionLabel: "Buka Pengaturan Payroll",
    path: "/org/payroll/settings",
  },
  {
    title: "Audit Log Payroll",
    desc: "Lacak aktivitas payroll berdasarkan trace/log id.",
    actionLabel: "Buka Audit Log",
    path: "/org/payroll/audit-log",
  },
  {
    title: "Log Error Payroll",
    desc: "Monitoring error dan alert realtime kritis.",
    actionLabel: "Buka Log Error",
    path: "/org/payroll/error-log",
  },
];

export default function OrgPayrollHelp() {
  const navigate = useNavigate();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Payroll</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Bantuan Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Halaman bantuan payroll tanpa perlu berpindah ke menu absensi.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {HELP_ITEMS.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={() => navigate(item.path)}>
                  {item.actionLabel}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={() => navigate("/org/payroll")}>Payroll Home</Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/integrations")}>
            Integrasi Payroll
          </Button>
        </div>
      </div>
    </OrganizationLayout>
  );
}
