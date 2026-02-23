import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeActivationPage } from "@/components/employee/EmployeeActivationPage";

interface ReadonlyActivationTabProps {
  panelClass: string;
  tenantId: string;
  employeeId: string;
}

export function ReadonlyActivationTab({ panelClass, tenantId, employeeId }: ReadonlyActivationTabProps) {
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Aktivasi</CardTitle>
        <CardDescription>Status aktivasi akun individual</CardDescription>
      </CardHeader>
      <CardContent>
        <EmployeeActivationPage tenantId={tenantId} employeeId={employeeId} />
      </CardContent>
    </Card>
  );
}
