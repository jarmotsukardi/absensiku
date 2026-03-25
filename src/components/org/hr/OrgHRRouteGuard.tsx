import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getHrRoutePolicy, resolveHrRouteAccess } from "@/lib/hrRouteAccess";
import { getAccessStageLabel } from "@/lib/hrPayrollAccessPolicy";
import { reportError } from "@/lib/errorLogger";

type OrgHRRouteGuardProps = {
  routePath: string;
  children: ReactNode;
};

export function OrgHRRouteGuard({ routePath, children }: OrgHRRouteGuardProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [stageLabel, setStageLabel] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const access = await resolveHrRouteAccess(routePath);
        if (!mounted) return;
        setAllowed(access.allowed);
        setReason(access.reason);
        setRef(access.ref);
        setRedirectTo(access.redirectTo);
        setStageLabel(access.stage ? getAccessStageLabel(access.stage) : null);
      } catch (error) {
        const errorRef = reportError(error, "hr.route_guard.effect", { route_path: routePath });
        if (!mounted) return;
        setAllowed(false);
        setReason("Terjadi error saat validasi akses HR.");
        setRef(errorRef || null);
        setRedirectTo("/org");
        setStageLabel(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [routePath]);

  useEffect(() => {
    if (isLoading || !redirectTo) return;
    navigate(redirectTo, { replace: true });
  }, [isLoading, navigate, redirectTo]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Memverifikasi akses HR...</p>
      </div>
    );
  }

  if (!allowed) {
    const policy = getHrRoutePolicy(routePath);
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <Badge variant="outline" className="w-fit">HR Access Guard</Badge>
            <CardTitle>Akses HR Ditolak</CardTitle>
            <CardDescription>Halaman ini tidak tersedia untuk role Anda pada workspace HR.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">{reason || "Izin HR tidak memenuhi syarat halaman ini."}</p>
            <div className="rounded border p-3 text-xs text-muted-foreground">
              <div>route: {routePath}</div>
              <div>minimum_role: {policy.minimumRole}</div>
              <div>status: {policy.status}</div>
              <div>stage: {stageLabel || "-"}</div>
              <div>ref: {ref || "HR-UNKNOWN"}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/org", { replace: true })}>Kembali ke Absensi</Button>
              <Button onClick={() => navigate("/org/billing", { replace: true })}>Buka Billing</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
