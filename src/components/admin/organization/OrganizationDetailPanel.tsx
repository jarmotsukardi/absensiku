import { useEffect, useState } from "react";
import { X, Building2, Users, MapPin, Mail, Phone, Calendar, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id } from "date-fns/locale";

type Organization = Tables<"tenants">;

interface OrganizationDetailPanelProps {
  orgId: string | null;
  onClose: () => void;
}

const orgTypeLabels: Record<string, string> = {
  pemerintah_daerah: "Pemerintah Daerah",
  instansi_pemerintah: "Instansi Pemerintah",
  perusahaan: "Perusahaan",
  sekolah: "Sekolah",
};

export function OrganizationDetailPanel({ orgId, onClose }: OrganizationDetailPanelProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    employeesCount: 0,
    officesCount: 0,
    opdCount: 0,
  });
  const [subscription, setSubscription] = useState<Tables<"subscriptions"> | null>(null);

  useEffect(() => {
    if (orgId) {
      fetchOrganization(orgId);
      fetchStats(orgId);
      fetchSubscription(orgId);
    }
  }, [orgId]);

  const fetchOrganization = async (id: string) => {
    setIsLoading(true);
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

  const fetchSubscription = async (tenantId: string) => {
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setSubscription(data);
    } catch (error) {
      console.error("Error fetching subscription:", error);
    }
  };

  if (!orgId) return null;

  return (
    <div className="w-[400px] border-l bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Detail Organisasi</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : organization ? (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Organization Header */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-lg truncate">{organization.name}</h4>
                  <p className="text-sm text-muted-foreground font-mono">{organization.code}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant={organization.is_active ? "default" : "secondary"}>
                  {organization.is_active ? "Aktif" : "Nonaktif"}
                </Badge>
                <Badge variant="outline">
                  {orgTypeLabels[organization.organization_type || "perusahaan"]}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                <Users className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{stats.employeesCount}</p>
                <p className="text-xs text-muted-foreground">Pegawai</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10 text-center">
                <MapPin className="h-5 w-5 text-green-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{stats.officesCount}</p>
                <p className="text-xs text-muted-foreground">Kantor</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10 text-center">
                <Building2 className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{stats.opdCount}</p>
                <p className="text-xs text-muted-foreground">OPD</p>
              </div>
            </div>

            <Separator />

            {/* Contact Info */}
            <div className="space-y-3">
              <h5 className="font-medium text-sm">Informasi Kontak</h5>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Email:</span>
                  <span>{organization.email || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Telepon:</span>
                  <span>{organization.phone || "-"}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-muted-foreground">Alamat:</span>
                  <span className="flex-1">{organization.address || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Terdaftar:</span>
                  <span>
                    {organization.created_at 
                      ? format(new Date(organization.created_at), "d MMM yyyy", { locale: id }) 
                      : "-"}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Subscription Info */}
            <div className="space-y-3">
              <h5 className="font-medium text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Langganan
              </h5>
              {subscription ? (
                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={subscription.status === "active" ? "default" : subscription.status === "trial" ? "secondary" : "destructive"}>
                      {subscription.status === "active" ? "Aktif" : subscription.status === "trial" ? "Trial" : "Expired"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Max Pegawai</span>
                    <span>{subscription.max_employees || "∞"}</span>
                  </div>
                  {subscription.end_date && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Berakhir</span>
                      <span>{format(new Date(subscription.end_date), "d MMM yyyy", { locale: id })}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Mode Billing</span>
                    <Badge variant="outline">
                      {organization.billing_mode === "individual" ? "Mandiri" : "Terpusat"}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Belum ada langganan</p>
              )}
            </div>

            {organization.description && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h5 className="font-medium text-sm">Deskripsi</h5>
                  <p className="text-sm text-muted-foreground">{organization.description}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Organisasi tidak ditemukan
        </div>
      )}
    </div>
  );
}
