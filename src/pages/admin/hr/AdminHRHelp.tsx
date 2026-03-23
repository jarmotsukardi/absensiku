import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { HelpCircle, LifeBuoy, RefreshCcw, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

const HELPDESK_LINKS = [
  {
    title: "Tiket HR",
      description: "Pantau dan tindak lanjuti tiket operasional HR lintas tenant.",
    path: "/admin/hr/help/tickets",
    icon: Ticket,
  },
  {
    title: "FAQ HR",
    description: "Rangkuman pertanyaan umum dan jawaban standar untuk tim dukungan HR.",
    path: "/admin/hr/help/faq",
    icon: HelpCircle,
  },
  {
    title: "Bantuan HR",
    description: "Panduan troubleshooting, eskalasi, dan SOP insiden HR.",
    path: "/admin/hr/help/support",
    icon: LifeBuoy,
  },
] as const;

type TenantOption = {
  id: string;
  name: string;
  code: string;
};

export default function AdminHRHelp() {
  const [isLoading, setIsLoading] = useState(true);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [tenantSearch, setTenantSearch] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [stats, setStats] = useState({
    open: 0,
    inProgress: 0,
    resolved: 0,
    events24h: 0,
  });

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("id, name, code")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(500);
        if (error) throw error;
        setTenantOptions((data || []) as TenantOption[]);
      } catch (error) {
        const ref = reportError(error, "admin.hr.help.tenants");
      toast.error(appendErrorReference("Gagal memuat daftar tenant bantuan HR", ref));
      }
    };
    void loadTenants();
  }, []);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const buildTicketCountQuery = (status: "open" | "in_progress" | "resolved") => {
        let query = supabase
          .from("feedback_reports")
          .select("id", { count: "exact", head: true })
          .eq("feedback_type", "ticket")
          .eq("reporter_role", "admin_organisasi")
          .eq("status", status);
        if (tenantFilter !== "all") {
          query = query.eq("tenant_id", tenantFilter);
        }
        return query;
      };

      let eventsQuery = supabase
        .from("hr_ticket_status_audits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayAgoIso);
      if (tenantFilter !== "all") {
        eventsQuery = eventsQuery.eq("tenant_id", tenantFilter);
      }

      const [openRes, inProgressRes, resolvedRes, eventsRes] = await Promise.all([
        buildTicketCountQuery("open"),
        buildTicketCountQuery("in_progress"),
        buildTicketCountQuery("resolved"),
        eventsQuery,
      ]);

      const error = openRes.error || inProgressRes.error || resolvedRes.error || eventsRes.error;
      if (error) throw error;

      setStats({
        open: openRes.count ?? 0,
        inProgress: inProgressRes.count ?? 0,
        resolved: resolvedRes.count ?? 0,
        events24h: eventsRes.count ?? 0,
      });
      setLastUpdatedAt(new Date());
    } catch (error) {
      const ref = reportError(error, "admin.hr.help.stats");
      toast.error(appendErrorReference("Gagal memuat statistik bantuan HR", ref));
    } finally {
      setIsLoading(false);
    }
  }, [tenantFilter]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const metricCards = useMemo(
    () => [
      { title: "Terbuka", value: stats.open, description: "Tiket menunggu triase." },
      { title: "Sedang Diproses", value: stats.inProgress, description: "Tiket sedang diproses." },
      { title: "Selesai", value: stats.resolved, description: "Tiket sudah selesai." },
      { title: "Event 24 Jam", value: stats.events24h, description: "Perubahan status dalam 24 jam." },
    ],
    [stats],
  );

  const filteredTenantOptions = useMemo(() => {
    const keyword = tenantSearch.trim().toLowerCase();
    if (!keyword) return tenantOptions;
    return tenantOptions.filter((tenant) =>
      `${tenant.name} ${tenant.code}`.toLowerCase().includes(keyword),
    );
  }, [tenantOptions, tenantSearch]);

  return (
    <AdminHRPageShell
      title="Pusat Bantuan HR"
      subtitle="Pusat bantuan dan eskalasi HR lintas tenant"
      description="Halaman ringkasan untuk navigasi cepat ke tiket, FAQ operasional, dan panduan dukungan HR."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Statistik bantuan lintas tenant dibaca manual agar triase tetap stabil saat acuan bawaan HR terus disempurnakan.
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memuat data..." : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input
              value={tenantSearch}
              onChange={(event) => setTenantSearch(event.target.value)}
              placeholder="Cari tenant..."
              className="w-full sm:w-[220px]"
            />
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Filter tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tenant</SelectItem>
                {filteredTenantOptions.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadStats()} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Muat Ulang
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {metricCards.map((item) => (
            <Card key={item.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{isLoading ? "..." : item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
        {HELPDESK_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.path}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4" />
                  {item.title}
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link to={item.path}>Buka {item.title}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        </div>
      </div>
    </AdminHRPageShell>
  );
}
