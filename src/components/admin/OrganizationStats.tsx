import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
import { 
  Building2, 
  Users, 
  Landmark, 
  GraduationCap, 
  Briefcase, 
  Building,
  TrendingUp,
  CheckCircle2
} from "lucide-react";
const ORG_STATS_READ_TIMEOUT_MS = 12000;
const ORG_STATS_MAX_RETRIES = 2;

interface Stats {
  total: number;
  pemerintah_daerah: number;
  instansi_pemerintah: number;
  perusahaan: number;
  sekolah: number;
  totalEmployees: number;
  activeSubscriptions: number;
}

export function OrganizationStats() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pemerintah_daerah: 0,
    instansi_pemerintah: 0,
    perusahaan: 0,
    sekolah: 0,
    totalEmployees: 0,
    activeSubscriptions: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      // Get all tenants
      const { data: tenants } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .select("id, organization_type, is_active"),
            ORG_STATS_READ_TIMEOUT_MS,
            "Permintaan statistik tenant timeout."
          ),
        {
          maxRetries: ORG_STATS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      // Get all employees count
      const { count: employeesCount } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("*", { count: "exact", head: true }),
            ORG_STATS_READ_TIMEOUT_MS,
            "Permintaan total pegawai timeout."
          ),
        {
          maxRetries: ORG_STATS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      // Get active subscriptions
      const { count: activeSubsCount } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("subscriptions")
              .select("*", { count: "exact", head: true })
              .eq("status", "active"),
            ORG_STATS_READ_TIMEOUT_MS,
            "Permintaan total langganan aktif timeout."
          ),
        {
          maxRetries: ORG_STATS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (tenants) {
        setStats({
          total: tenants.length,
          pemerintah_daerah: tenants.filter(t => t.organization_type === "pemerintah_daerah").length,
          instansi_pemerintah: tenants.filter(t => t.organization_type === "instansi_pemerintah").length,
          perusahaan: tenants.filter(t => t.organization_type === "perusahaan").length,
          sekolah: tenants.filter(t => t.organization_type === "sekolah").length,
          totalEmployees: employeesCount || 0,
          activeSubscriptions: activeSubsCount || 0,
        });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.components.organization_stats.fetch");
      const message = appendErrorReference("Gagal memuat statistik organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  };

  const statCards = [
    { 
      label: "Total Organisasi", 
      value: stats.total, 
      icon: Building2, 
      color: "bg-primary/10 text-primary" 
    },
    { 
      label: "Pemerintah Daerah", 
      value: stats.pemerintah_daerah, 
      icon: Landmark, 
      color: "bg-blue-500/10 text-blue-500" 
    },
    { 
      label: "Instansi Pemerintah", 
      value: stats.instansi_pemerintah, 
      icon: Building, 
      color: "bg-purple-500/10 text-purple-500" 
    },
    { 
      label: "Perusahaan", 
      value: stats.perusahaan, 
      icon: Briefcase, 
      color: "bg-green-500/10 text-green-500" 
    },
    { 
      label: "Sekolah", 
      value: stats.sekolah, 
      icon: GraduationCap, 
      color: "bg-orange-500/10 text-orange-500" 
    },
    { 
      label: "Total Pegawai", 
      value: stats.totalEmployees, 
      icon: Users, 
      color: "bg-cyan-500/10 text-cyan-500" 
    },
    { 
      label: "Langganan Aktif", 
      value: stats.activeSubscriptions, 
      icon: CheckCircle2, 
      color: "bg-emerald-500/10 text-emerald-500" 
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-10 w-10 rounded-lg bg-muted mb-3"></div>
              <div className="h-6 w-16 bg-muted rounded mb-1"></div>
              <div className="h-4 w-24 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isRetrying && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Sedang mencoba ulang memuat statistik organisasi...
        </div>
      )}
      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className={`h-10 w-10 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
      </div>
    </div>
  );
}
