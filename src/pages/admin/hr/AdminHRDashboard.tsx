import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Building2, FileText, LifeBuoy, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

interface HRDashboardKpi {
  activeTenants: number;
  employees: number;
  contracts: number;
  contractsEndingSoon: number;
  hrErrors24h: number;
  hrCriticalErrors24h: number;
  ticketEvents24h: number;
}

const initialKpi: HRDashboardKpi = {
  activeTenants: 0,
  employees: 0,
  contracts: 0,
  contractsEndingSoon: 0,
  hrErrors24h: 0,
  hrCriticalErrors24h: 0,
  ticketEvents24h: 0,
};

const formatNumber = (value: number) => new Intl.NumberFormat("id-ID").format(value);

export default function AdminHRDashboard() {
  const [kpi, setKpi] = useState<HRDashboardKpi>(initialKpi);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setIsLoading(true);
      const now = new Date();
      const dayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const todayDate = now.toISOString().slice(0, 10);
      const thirtyDaysAheadDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const [
        activeTenantsResult,
        employeesResult,
        contractsResult,
        contractsEndingSoonResult,
        hrErrors24hResult,
        hrCriticalErrors24hResult,
        ticketEvents24hResult,
      ] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("employees").select("id", { count: "exact", head: true }),
        supabase.from("hr_contracts").select("id", { count: "exact", head: true }),
        supabase
          .from("hr_contracts")
          .select("id", { count: "exact", head: true })
          .gte("end_date", todayDate)
          .lte("end_date", thirtyDaysAheadDate),
        supabase
          .from("client_error_logs")
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", dayAgoIso)
          .ilike("context", "org.hr.%"),
        supabase
          .from("client_error_logs")
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", dayAgoIso)
          .ilike("context", "org.hr.%")
          .eq("is_non_critical", false)
          .eq("is_resolved", false)
          .eq("is_archived", false),
        supabase
          .from("hr_ticket_status_audits")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayAgoIso),
      ]);

      const queryError =
        activeTenantsResult.error ||
        employeesResult.error ||
        contractsResult.error ||
        contractsEndingSoonResult.error ||
        hrErrors24hResult.error ||
        hrCriticalErrors24hResult.error ||
        ticketEvents24hResult.error;

      if (queryError) {
        const errorRef = reportError(queryError, "admin.hr.dashboard.kpi_fetch");
        toast.error(appendErrorReference("Gagal memuat ringkasan dashboard HR", errorRef));
      }

      if (!isMounted) return;

      setKpi({
        activeTenants: activeTenantsResult.count ?? 0,
        employees: employeesResult.count ?? 0,
        contracts: contractsResult.count ?? 0,
        contractsEndingSoon: contractsEndingSoonResult.count ?? 0,
        hrErrors24h: hrErrors24hResult.count ?? 0,
        hrCriticalErrors24h: hrCriticalErrors24hResult.count ?? 0,
        ticketEvents24h: ticketEvents24hResult.count ?? 0,
      });
      setLastUpdatedAt(new Date());
      setIsLoading(false);
    };

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const summaryWidgets = useMemo(
    () => [
      {
        title: "Tenant HR Aktif",
        value: formatNumber(kpi.activeTenants),
        note: "Tenant aktif yang saat ini menggunakan modul /org/hr",
        icon: Building2,
        status: kpi.activeTenants > 0 ? "Stabil" : "Belum ada tenant",
      },
      {
        title: "Pegawai Tercatat",
        value: formatNumber(kpi.employees),
        note: "Total data pegawai lintas tenant yang tersinkron",
        icon: Users,
        status: `${formatNumber(kpi.ticketEvents24h)} event tiket / 24 jam`,
      },
      {
        title: "Dokumen Kontrak",
        value: formatNumber(kpi.contracts),
        note: "Total kontrak pada modul HR lintas tenant",
        icon: FileText,
        status: `${formatNumber(kpi.contractsEndingSoon)} berakhir <= 30 hari`,
      },
      {
        title: "Error HR (24 Jam)",
        value: formatNumber(kpi.hrErrors24h),
        note: "Error konteks HR dari central log dalam 24 jam terakhir",
        icon: AlertTriangle,
        status: `${formatNumber(kpi.hrCriticalErrors24h)} kritis belum selesai`,
      },
    ],
    [kpi],
  );

  const quickActions = [
    { label: "Mapping Pengaturan /org/hr", path: "/admin/hr/settings#coverage-map" },
    { label: "Kelola Tenant HR", path: "/admin/hr/tenants" },
    { label: "Review Kebijakan HR", path: "/admin/hr/policies" },
    { label: "Buka Tiket HR", path: "/admin/hr/help/tickets" },
    { label: "Audit Aktivitas HR", path: "/admin/hr/audit" },
    { label: "Pantau Log Error HR", path: "/admin/hr/error-logs" },
    { label: "Pengaturan HR", path: "/admin/hr/settings" },
  ] as const;

  return (
    <SuperAdminLayout
      title="Dashboard HR Superadmin"
      subtitle="Ringkasan platform modul /org/hr lintas tenant"
      workspaceMode="hr"
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryWidgets.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardDescription>{item.title}</CardDescription>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-2xl">{item.value}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                  <Badge variant="secondary">{item.status}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Ringkasan Prioritas /org/hr</CardTitle>
              <CardDescription>
                Fokus monitoring lintas tenant untuk employee data, struktur organisasi, kontrak,
                dokumen, dan helpdesk HR.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Perlu perhatian: {formatNumber(kpi.contractsEndingSoon)} kontrak berakhir dalam 30 hari.
              </p>
              <p>
                Aktivitas audit tiket HR 24 jam: {formatNumber(kpi.ticketEvents24h)} perubahan status tercatat.
              </p>
              <p>
                Error HR kritis terbuka: {formatNumber(kpi.hrCriticalErrors24h)} item perlu follow up.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aksi Cepat HR</CardTitle>
              <CardDescription>Navigasi cepat ke halaman operasional utama.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {quickActions.map((item) => (
                <Button key={item.path} asChild variant="outline" className="w-full justify-start">
                  <Link to={item.path}>{item.label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                Kepatuhan Data HR
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Validasi baseline kebijakan perlu difokuskan pada {formatNumber(kpi.activeTenants)} tenant aktif.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4" />
                Dukungan & Eskalasi
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {formatNumber(kpi.ticketEvents24h)} event tiket tercatat dalam 24 jam untuk monitoring eskalasi.
            </CardContent>
          </Card>
        </section>
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Memuat KPI real-time HR..."
            : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
        </p>
      </div>
    </SuperAdminLayout>
  );
}
