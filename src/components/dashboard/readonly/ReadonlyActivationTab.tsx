import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeActivationPage } from "@/components/employee/EmployeeActivationPage";

interface ReadonlyActivationTabProps {
  panelClass: string;
  tenantId: string;
}

export function ReadonlyActivationTab({ panelClass, tenantId }: ReadonlyActivationTabProps) {
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Aktivasi</CardTitle>
        <CardDescription>Status aktivasi akun individual</CardDescription>
      </CardHeader>
      <CardContent>
        <EmployeeActivationPage tenantId={tenantId} />
      </CardContent>
    </Card>
  );
}
