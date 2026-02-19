import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminHeader } from "./SuperAdminHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface SuperAdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function SuperAdminLayout({ children, title, subtitle }: SuperAdminLayoutProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Prevent duplicate checks
    if (hasChecked) return;
    
    let isMounted = true;

    const checkAdminAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        if (!session?.user) {
          // Tidak ada session - redirect ke login tanpa pesan error
          navigate("/admin/login", { replace: true });
          return;
        }

        // Check if user is super_admin using RPC function
        const { data: isSuperAdminResult, error: rpcError } = await supabase
          .rpc("is_super_admin", { _user_id: session.user.id });

        if (!isMounted) return;

        if (isSuperAdminResult === true) {
          setIsSuperAdmin(true);
          return;
        }

        // Fallback: check user_roles table directly
        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);

        if (!isMounted) return;

        const hasSuperAdminRole = roles?.some((r) => r.role === "super_admin");
        if (hasSuperAdminRole) {
          setIsSuperAdmin(true);
          return;
        }

        if (rpcError || rolesError) {
          const errorRef = reportError(rpcError || rolesError, "superadmin.layout.check_admin_access", {
            user_id: session.user.id,
            rpc_error: rpcError?.message ?? null,
            roles_error: rolesError?.message ?? null,
          });
          toast.error(appendErrorReference("Gagal memverifikasi role Super Admin", errorRef));
          navigate("/admin/login", { replace: true });
          return;
        }

        // Route /admin harus tegas untuk Super Admin saja.
        // Jika akun bukan super_admin, arahkan kembali ke login admin agar tidak membingungkan
        // (sebelumnya akun pegawai bisa terdorong ke /employee/dashboard saat membuka /admin).
        toast.info("Akun ini belum memiliki role Super Admin.");
        navigate("/admin/login", { replace: true });
      } catch (error) {
        if (isMounted) {
          const errorRef = reportError(error, "superadmin.layout.check_admin_access.unexpected");
          toast.error(appendErrorReference("Verifikasi akses admin gagal", errorRef));
          navigate("/admin/login", { replace: true });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setHasChecked(true);
        }
      }
    };

    checkAdminAccess();

    return () => {
      isMounted = false;
    };
  }, [navigate, hasChecked]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SuperAdminSidebar />
        <SidebarInset>
          <SuperAdminHeader title={title} subtitle={subtitle} />
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
