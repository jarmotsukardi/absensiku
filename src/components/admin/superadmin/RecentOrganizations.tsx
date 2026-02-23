import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Building2, 
  ArrowRight,
  Landmark,
  Building,
  Briefcase,
  GraduationCap,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface Organization {
  id: string;
  name: string;
  code: string;
  organization_type: string;
  is_active: boolean;
  created_at: string;
  email: string | null;
}

const orgTypeIcons: Record<string, typeof Building2> = {
  pemerintah_daerah: Landmark,
  instansi_pemerintah: Building,
  perusahaan: Briefcase,
  sekolah: GraduationCap,
};

const orgTypeLabels: Record<string, string> = {
  pemerintah_daerah: "Pemda",
  instansi_pemerintah: "Instansi",
  perusahaan: "Perusahaan",
  sekolah: "Sekolah",
};
const RECENT_ORG_READ_TIMEOUT_MS = 12000;
const RECENT_ORG_MAX_RETRIES = 2;

export function RecentOrganizations() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(5),
            RECENT_ORG_READ_TIMEOUT_MS,
            "Permintaan organisasi terbaru timeout."
          ),
        {
          maxRetries: RECENT_ORG_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.dashboard.recent_organizations.fetch");
      const message = appendErrorReference("Gagal memuat organisasi terbaru", errorRef);
      setLoadError(message);
      toast.error(message);
      setOrganizations([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organisasi Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-muted"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-32"></div>
                  <div className="h-3 bg-muted rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Organisasi Terbaru</CardTitle>
          <CardDescription>Organisasi yang baru mendaftar</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/organizations/new")}>
          <Plus className="h-4 w-4 mr-1" />
          Tambah
        </Button>
      </CardHeader>
      <CardContent>
        {loadError && (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchOrganizations()}>
              Coba Lagi
            </Button>
          </div>
        )}
        {isRetrying && (
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            Sedang mencoba ulang memuat organisasi terbaru...
          </div>
        )}
        {organizations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Belum ada organisasi terdaftar</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{organizations.length} terbaru</Badge>
              <Badge variant="outline">
                {organizations.filter((org) => org.is_active).length} aktif
              </Badge>
            </div>
            {organizations.map((org) => {
              const Icon = orgTypeIcons[org.organization_type] || Building2;
              return (
                <div
                  key={org.id}
                  className="flex items-center gap-4 rounded-lg border bg-card p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/organizations/${org.id}`)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{org.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px]">
                        {orgTypeLabels[org.organization_type] || org.organization_type}
                      </Badge>
                      <span>{format(new Date(org.created_at), "d MMM yyyy", { locale: id })}</span>
                      {org.code ? (
                        <span className="font-mono text-[10px] text-muted-foreground/80">#{org.code}</span>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant={org.is_active ? "default" : "secondary"}>
                    {org.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
        
        <Button 
          variant="ghost" 
          className="w-full mt-4 text-muted-foreground" 
          onClick={() => navigate("/admin/organizations")}
        >
          Lihat Semua
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
