import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OrganizationSidebar } from "./OrganizationSidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";
import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { HardRequestNotifications } from "@/components/org/HardRequestNotifications";
import { Building2, LogOut } from "lucide-react";

interface OrganizationLayoutProps {
  children: React.ReactNode;
}

interface TenantInfo {
  name: string;
  organization_type: string;
  logo_url?: string | null;
}

interface MenuUserInfo {
  name: string;
  email: string;
  avatarUrl: string | null;
}

type OrgAccessLevel = "admin" | "operator";

const ACCESS_CHECK_TIMEOUT_MS = 12000;
const ACCESS_LOADING_WATCHDOG_MS = 20000;
const ORG_ACTIVE_TENANT_STORAGE_KEY = "org_active_tenant_id";
const ORG_ACCESS_CACHE_KEY = "org_access_cache_v1";
const ORG_ACCESS_CACHE_TTL_MS = 3 * 60 * 1000;

interface OrgAccessCacheEntry {
  checkedAt: number;
  tenantId: string;
  accessLevel: OrgAccessLevel;
  tenantName: string;
  tenantType: string;
  tenantLogoUrl?: string | null;
}

const readOrgAccessCache = (): OrgAccessCacheEntry | null => {
  try {
    const raw = sessionStorage.getItem(ORG_ACCESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrgAccessCacheEntry;
    if (!parsed?.checkedAt || Date.now() - parsed.checkedAt > ORG_ACCESS_CACHE_TTL_MS) {
      return null;
    }
    if (!parsed.tenantId || !parsed.accessLevel) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeOrgAccessCache = (entry: Omit<OrgAccessCacheEntry, "checkedAt">) => {
  try {
    sessionStorage.setItem(
      ORG_ACCESS_CACHE_KEY,
      JSON.stringify({
        ...entry,
        checkedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage failures.
  }
};

const clearOrgAccessCache = () => {
  try {
    sessionStorage.removeItem(ORG_ACCESS_CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
};

export function OrganizationLayout({ children }: OrganizationLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenant_id");
  const cachedAccess = readOrgAccessCache();
  const [isLoading, setIsLoading] = useState(!cachedAccess);
  const [tenant, setTenant] = useState<TenantInfo | null>(
    cachedAccess
      ? {
          name: cachedAccess.tenantName,
          organization_type: cachedAccess.tenantType,
          logo_url: cachedAccess.tenantLogoUrl || null,
        }
      : null,
  );
  const [activeTenantId, setActiveTenantId] = useState<string | null>(cachedAccess?.tenantId || null);
  const [accessLevel, setAccessLevel] = useState<OrgAccessLevel>(cachedAccess?.accessLevel || "operator");
  const [menuUserInfo, setMenuUserInfo] = useState<MenuUserInfo>({
    name: "Pengguna",
    email: "-",
    avatarUrl: null,
  });

  const isOperatorAllowedPath = useCallback((pathname: string) => {
    const allowedPrefixes = [
      "/org/dashboard",
      "/org/leave",
      "/org/reports",
      "/org/help",
      "/org/profile",
    ];

    if (pathname === "/org") return true;

    if (pathname === "/org/settings/admin-operator") return false;
    if (pathname.startsWith("/org/master")) return false;
    if (pathname.startsWith("/org/schedule")) return false;
    if (pathname.startsWith("/org/settings")) return false;
    if (pathname.startsWith("/org/news")) return false;
    if (pathname.startsWith("/org/notifications")) return false;
    if (pathname.startsWith("/org/activation")) return false;
    if (pathname.startsWith("/org/billing")) return false;
    if (pathname.startsWith("/org/onboarding")) return false;
    if (pathname.startsWith("/org/audit-log")) return false;
    if (pathname.startsWith("/org/invitations")) return false;
    if (pathname.startsWith("/org/employees")) return false;

    return allowedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }, []);

  const checkAccess = useCallback(async () => {
    try {
      const { data: { user } } = await withTimeout(
        Promise.resolve(supabase.auth.getUser()),
        ACCESS_CHECK_TIMEOUT_MS,
        "Timeout verifikasi sesi organisasi"
      );
      
      if (!user) {
        clearOrgAccessCache();
        // Tidak ada session - redirect ke login tanpa pesan error
        navigate("/org/login", { replace: true });
        return;
      }

      const metadata = user.user_metadata as Record<string, unknown> | null;
      const metadataName =
        (typeof metadata?.name === "string" && metadata.name.trim()) ||
        (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
        "";
      const metadataAvatar = typeof metadata?.avatar_url === "string" ? metadata.avatar_url : null;

      // Check user roles
      const { data: roles, error: rolesError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("user_roles")
            .select("role, tenant_id")
            .eq("user_id", user.id)
        ),
        ACCESS_CHECK_TIMEOUT_MS,
        "Timeout membaca role organisasi"
      );
      if (rolesError) throw rolesError;

      const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
      const hasAdminInstansiRole = roles?.some((r) => r.role === "admin_instansi") || false;
      const hasOperatorRole = roles?.some((r) => r.role === "atasan") || false;
      const hasPegawaiRole = roles?.some((r) => r.role === "pegawai") || false;
      const adminInstansiRole = roles?.find((r) => r.role === "admin_instansi" && r.tenant_id);
      const operatorRole = roles?.find((r) => r.role === "atasan" && r.tenant_id);
      const hasAdminAccess = isSuperAdmin || hasAdminInstansiRole;
      const roleLabel = hasAdminAccess ? "Admin Organisasi" : hasOperatorRole ? "Operator" : "Pegawai";
      setMenuUserInfo({
        name: metadataName || roleLabel,
        email: user.email || "-",
        avatarUrl: metadataAvatar,
      });
      let resolvedTenantId =
        adminInstansiRole?.tenant_id ||
        (isSuperAdmin ? queryTenantId : null) ||
        operatorRole?.tenant_id ||
        null;

      if (!resolvedTenantId && (hasAdminInstansiRole || hasOperatorRole)) {
        try {
          const cachedTenantId = sessionStorage.getItem(ORG_ACTIVE_TENANT_STORAGE_KEY);
          if (cachedTenantId) {
            resolvedTenantId = cachedTenantId;
          }
        } catch {
          // Ignore storage failures.
        }
      }

      if (!resolvedTenantId && (hasAdminInstansiRole || hasOperatorRole)) {
        const { data: employeeRow, error: employeeError } = await withTimeout(
          Promise.resolve(
            supabase
              .from("employees")
              .select("tenant_id")
              .eq("user_id", user.id)
              .maybeSingle(),
          ),
          ACCESS_CHECK_TIMEOUT_MS,
          "Timeout menentukan tenant operator",
        );
        if (employeeError) throw employeeError;
        resolvedTenantId = employeeRow?.tenant_id || null;
      }

      if (resolvedTenantId) {
        setActiveTenantId(resolvedTenantId);
        setAccessLevel(hasAdminAccess ? "admin" : "operator");
        try {
          sessionStorage.setItem(ORG_ACTIVE_TENANT_STORAGE_KEY, resolvedTenantId);
        } catch {
          // Ignore storage failures.
        }

        // Fetch tenant info
        const { data: tenantData, error: tenantError } = await withTimeout(
          Promise.resolve(
            supabase
              .from("tenants")
              .select("name, organization_type, logo_url")
              .eq("id", resolvedTenantId)
              .maybeSingle()
          ),
          ACCESS_CHECK_TIMEOUT_MS,
          "Timeout membaca profil tenant organisasi"
        );
        if (tenantError) throw tenantError;

        if (tenantData) {
          const nextTenant: TenantInfo = {
            name: tenantData.name,
            organization_type: getOrganizationTypeLabel(tenantData.organization_type || ""),
            logo_url: tenantData.logo_url || null,
          };
          setTenant(nextTenant);
          writeOrgAccessCache({
            tenantId: resolvedTenantId,
            accessLevel: hasAdminAccess ? "admin" : "operator",
            tenantName: nextTenant.name,
            tenantType: nextTenant.organization_type,
            tenantLogoUrl: nextTenant.logo_url || null,
          });
        } else {
          const fallbackTenant: TenantInfo = {
            name: "Organisasi",
            organization_type: "Admin Organisasi",
            logo_url: null,
          };
          setTenant(fallbackTenant);
          writeOrgAccessCache({
            tenantId: resolvedTenantId,
            accessLevel: hasAdminAccess ? "admin" : "operator",
            tenantName: fallbackTenant.name,
            tenantType: fallbackTenant.organization_type,
            tenantLogoUrl: null,
          });
        }
        setIsLoading(false);
        return;
      }

      if (isSuperAdmin) {
        clearOrgAccessCache();
        setAccessLevel("admin");
        setActiveTenantId(null);
        try {
          sessionStorage.removeItem(ORG_ACTIVE_TENANT_STORAGE_KEY);
        } catch {
          // Ignore storage failures.
        }
        toast.info("Pilih organisasi dari menu admin terlebih dahulu.");
        navigate("/admin/organizations", { replace: true });
        return;
      }

      // Bukan admin - redirect ke halaman yang sesuai tanpa logout
      clearOrgAccessCache();
      if (hasPegawaiRole) {
        toast.info("Anda dialihkan ke dashboard pegawai.");
        navigate("/employee/dashboard", { replace: true });
      } else {
        toast.info("Akun tidak memiliki akses admin.");
        navigate("/employee/dashboard", { replace: true });
      }
    } catch (error) {
      clearOrgAccessCache();
      setActiveTenantId(null);
      try {
        sessionStorage.removeItem(ORG_ACTIVE_TENANT_STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
      const errorRef = reportError(error, "org.layout.check_access", {
        tenant_id: queryTenantId,
      });
      toast.error(appendErrorReference("Gagal memverifikasi akses", errorRef));
      navigate("/org/login", { replace: true });
    } finally {
      setIsLoading(false);
    }
  }, [navigate, queryTenantId]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => {
      const errorRef = reportError(new Error("Organization layout loading watchdog timeout"), "org.layout.loading_watchdog", {
        tenant_id: queryTenantId,
      });
      toast.error(appendErrorReference("Verifikasi akses terlalu lama. Silakan login ulang.", errorRef));
      setIsLoading(false);
      navigate("/org/login", { replace: true });
    }, ACCESS_LOADING_WATCHDOG_MS);

    return () => window.clearTimeout(timer);
  }, [isLoading, navigate, queryTenantId]);

  useEffect(() => {
    if (isLoading || accessLevel !== "operator") return;
    if (isOperatorAllowedPath(location.pathname)) return;

    toast.info("Akses operator dibatasi ke modul operasional.");
    navigate("/org/leave/requests", { replace: true });
  }, [accessLevel, isLoading, isOperatorAllowedPath, location.pathname, navigate]);

  const isOperatorBlockedPath =
    !isLoading && accessLevel === "operator" && !isOperatorAllowedPath(location.pathname);

  const getOrganizationTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      pemerintah_daerah: "Pemerintah Daerah",
      instansi_pemerintah: "Instansi Pemerintah",
      perusahaan: "Perusahaan",
      sekolah: "Sekolah/Pendidikan",
    };
    return types[type] || type;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/org/login");
  };

  const handleOpenDetailSaya = () => {
    navigate("/org/profile");
  };

  const handleOpenKontak = () => {
    navigate("/org/profile?section=contact");
  };

  const handleOpenKeamananAkun = () => {
    navigate("/org/profile?section=security");
  };

  const handleOpenRiwayatEmail = () => {
    navigate("/org/notifications");
  };

  const handleOpenProfilAnda = () => {
    navigate("/org/profile");
  };

  const handleOpenGantiKataSandi = () => {
    navigate("/org/profile?section=password");
  };

  const handleOpenSecuritySettings = () => {
    navigate("/org/settings?tab=security");
  };

  const headerAvatarLabel = tenant?.name || menuUserInfo.name;
  const headerAvatarUrl = tenant?.logo_url || menuUserInfo.avatarUrl;
  const shouldRenderHardRequestNotifications =
    location.pathname !== "/org/billing" &&
    !location.pathname.startsWith("/org/billing/") &&
    (accessLevel === "admin" || isOperatorAllowedPath(location.pathname));

  if (isLoading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <OrganizationSidebar
            organizationName={tenant?.name}
            organizationType={tenant?.organization_type}
            accessLevel={accessLevel}
          />
          <main className="flex-1 overflow-auto">
            <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-4 min-w-0">
                  <SidebarTrigger />
                  <div className="h-6 w-px bg-border" />
                  <span className="text-sm text-muted-foreground">
                    {accessLevel === "admin" ? "Admin Organisasi" : "Operator"}
                  </span>
                </div>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full" disabled>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Building2 className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </div>
            </header>
            <div className="p-6">
              <div className="min-h-[280px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <OrganizationSidebar 
          organizationName={tenant?.name} 
          organizationType={tenant?.organization_type}
          accessLevel={accessLevel}
        />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-4 min-w-0">
                <SidebarTrigger />
                <div className="h-6 w-px bg-border" />
                <span className="text-sm text-muted-foreground">
                  {accessLevel === "admin" ? "Admin Organisasi" : "Operator"}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9">
                      {headerAvatarUrl ? <AvatarImage src={headerAvatarUrl} alt={headerAvatarLabel} /> : null}
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <Building2 className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleOpenDetailSaya}>Detail Saya</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenKontak}>Kontak</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenKeamananAkun}>Keamanan Akun</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenRiwayatEmail}>Riwayat Email</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleOpenProfilAnda}>Profil Anda</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenGantiKataSandi}>Ganti Kata Sandi</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenSecuritySettings}>Security Settings</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <div className="p-6">
            {isOperatorBlockedPath ? (
              <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50/70 p-5">
                <h2 className="text-base font-semibold text-amber-900">Akses Halaman Dibatasi</h2>
                <p className="mt-2 text-sm text-amber-800">
                  Role Operator hanya dapat mengakses modul operasional seperti Permohonan, Laporan Permohonan,
                  Bantuan, dan Profil.
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => navigate("/org/leave/requests", { replace: true })}
                >
                  Buka Halaman yang Diizinkan
                </Button>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
      <FloatingWhatsApp
        settingKey="floating_whatsapp_org_admin"
        fallbackSettingKeys={["floating_whatsapp", "floating_whatsapp_public"]}
        panelTitle="Dukungan Admin"
        panelSubtitle="Layanan pelanggan & bantuan teknis"
      />
      {shouldRenderHardRequestNotifications ? (
        <HardRequestNotifications tenantId={activeTenantId} />
      ) : null}
    </SidebarProvider>
  );
}
