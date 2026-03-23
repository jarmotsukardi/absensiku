import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Users, Building2, ClipboardList, FileText, Clock, BellRing, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type DashboardKpi = {
  employees: number;
  contracts: number;
  openTickets: number;
  activeStructures: number;
};

type HrTicketSummaryRow = {
  browser_info: string | null;
  status: string | null;
};

const INITIAL_KPI: DashboardKpi = {
  employees: 0,
  contracts: 0,
  openTickets: 0,
  activeStructures: 0,
};

const isHrTicketSummary = (row: HrTicketSummaryRow) => {
  if (!row.browser_info) return true;
  try {
    const parsed = JSON.parse(row.browser_info) as { source?: string } | null;
    return parsed?.source !== "org_help_ticket";
  } catch {
    return true;
  }
};

export default function OrgHRHome() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpi, setKpi] = useState<DashboardKpi>(INITIAL_KPI);

  useEffect(() => {
    let mounted = true;
    const loadDashboard = async () => {
      setIsLoading(true);
      try {
        const tenantId = await resolveOrgTenantId();
        if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        const [employeesRes, contractsRes, ticketsRes, opdRes] = await Promise.all([
          supabase.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("hr_contracts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase
            .from("feedback_reports")
            .select("browser_info, status")
            .eq("tenant_id", tenantId)
            .eq("feedback_type", "ticket")
            .neq("status", "resolved"),
          supabase.from("opd").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        ]);

        const queryError = employeesRes.error || contractsRes.error || ticketsRes.error || opdRes.error;
        if (queryError) throw queryError;

        if (!mounted) return;
        setKpi({
          employees: employeesRes.count ?? 0,
          contracts: contractsRes.count ?? 0,
          openTickets: ((ticketsRes.data || []) as HrTicketSummaryRow[]).filter(isHrTicketSummary).length,
          activeStructures: opdRes.count ?? 0,
        });
      } catch (error) {
        const ref = reportError(error, "org.hr.home.kpi_fetch");
        toast.error(appendErrorReference("Gagal memuat ringkasan dashboard HR", ref));
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, []);

  const widgets = useMemo(
    () => [
      { title: "Pegawai", value: kpi.employees, note: "Data pegawai aktif/nonaktif.", icon: Users },
      { title: "Kontrak", value: kpi.contracts, note: "Kontrak kerja yang tercatat.", icon: FileText },
      { title: "Tiket HR Terbuka", value: kpi.openTickets, note: "Tiket HR yang belum selesai.", icon: ClipboardList },
      { title: "Unit Organisasi", value: kpi.activeStructures, note: "Jumlah struktur OPD/unit aktif.", icon: Building2 },
    ],
    [kpi],
  );

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Ringkasan HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Ringkasan HR</h1>
          <p className="text-sm text-muted-foreground">
            Ringkasan operasional HR organisasi untuk pemantauan pegawai, kontrak, laporan, dan tiket bantuan.
          </p>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {widgets.map((item) => (
            <Card key={item.title}>
              <CardHeader className="pb-2">
                <CardDescription>{item.title}</CardDescription>
                <CardTitle className="text-2xl">{isLoading ? "..." : item.value}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{item.note}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Operasional Hari Ini</CardTitle>
            <CardDescription>
              Fokus dashboard HR adalah insight operasional. Navigasi detail tersedia di sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Notifikasi Sistem</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {kpi.openTickets > 0
                  ? `${kpi.openTickets} tiket HR masih terbuka dan butuh tindak lanjut.`
                  : "Tidak ada tiket terbuka. Sistem HR dalam kondisi normal."}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Aktivitas Penting</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Pantau perubahan data pegawai, kontrak, dan struktur organisasi dari menu Audit/Log Aktivitas HR.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aksi Cepat HR</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <OrgHRContextLink to="/org/hr/employees">Buka Data Pegawai</OrgHRContextLink>
            </Button>
            <Button asChild variant="outline" size="sm">
              <OrgHRContextLink to="/org/hr/contracts">Buka Kontrak Kerja</OrgHRContextLink>
            </Button>
            <Button asChild variant="outline" size="sm">
              <OrgHRContextLink to="/org/hr/reports">Buka Laporan HR</OrgHRContextLink>
            </Button>
            <Button asChild variant="outline" size="sm">
              <OrgHRContextLink to="/org/hr/help/tickets">Buka Tiket HR</OrgHRContextLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
