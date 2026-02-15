import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OrganizationSidebar } from "./OrganizationSidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrganizationLayoutProps {
  children: React.ReactNode;
}

interface TenantInfo {
  name: string;
  organization_type: string;
}

export function OrganizationLayout({ children }: OrganizationLayoutProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  const checkAccess = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Tidak ada session - redirect ke login tanpa pesan error
        navigate("/org/login", { replace: true });
        return;
      }

      // Check user roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);

      const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
      const adminInstansiRole = roles?.find((r) => r.role === "admin_instansi" && r.tenant_id);
      const isPegawai = roles?.some((r) => r.role === "pegawai");
      const queryTenantId = searchParams.get("tenant_id");

      const resolvedTenantId = adminInstansiRole?.tenant_id || (isSuperAdmin ? queryTenantId : null);
      if (resolvedTenantId) {
        // Fetch tenant info
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("name, organization_type")
          .eq("id", resolvedTenantId)
          .maybeSingle();

        if (tenantData) {
          setTenant({
            name: tenantData.name,
            organization_type: getOrganizationTypeLabel(tenantData.organization_type || ""),
          });
        } else {
          setTenant({ name: "Organisasi", organization_type: "Admin Organisasi" });
        }
        setIsLoading(false);
        return;
      }

      if (isSuperAdmin) {
        toast.info("Pilih organisasi dari menu admin terlebih dahulu.");
        navigate("/admin/organizations", { replace: true });
        return;
      }

      // Bukan admin - redirect ke halaman yang sesuai tanpa logout
      if (isPegawai) {
        toast.info("Anda dialihkan ke dashboard pegawai.");
        navigate("/employee/dashboard", { replace: true });
      } else {
        toast.info("Akun tidak memiliki akses admin.");
        navigate("/employee/dashboard", { replace: true });
      }
    } catch (error) {
      console.error("Error checking access:", error);
      toast.error("Gagal memverifikasi akses");
      navigate("/org/login", { replace: true });
    } finally {
      setIsLoading(false);
    }
  }, [navigate, searchParams]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  const getOrganizationTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      pemerintah_daerah: "Pemerintah Daerah",
      instansi_pemerintah: "Instansi Pemerintah",
      perusahaan: "Perusahaan",
      sekolah: "Sekolah/Pendidikan",
    };
    return types[type] || type;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <OrganizationSidebar 
          organizationName={tenant?.name} 
          organizationType={tenant?.organization_type}
        />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
            <div className="flex items-center gap-4 px-4 py-3">
              <SidebarTrigger />
              <div className="h-6 w-px bg-border" />
              <span className="text-sm text-muted-foreground">Admin Organisasi</span>
            </div>
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
