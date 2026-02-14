import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminHeader } from "./SuperAdminHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
        const { data: isSuperAdminResult, error } = await supabase
          .rpc('is_super_admin', { _user_id: session.user.id });

        if (!isMounted) return;

        if (error) {
          console.error("Error checking super admin status:", error);
          // Fallback: check user_roles table directly
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "super_admin")
            .maybeSingle();

          if (!roleData) {
            // Bukan super admin - cek role lain untuk redirect yang tepat
            const { data: roles } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id);

            const isAdminInstansi = roles?.some((r) => r.role === "admin_instansi");
            
            if (isAdminInstansi) {
              toast.info("Anda dialihkan ke panel Admin Organisasi.");
              navigate("/org", { replace: true });
            } else {
              toast.info("Anda dialihkan ke dashboard.");
              navigate("/dashboard", { replace: true });
            }
            return;
          }
          setIsSuperAdmin(true);
        } else if (!isSuperAdminResult) {
          // Bukan super admin - redirect tanpa logout
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id);

          const isAdminInstansi = roles?.some((r) => r.role === "admin_instansi");
          
          if (isAdminInstansi) {
            toast.info("Anda dialihkan ke panel Admin Organisasi.");
            navigate("/org", { replace: true });
          } else {
            toast.info("Anda dialihkan ke dashboard.");
            navigate("/dashboard", { replace: true });
          }
          return;
        } else {
          setIsSuperAdmin(true);
        }
      } catch (error) {
        console.error("Error checking admin access:", error);
        if (isMounted) {
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