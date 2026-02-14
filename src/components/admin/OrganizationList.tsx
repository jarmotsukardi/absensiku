import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Landmark,
  Building,
  Briefcase,
  GraduationCap,
  Users,
  LayoutDashboard
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";

interface Organization {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  organization_type: string | null;
  is_active: boolean | null;
  created_at: string | null;
  employees_count?: number;
  subscription_status?: string;
}

interface OrganizationListProps {
  filterType?: string;
}

const orgTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  pemerintah_daerah: Landmark,
  instansi_pemerintah: Building,
  perusahaan: Briefcase,
  sekolah: GraduationCap,
};

const orgTypeLabels: Record<string, string> = {
  pemerintah_daerah: "Pemerintah Daerah",
  instansi_pemerintah: "Instansi Pemerintah",
  perusahaan: "Perusahaan",
  sekolah: "Sekolah",
};

export function OrganizationList({ filterType }: OrganizationListProps) {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchOrganizations();
  }, [filterType]);

  const fetchOrganizations = async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });

      if (filterType) {
        query = query.eq("organization_type", filterType as "pemerintah_daerah" | "instansi_pemerintah" | "perusahaan" | "sekolah");
      }

      const { data: tenants, error } = await query;

      if (error) throw error;

      // Fetch employee counts and subscription status for each tenant
      const orgsWithDetails = await Promise.all(
        (tenants || []).map(async (tenant: any) => {
          const { count: employeesCount } = await supabase
            .from("employees")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id);

          const { data: subscription } = await supabase
            .from("subscriptions")
            .select("status")
            .eq("tenant_id", tenant.id)
            .single();

          return {
            ...tenant,
            employees_count: employeesCount || 0,
            subscription_status: subscription?.status || "trial",
          };
        })
      );

      setOrganizations(orgsWithDetails);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      toast.error("Gagal memuat data organisasi");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus "${name}"?`)) return;

    try {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
      toast.success("Organisasi berhasil dihapus");
      fetchOrganizations();
    } catch (error) {
      console.error("Error deleting organization:", error);
      toast.error("Gagal menghapus organisasi");
    }
  };

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (org.email && org.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getSubscriptionBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      trial: "secondary",
      expired: "destructive",
      cancelled: "outline",
    };
    const labels: Record<string, string> = {
      active: "Aktif",
      trial: "Trial",
      expired: "Expired",
      cancelled: "Dibatalkan",
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {labels[status] || status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-full max-w-sm bg-muted rounded animate-pulse"></div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari organisasi..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisasi</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead className="text-center">Pegawai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Langganan</TableHead>
              <TableHead>Terdaftar</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrganizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "Tidak ada organisasi yang ditemukan" : "Belum ada organisasi terdaftar"}
                </TableCell>
              </TableRow>
            ) : (
              filteredOrganizations.map((org) => {
                const OrgIcon = orgTypeIcons[org.organization_type || "perusahaan"] || Briefcase;
                return (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <OrgIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-sm text-muted-foreground">{org.email || "-"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {orgTypeLabels[org.organization_type || "perusahaan"] || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{org.code}</code>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{org.employees_count}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.is_active ? "default" : "secondary"}>
                        {org.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>{getSubscriptionBadge(org.subscription_status || "trial")}</TableCell>
                    <TableCell>
                      {org.created_at
                        ? format(new Date(org.created_at), "d MMM yyyy", { locale: id })
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/org?tenant_id=${org.id}`)}>
                            <LayoutDashboard className="h-4 w-4 mr-2" />
                            Masuk Dashboard
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/admin/organizations/${org.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Lihat Detail
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/admin/organizations/${org.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(org.id, org.name)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
