import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { EmployeeActivationPage } from "@/components/employee/EmployeeActivationPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AttendanceAccessRestrictionMessage } from "@/components/employee/AttendanceAccessRestrictionMessage";
import { useAttendanceResourceRestriction } from "@/hooks/useAttendanceResourceRestriction";

interface EmployeeScopeRow {
  id: string;
  tenant_id: string;
  tenants?: {
    name?: string | null;
    billing_mode?: string | null;
  } | null;
}

interface EmployeeScopeOption {
  employeeId: string;
  tenantId: string;
  tenantName: string;
  billingMode: string;
}

export default function EmployeeBilling() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scopes, setScopes] = useState<EmployeeScopeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const selectedScope = useMemo(
    () => scopes.find((item) => item.employeeId === selectedEmployeeId) || null,
    [scopes, selectedEmployeeId],
  );
  const attendanceResourceRestriction = useAttendanceResourceRestriction({
    tenantId: selectedScope?.tenantId || null,
  });

  const fetchScopes = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, tenant_id, tenants:tenant_id(name, billing_mode)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const mapped = ((data || []) as EmployeeScopeRow[]).map((row) => ({
        employeeId: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenants?.name || "Organisasi",
        billingMode: row.tenants?.billing_mode || "centralized",
      }));

      setScopes(mapped);
      setSelectedEmployeeId((prev) => {
        if (prev && mapped.some((item) => item.employeeId === prev)) return prev;
        return mapped[0]?.employeeId || "";
      });
    } catch (error) {
      const errorRef = reportError(error, "employee.billing.fetch_scopes");
      toast.error(appendErrorReference("Gagal memuat konteks billing pegawai.", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        navigate("/employee/login", { replace: true });
        return;
      }
      setSession(data.session);
      await fetchScopes(data.session.user.id);
    };

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        navigate("/employee/login", { replace: true });
        return;
      }
      setSession(nextSession);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchScopes, navigate]);

  if (isLoading || (selectedScope?.tenantId && attendanceResourceRestriction.isLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (attendanceResourceRestriction.isRestrictedNow) {
    return (
      <AttendanceAccessRestrictionMessage
        reason={attendanceResourceRestriction.restrictionReason}
        scheduleLabel={attendanceResourceRestriction.scheduleLabel}
        reopensAtLabel={attendanceResourceRestriction.reopensAtLabel}
        onBack={() => navigate("/employee/dashboard", { replace: true })}
      />
    );
  }

  if (scopes.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Card className="mx-auto mt-8 max-w-2xl">
          <CardHeader>
            <CardTitle>Billing Pegawai</CardTitle>
            <CardDescription>Data pegawai aktif tidak ditemukan pada akun ini.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/employee/dashboard", { replace: true })}>Kembali ke Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/employee/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-base font-semibold">Billing Pegawai</h1>
              <p className="text-xs text-muted-foreground">Kelola invoice dan pembayaran akun individual Anda.</p>
            </div>
          </div>
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-4 p-4">
        {scopes.length > 1 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pilih Organisasi</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih organisasi" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((scope) => (
                    <SelectItem key={scope.employeeId} value={scope.employeeId}>
                      {scope.tenantName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ) : null}

        {selectedScope && selectedScope.billingMode !== "individual" ? (
          <Card>
            <CardHeader>
              <CardTitle>Billing Terpusat</CardTitle>
              <CardDescription>
                Organisasi <strong>{selectedScope.tenantName}</strong> menggunakan billing terpusat. Pembayaran dikelola
                admin organisasi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/employee/dashboard", { replace: true })}>
                Buka Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {selectedScope && selectedScope.billingMode === "individual" ? (
          <EmployeeActivationPage tenantId={selectedScope.tenantId} employeeId={selectedScope.employeeId} />
        ) : null}
      </main>
    </div>
  );
}
