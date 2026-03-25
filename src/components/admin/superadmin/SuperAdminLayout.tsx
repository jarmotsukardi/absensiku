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
import { AdminOrgOverlayDialog } from "@/components/admin/organization/AdminOrgOverlayDialog";
import { Helmet } from "react-helmet-async";
import { setStoredSuperAdminWorkspaceMode } from "@/lib/superAdminWorkspace";

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

interface SuperAdminAccessCacheEntry {
  userId: string;
  verifiedAt: number;
}

const getCachedSuperAdminAccess = (): SuperAdminAccessCacheEntry | null => {
  try {
    const raw = sessionStorage.getItem(ACCESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SuperAdminAccessCacheEntry>;
    if (!parsed?.userId || !parsed?.verifiedAt || !Number.isFinite(parsed.verifiedAt)) return null;
    if (Date.now() - parsed.verifiedAt > ACCESS_CACHE_TTL_MS) return null;
    return {
      userId: parsed.userId,
      verifiedAt: parsed.verifiedAt,
    };
  } catch {
    return null;
  }
};

const setCachedSuperAdminAccess = (userId: string) => {
  try {
    sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ userId, verifiedAt: Date.now() }));
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  useEffect(() => {
    setStoredSuperAdminWorkspaceMode(workspaceMode);
  }, [workspaceMode]);

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

        const cachedAccess = getCachedSuperAdminAccess();
        if (cachedAccess?.userId === session.user.id) {
          setIsSuperAdmin(true);
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
          setCachedSuperAdminAccess(session.user.id);
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
          setCachedSuperAdminAccess(session.user.id);
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
        <Helmet>
          <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
          <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet" />
        </Helmet>
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
        <Helmet>
          <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
          <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet" />
        </Helmet>
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
      <Helmet>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet" />
      </Helmet>
      <div className="min-h-screen flex w-full">
        <SuperAdminSidebar workspaceMode={workspaceMode} />
        <SidebarInset>
          <SuperAdminHeader title={title} subtitle={subtitle} workspaceMode={workspaceMode} />
          <main className="flex-1 p-6">
            {children}
          </main>
          <AdminOrgOverlayDialog />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
