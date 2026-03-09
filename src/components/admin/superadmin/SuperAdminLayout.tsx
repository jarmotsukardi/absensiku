import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminHeader } from "./SuperAdminHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

interface SuperAdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  workspaceMode?: "absensi" | "hr" | "payroll";
}

const ACCESS_CHECK_TIMEOUT_MS = 12000;
const ACCESS_LOADING_WATCHDOG_MS = 20000;
const ACCESS_CACHE_KEY = "superadmin_access_cache_v1";
const ACCESS_CACHE_TTL_MS = 3 * 60 * 1000;
const ACCESS_CHECK_RETRY_MAX = 1;

const getCachedSuperAdminAccess = () => {
  try {
    const raw = sessionStorage.getItem(ACCESS_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { verifiedAt?: number };
    if (!parsed?.verifiedAt || !Number.isFinite(parsed.verifiedAt)) return false;
    return Date.now() - parsed.verifiedAt <= ACCESS_CACHE_TTL_MS;
  } catch {
    return false;
  }
};

const setCachedSuperAdminAccess = () => {
  try {
    sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ verifiedAt: Date.now() }));
  } catch {
    // Ignore storage failures
  }
};

const clearCachedSuperAdminAccess = () => {
  try {
    sessionStorage.removeItem(ACCESS_CACHE_KEY);
  } catch {
    // Ignore storage failures
  }
};

export function SuperAdminLayout({
  children,
  title,
  subtitle,
  workspaceMode = "absensi",
}: SuperAdminLayoutProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(() => !getCachedSuperAdminAccess());
  const [isSuperAdmin, setIsSuperAdmin] = useState(() => getCachedSuperAdminAccess());
  const [hasChecked, setHasChecked] = useState(() => getCachedSuperAdminAccess());
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  useEffect(() => {
    // Prevent duplicate checks
    if (hasChecked) return;
    
    let isMounted = true;

    const checkAdminAccess = async () => {
      try {
        const { data: { session } } = await withExponentialBackoff(
          () =>
            withTimeout(
              Promise.resolve(supabase.auth.getSession()),
              ACCESS_CHECK_TIMEOUT_MS,
              "Timeout verifikasi sesi super admin",
            ),
          {
            maxRetries: ACCESS_CHECK_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );
        
        if (!isMounted) return;
        
        if (!session?.user) {
          // Tidak ada session - redirect ke login tanpa pesan error
          clearCachedSuperAdminAccess();
          setAccessDeniedMessage("Sesi tidak ditemukan. Silakan login kembali.");
          navigate("/admin/login", { replace: true });
          return;
        }

        // Check if user is super_admin using RPC function
        const { data: isSuperAdminResult, error: rpcError } = await withExponentialBackoff(
          () =>
            withTimeout(
              Promise.resolve(
                supabase.rpc("is_super_admin", { _user_id: session.user.id }),
              ),
              ACCESS_CHECK_TIMEOUT_MS,
              "Timeout verifikasi role super admin",
            ),
          {
            maxRetries: ACCESS_CHECK_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );

        if (!isMounted) return;

        if (isSuperAdminResult === true) {
          setCachedSuperAdminAccess();
          setIsSuperAdmin(true);
          return;
        }

        // Fallback: check user_roles table directly
        const { data: roles, error: rolesError } = await withExponentialBackoff(
          () =>
            withTimeout(
              Promise.resolve(
                supabase
                  .from("user_roles")
                  .select("role")
                  .eq("user_id", session.user.id),
              ),
              ACCESS_CHECK_TIMEOUT_MS,
              "Timeout membaca role user",
            ),
          {
            maxRetries: ACCESS_CHECK_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );

        if (!isMounted) return;

        const hasSuperAdminRole = roles?.some((r) => r.role === "super_admin");
        if (hasSuperAdminRole) {
          setCachedSuperAdminAccess();
          setIsSuperAdmin(true);
          return;
        }

        if (rpcError || rolesError) {
          const errorRef = reportError(rpcError || rolesError, "superadmin.layout.check_admin_access", {
            user_id: session.user.id,
            rpc_error: rpcError?.message ?? null,
            roles_error: rolesError?.message ?? null,
          });
          clearCachedSuperAdminAccess();
          setAccessDeniedMessage("Gagal memverifikasi role Super Admin.");
          toast.error(appendErrorReference("Gagal memverifikasi role Super Admin", errorRef));
          navigate("/admin/login", { replace: true });
          return;
        }

        // Route /admin harus tegas untuk Super Admin saja.
        // Jika akun bukan super_admin, arahkan kembali ke login admin agar tidak membingungkan
        // (sebelumnya akun pegawai bisa terdorong ke /employee/dashboard saat membuka /admin).
        clearCachedSuperAdminAccess();
        setAccessDeniedMessage("Akun ini belum memiliki role Super Admin.");
        toast.info("Akun ini belum memiliki role Super Admin.");
        navigate("/admin/login", { replace: true });
      } catch (error) {
        if (isMounted) {
          clearCachedSuperAdminAccess();
          const errorRef = reportError(error, "superadmin.layout.check_admin_access.unexpected");
          setAccessDeniedMessage("Terjadi kesalahan saat verifikasi akses Super Admin.");
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

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => {
      setAccessDeniedMessage("Verifikasi akses terlalu lama. Silakan login ulang.");
      navigate("/admin/login", { replace: true });
      setIsLoading(false);
      setHasChecked(true);
    }, ACCESS_LOADING_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading, navigate]);

  if (isLoading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <SuperAdminSidebar workspaceMode={workspaceMode} />
          <SidebarInset>
            <SuperAdminHeader title={title} subtitle={subtitle} workspaceMode={workspaceMode} />
            <main className="flex-1 p-6">
              <div className="min-h-[320px] flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                <p className="text-sm text-muted-foreground">Memuat...</p>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  if (!isSuperAdmin) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <SuperAdminSidebar workspaceMode={workspaceMode} />
          <SidebarInset>
            <SuperAdminHeader title={title} subtitle={subtitle} workspaceMode={workspaceMode} />
            <main className="flex-1 p-6">
              <div className="mx-auto mt-16 max-w-xl rounded-xl border border-amber-200 bg-amber-50/80 p-5">
                <h2 className="text-base font-semibold text-amber-900">Akses Super Admin Diperlukan</h2>
                <p className="mt-2 text-sm text-amber-800">
                  {accessDeniedMessage || "Halaman ini hanya dapat diakses oleh akun dengan role Super Admin."}
                </p>
                <Button className="mt-4" size="sm" onClick={() => navigate("/admin/login", { replace: true })}>
                  Kembali ke Login Admin
                </Button>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SuperAdminSidebar workspaceMode={workspaceMode} />
        <SidebarInset>
          <SuperAdminHeader title={title} subtitle={subtitle} workspaceMode={workspaceMode} />
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
