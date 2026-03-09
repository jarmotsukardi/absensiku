import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
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
};

const STATUS_FLOW = ["draft", "review", "approved", "paid", "archived"] as const;

export function PayrollScaffoldPage({
  title,
  description,
  phase,
  routeKey,
  nextPath,
  backPath,
}: PayrollScaffoldPageProps) {
  const navigate = useNavigate();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Payroll</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Phase</CardDescription>
              <CardTitle className="text-2xl">{phase}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Prioritas delivery sesuai blueprint HR-Payroll.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Route Key</CardDescription>
              <CardTitle className="text-lg">{routeKey}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Identitas menu untuk sinkronisasi route/sidebar/FAQ.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Status Flow</CardDescription>
              <CardTitle className="text-lg">Deterministik</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {STATUS_FLOW.map((status) => (
                <Badge key={status} variant="secondary" className="text-[10px]">
                  {status}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Langkah Lanjut</CardTitle>
            <CardDescription>
              Halaman ini sudah aktif dalam workspace payroll dan siap dilanjutkan ke implementasi logic CRUD/engine sesuai fase.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate(backPath || "/org/payroll") }>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
            <Button onClick={() => navigate("/org/payroll")}>Payroll Home</Button>
            {nextPath ? (
              <Button variant="secondary" onClick={() => navigate(nextPath)}>
                Menu Berikutnya
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
