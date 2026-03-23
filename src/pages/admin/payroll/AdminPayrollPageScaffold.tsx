import { useNavigate } from "react-router-dom";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PayrollAdminLink = {
  title: string;
  path: string;
};

type PayrollPageScaffoldProps = {
  title: string;
  subtitle: string;
  description: string;
  links?: PayrollAdminLink[];
};

export function AdminPayrollPageScaffold({
  title,
  subtitle,
  description,
  links = [],
}: PayrollPageScaffoldProps) {
  const navigate = useNavigate();

  return (
    <SuperAdminLayout title={title} subtitle={subtitle} workspaceMode="payroll">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Superadmin Payroll</Badge>
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {links.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {links.map((link) => (
                  <Button
                    key={link.path}
                    variant="outline"
                    className="justify-start"
                    onClick={() => navigate(link.path)}
                  >
                    {link.title}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
