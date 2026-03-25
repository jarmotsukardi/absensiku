import { useLocation, useNavigate } from "react-router-dom";
import { buildOrgPayrollOverlayHref } from "@/lib/orgPayrollOverlay";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYROLL_COMPLIANCE_RULES } from "@/lib/payrollComplianceRules";

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
];

export default function OrgPayrollHelp() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateWithOverlay = (target: string) =>
    navigate(buildOrgPayrollOverlayHref(location.pathname, location.search, target));

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
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
              Gunakan halaman ini saat butuh arahan cepat ke menu payroll atau audit tanpa mengubah data inti.
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
              <Button variant="outline" size="sm" onClick={() => navigateWithOverlay("/org/payroll")}>
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
                <Button variant="outline" className="w-full" onClick={() => navigateWithOverlay(item.path)}>
                  {item.actionLabel}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardDescription>Aturan kepatuhan</CardDescription>
            <CardTitle className="text-base">Kepatuhan Payroll Swasta Umum</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Profil default payroll swasta umum menyalakan semua aturan wajib. Jika organisasi memilih pengecualian,
              status payroll akan ditandai non-compliant dan harus dijelaskan alasannya di kebijakan payroll.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {PAYROLL_COMPLIANCE_RULES.map((rule) => (
                <div key={rule.id} className="rounded-md border bg-background/80 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{rule.label}</p>
                    <Badge variant="outline">{rule.category}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{rule.detail}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">Dasar: {rule.legalBasis}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={() => navigateWithOverlay("/org/payroll")}>Beranda Payroll</Button>
          <Button variant="outline" onClick={() => navigateWithOverlay("/org/payroll/integrations")}>
            Integrasi Payroll
          </Button>
        </div>

        <OrgPayrollPageGuide pathname="/org/payroll/help" />
      </div>
    </OrganizationLayout>
  );
}
