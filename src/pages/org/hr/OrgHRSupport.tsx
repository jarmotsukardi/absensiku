import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrgHRSupport() {
  const navigate = useNavigate();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">HR Help</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Bantuan HR</h1>
          <p className="text-sm text-muted-foreground">
            Kanal bantuan internal untuk kendala operasional HR.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pusat Bantuan HR</CardTitle>
            <CardDescription>
              Gunakan tiket bantuan untuk isu data pegawai, kontrak, struktur, dan laporan HR.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Jika isu berdampak pada integrasi eksternal, sertakan detail kronologi dan referensi error agar triase lebih cepat.
            </p>
            <Button onClick={() => navigate("/org/hr/help/tickets")}>Buka Tiket HR</Button>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
