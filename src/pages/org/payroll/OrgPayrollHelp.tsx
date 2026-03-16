import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HELP_ITEMS = [
  {
    title: "Panduan Kerja Payroll",
    desc: "Acuan keputusan, struktur menu, dan roadmap pengembangan payroll.",
    actionLabel: "Buka Beranda Payroll",
    path: "/org/payroll",
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Info</Badge>
            <Badge variant="outline">Bantuan Payroll</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Bantuan Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Titik bantuan cepat untuk memahami alur payroll dan membuka halaman rujukan yang relevan.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Fungsi halaman</CardDescription>
              <CardTitle className="text-base">Bantuan singkat, bukan pusat proses</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Gunakan halaman ini saat butuh arahan cepat ke menu payroll, audit, atau log error tanpa mengubah data inti.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Fokus penggunaan</CardDescription>
              <CardTitle className="text-base">Arahkan ke halaman yang tepat</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Halaman bantuan sebaiknya tetap ringkas. Penjelasan mendalam dan glosarium akan ditambahkan saat payroll mendekati tahap final.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Langkah terkait</CardDescription>
              <CardTitle className="text-base">Mulai lagi dari alur inti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Jika tidak sedang mencari rujukan teknis, kembali ke beranda payroll dan lanjutkan proses inti yang sedang dikerjakan.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll")}>
                Buka Beranda Payroll
              </Button>
            </CardContent>
          </Card>
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
          <Button onClick={() => navigate("/org/payroll")}>Beranda Payroll</Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/integrations")}>
            Integrasi Payroll
          </Button>
        </div>

        <OrgPayrollPageGuide pathname="/org/payroll/help" />
      </div>
    </OrganizationLayout>
  );
}
