import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  const navigate = useNavigate();
  const { id: orgId } = useParams();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState({
    employeesCount: 0,
    officesCount: 0,
    opdCount: 0,
  });

  useEffect(() => {
    if (orgId) {
      fetchOrganization(orgId);
      fetchStats(orgId);
    }
  }, [orgId]);

  const fetchOrganization = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setOrganization(data);
    } catch (error) {
      console.error("Error fetching organization:", error);
      toast.error("Gagal memuat data organisasi");
      navigate("/admin");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async (tenantId: string) => {
    try {
      const [employeesRes, officesRes, opdRes] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("offices").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("opd").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      ]);

      setStats({
        employeesCount: employeesRes.count || 0,
        officesCount: officesRes.count || 0,
        opdCount: opdRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!organization) return null;

  const tabs = [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "employees", label: "Pegawai", icon: Users },
    { id: "offices", label: "Kantor", icon: MapPin },
    { id: "subscription", label: "Langganan", icon: CreditCard },
    { id: "settings", label: "Pengaturan", icon: Settings },
    { id: "audit", label: "Audit Log", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
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
            <Button onClick={() => navigate(`/admin/organizations/${orgId}/edit`)}>
              Edit Organisasi
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

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
                <CardDescription>Detail lengkap organisasi</CardDescription>
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
    </div>
  );
}
