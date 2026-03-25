import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Building2, 
  Users, 
  MapPin, 
  CreditCard,
  FileText,
  Settings,
  Calendar,
  Mail,
  Phone,
  Globe
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { OrganizationEmployees } from "@/components/admin/organization/OrganizationEmployees";
import { OrganizationOffices } from "@/components/admin/organization/OrganizationOffices";
import { OrganizationSubscription } from "@/components/admin/organization/OrganizationSubscription";
import { OrganizationSettings } from "@/components/admin/organization/OrganizationSettings";
import { OrganizationAuditLog } from "@/components/admin/organization/OrganizationAuditLog";
import { AdminOrgOverlayDialog } from "@/components/admin/organization/AdminOrgOverlayDialog";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { useAdminOrgContextNavigate } from "@/hooks/useAdminOrgContextNavigate";
import { ADMIN_ORG_EMBED_PARAM } from "@/lib/adminOrgOverlay";

interface Organization {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  organization_type: string | null;
  description: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

const orgTypeLabels: Record<string, string> = {
  pemerintah_daerah: "Pemerintah Daerah",
  instansi_pemerintah: "Instansi Pemerintah",
  perusahaan: "Perusahaan",
  sekolah: "Sekolah",
};

export default function OrganizationDetail() {
  const ADMIN_ORG_DETAIL_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_ORG_DETAIL_QUERY_RETRY_MAX = 1;
  const navigate = useNavigate();
  const navigateWithOverlay = useAdminOrgContextNavigate();
  const [searchParams] = useSearchParams();
  const isEmbeddedFromAdminOrgOverlay = searchParams.get(ADMIN_ORG_EMBED_PARAM) === "1";
  const requestedTab = searchParams.get("tab");
  const { id: orgId } = useParams();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(() => {
    const validTabs = new Set(["overview", "employees", "offices", "subscription", "settings", "audit"]);
    return requestedTab && validTabs.has(requestedTab) ? requestedTab : "overview";
  });
  const [stats, setStats] = useState({
    employeesCount: 0,
    officesCount: 0,
    opdCount: 0,
  });

  const fetchOrganization = useCallback(async (id: string) => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .select("*")
              .eq("id", id)
              .single(),
            ADMIN_ORG_DETAIL_QUERY_TIMEOUT_MS,
            "admin.organization_detail.fetch_organization timeout",
          ),
        {
          maxRetries: ADMIN_ORG_DETAIL_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      setOrganization(data);
    } catch (error) {
      const errorRef = reportError(error, "admin.organization_detail.fetch_organization", { tenant_id: id });
      const message = appendErrorReference("Gagal memuat data organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
      navigate("/admin/organizations");
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (orgId) {
      fetchOrganization(orgId);
      fetchStats(orgId);
    }
  }, [orgId, fetchOrganization]);

  useEffect(() => {
    const validTabs = new Set(["overview", "employees", "offices", "subscription", "settings", "audit"]);
    if (requestedTab && validTabs.has(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const fetchStats = async (tenantId: string) => {
    try {
      setIsRetrying(false);
      const [employeesRes, officesRes, opdRes] = await Promise.all([
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("employees").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
              ADMIN_ORG_DETAIL_QUERY_TIMEOUT_MS,
              "admin.organization_detail.fetch_stats.employees timeout",
            ),
          {
            maxRetries: ADMIN_ORG_DETAIL_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("offices").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
              ADMIN_ORG_DETAIL_QUERY_TIMEOUT_MS,
              "admin.organization_detail.fetch_stats.offices timeout",
            ),
          {
            maxRetries: ADMIN_ORG_DETAIL_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("opd").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
              ADMIN_ORG_DETAIL_QUERY_TIMEOUT_MS,
              "admin.organization_detail.fetch_stats.opd timeout",
            ),
          {
            maxRetries: ADMIN_ORG_DETAIL_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (officesRes.error) throw officesRes.error;
      if (opdRes.error) throw opdRes.error;

      setStats({
        employeesCount: employeesRes.count || 0,
        officesCount: officesRes.count || 0,
        opdCount: opdRes.count || 0,
      });
    } catch (error) {
      const errorRef = reportError(error, "admin.organization_detail.fetch_stats", { tenant_id: tenantId });
      const message = appendErrorReference("Gagal memuat statistik organisasi", errorRef);
      setLoadError((prev) => prev ?? message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${isEmbeddedFromAdminOrgOverlay ? "flex min-h-[320px]" : "min-h-screen"} bg-background items-center justify-center`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!organization) return null;

  const tabs = [
    { id: "overview", label: "Ringkasan", icon: Building2 },
    { id: "employees", label: "Pegawai", icon: Users },
    { id: "offices", label: "Kantor", icon: MapPin },
    { id: "subscription", label: "Langganan", icon: CreditCard },
    { id: "settings", label: "Pengaturan", icon: Settings },
    { id: "audit", label: "Log Audit", icon: FileText },
  ];

  return (
    <div className={`${isEmbeddedFromAdminOrgOverlay ? "bg-background" : "min-h-screen bg-background"}`}>
      <header className="bg-card border-b border-border">
        <div className={`${isEmbeddedFromAdminOrgOverlay ? "px-4 py-4" : "container mx-auto px-4 py-4"}`}>
          <div className="flex items-center gap-4">
            {!isEmbeddedFromAdminOrgOverlay ? (
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin/organizations")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : null}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">{organization.name}</h1>
                <Badge variant={organization.is_active ? "default" : "secondary"}>
                  {organization.is_active ? "Aktif" : "Nonaktif"}
                </Badge>
                <Badge variant="outline">
                  {orgTypeLabels[organization.organization_type || "perusahaan"]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Kode: {organization.code} • Terdaftar {organization.created_at ? format(new Date(organization.created_at), "d MMMM yyyy", { locale: id }) : "-"}
              </p>
            </div>
            <Button onClick={() => navigateWithOverlay(`/admin/organizations/${orgId}/edit`)}>
              Edit Organisasi
            </Button>
          </div>
        </div>
      </header>

      <main className={`${isEmbeddedFromAdminOrgOverlay ? "px-4 py-6" : "container mx-auto px-4 py-8"}`}>
        {isRetrying && (
          <Card className="mb-4 border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data rincian organisasi...</p>
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card className="mb-4 border-destructive/40">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
          </Card>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-6 overflow-x-auto pb-1">
            <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2 whitespace-nowrap">
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview">
            <div className="grid gap-6 md:grid-cols-3">
              {/* Stats Cards */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.employeesCount}</p>
                      <p className="text-sm text-muted-foreground">Total Pegawai</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <MapPin className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.officesCount}</p>
                      <p className="text-sm text-muted-foreground">Lokasi Kantor</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.opdCount}</p>
                      <p className="text-sm text-muted-foreground">Unit/OPD</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Organization Info */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Informasi Organisasi</CardTitle>
                <CardDescription>Rincian lengkap organisasi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{organization.email || "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Telepon</p>
                        <p className="font-medium">{organization.phone || "-"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Alamat</p>
                        <p className="font-medium">{organization.address || "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Terdaftar</p>
                        <p className="font-medium">
                          {organization.created_at 
                            ? format(new Date(organization.created_at), "d MMMM yyyy, HH:mm", { locale: id }) 
                            : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {organization.description && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-1">Deskripsi</p>
                    <p>{organization.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employees">
            <OrganizationEmployees tenantId={orgId!} />
          </TabsContent>

          <TabsContent value="offices">
            <OrganizationOffices tenantId={orgId!} />
          </TabsContent>

          <TabsContent value="subscription">
            <OrganizationSubscription tenantId={orgId!} organizationName={organization.name} />
          </TabsContent>

          <TabsContent value="settings">
            <OrganizationSettings tenantId={orgId!} />
          </TabsContent>

          <TabsContent value="audit">
            <OrganizationAuditLog tenantId={orgId!} />
          </TabsContent>
        </Tabs>
      </main>
      <AdminOrgOverlayDialog />
    </div>
  );
}
