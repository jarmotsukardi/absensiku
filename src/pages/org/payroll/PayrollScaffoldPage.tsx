import { useLocation, useNavigate } from "react-router-dom";
import { buildOrgPayrollOverlayHref } from "@/lib/orgPayrollOverlay";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight } from "lucide-react";

type PayrollScaffoldPageProps = {
  title: string;
  description: string;
  phase: 1 | 2 | 3 | 4;
  routeKey: string;
  nextPath?: string;
  backPath?: string;
  badgeLabel?: string;
  phaseLabel?: string;
  routeKeyLabel?: string;
  flowTitle?: string;
  flowStatuses?: string[];
  guidanceTitle?: string;
  guidanceDescription?: string;
  referenceTitle?: string;
  referenceDescription?: string;
  referenceLinks?: Array<{ label: string; path: string }>;
  homeLabel?: string;
  nextLabel?: string;
  guidePath?: string;
};

const DEFAULT_STATUS_FLOW = ["Draf", "Tinjau", "Disetujui", "Dibayar", "Arsip"];

export function PayrollScaffoldPage({
  title,
  description,
  phase,
  routeKey,
  nextPath,
  backPath,
  badgeLabel = "Payroll",
  phaseLabel = "Tahap",
  routeKeyLabel = "Kunci Rute",
  flowTitle = "Alur Status",
  flowStatuses = DEFAULT_STATUS_FLOW,
  guidanceTitle = "Langkah Lanjut",
  guidanceDescription = "Halaman ini sudah aktif dalam workspace payroll dan siap dilanjutkan sesuai tahap pengembangan yang sudah ditetapkan.",
  referenceTitle = "Referensi Data",
  referenceDescription = "Buka data sumber HR/absensi tanpa keluar dari konteks payroll. Jika akses terbatas, minta admin HR.",
  referenceLinks,
  homeLabel = "Beranda Payroll",
  nextLabel = "Menu Berikutnya",
  guidePath,
}: PayrollScaffoldPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateWithOverlay = (target: string) =>
    navigate(buildOrgPayrollOverlayHref(location.pathname, location.search, target));
  const hasReferences = Boolean(referenceLinks?.length);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">{badgeLabel}</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className={`grid gap-4 ${hasReferences ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{phaseLabel}</CardDescription>
              <CardTitle className="text-2xl">{phase}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Prioritas delivery mengikuti roadmap payroll sederhana yang sudah disepakati.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{routeKeyLabel}</CardDescription>
              <CardTitle className="text-lg">{routeKey}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Identitas menu untuk sinkronisasi rute, sidebar, dan dokumentasi kerja.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{flowTitle}</CardDescription>
              <CardTitle className="text-lg">Terkelola</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {flowStatuses.map((status) => (
                <Badge key={status} variant="secondary" className="text-[10px]">
                  {status}
                </Badge>
              ))}
            </CardContent>
          </Card>
          {hasReferences ? (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{referenceTitle}</CardDescription>
                <CardTitle className="text-lg">Buka sumber data</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <p className="w-full text-xs text-muted-foreground">{referenceDescription}</p>
                {referenceLinks?.map((item) => (
                  <Button key={item.path} variant="outline" size="sm" onClick={() => navigateWithOverlay(item.path)}>
                    {item.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{guidanceTitle}</CardTitle>
            <CardDescription>{guidanceDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigateWithOverlay(backPath || "/org/payroll") }>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
            <Button onClick={() => navigateWithOverlay("/org/payroll")}>{homeLabel}</Button>
            {nextPath ? (
              <Button variant="secondary" onClick={() => navigateWithOverlay(nextPath)}>
                {nextLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {guidePath ? <OrgPayrollPageGuide pathname={guidePath} /> : null}
      </div>
    </OrganizationLayout>
  );
}
