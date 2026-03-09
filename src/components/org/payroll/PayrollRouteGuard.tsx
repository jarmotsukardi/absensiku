import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { resolvePayrollRouteAccess, type PayrollPermission } from "@/lib/payrollAccess";
import { reportError } from "@/lib/errorLogger";

type PayrollRouteGuardProps = {
  permission: PayrollPermission;
  children: React.ReactNode;
};

export function PayrollRouteGuard({ permission, children }: PayrollRouteGuardProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const access = await resolvePayrollRouteAccess(permission);
        if (!mounted) return;
        setAllowed(access.allowed);
        setReason(access.reason);
        setRef(access.ref);
        setRedirectTo(access.redirectTo);
      } catch (error) {
        const errorRef = reportError(error, "payroll.route_guard.effect", { permission });
        if (!mounted) return;
        setAllowed(false);
        setReason("Terjadi error saat validasi akses payroll.");
        setRef(errorRef || null);
        setRedirectTo("/org");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [permission]);

  useEffect(() => {
    if (isLoading || allowed || !redirectTo) return;
    navigate(redirectTo, { replace: true });
  }, [allowed, isLoading, navigate, redirectTo]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Memverifikasi akses payroll...</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <Badge variant="outline" className="w-fit">Payroll Access Guard</Badge>
            <CardTitle>Akses Payroll Ditolak</CardTitle>
            <CardDescription>
              Anda tidak memiliki izin untuk membuka menu ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">{reason || "Izin payroll tidak memenuhi syarat menu."}</p>
            <div className="rounded border p-3 text-xs text-muted-foreground">
              <div>required_permission: {permission}</div>
              <div>ref: {ref || "PAY-UNKNOWN"}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/org/payroll")}>Kembali ke Workspace Payroll</Button>
              <Button onClick={() => navigate("/org/payroll/roles")}>Buka Role Payroll</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
