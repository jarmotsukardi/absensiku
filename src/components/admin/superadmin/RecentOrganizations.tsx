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

export function RecentOrganizations() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error("Error fetching organizations:", error);
    } finally {
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
        {organizations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Belum ada organisasi terdaftar</p>
          </div>
        ) : (
          <div className="space-y-4">
            {organizations.map((org) => {
              const Icon = orgTypeIcons[org.organization_type] || Building2;
              return (
                <div
                  key={org.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/organizations/${org.id}`)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{org.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{orgTypeLabels[org.organization_type] || org.organization_type}</span>
                      <span>•</span>
                      <span>{format(new Date(org.created_at), "d MMM yyyy", { locale: id })}</span>
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