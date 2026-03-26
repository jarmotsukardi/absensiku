import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OrganizationSidebar } from "./OrganizationSidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { HardRequestNotifications } from "@/components/org/HardRequestNotifications";
import { OrgHRPageGuide } from "@/components/org/hr/OrgHRPageGuide";
import { WorkspaceAccessStatusBanner } from "@/components/org/WorkspaceAccessStatusBanner";
import { WorkspaceReadonlyShield } from "@/components/org/WorkspaceReadonlyShield";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { PrivatePageSeo } from "@/components/seo/PrivatePageSeo";
import { Building2, LogOut, BriefcaseBusiness, Receipt, LayoutDashboard, ExternalLink } from "lucide-react";
import { fetchOrgOnboardingCounts } from "@/lib/orgOnboardingTemplates";
import {
  DEFAULT_ORG_WORKSPACE_MODULES,
  fetchTenantOrgWorkspaceModules,
  ORG_WORKSPACE_MODULES_UPDATED_EVENT,
  parseOrgWorkspaceModulesSetting,
  type OrgWorkspaceModules,
} from "@/lib/orgWorkspaceModules";
import {
  fetchTenantHrPayrollAccessState,
  type TenantHrPayrollAccessState,
  type WorkspaceAccessMode,
} from "@/lib/hrPayrollAccessPolicy";
import {
  buildOrgHrOverlayHref,
  buildOrgHrEmbeddedTarget,
  getOrgHrOverlayTarget,
  ORG_HR_EMBED_PARAM,
  ORG_HR_OVERLAY_PARAM,
} from "@/lib/orgHrOverlay";
import {
  buildOrgPayrollEmbeddedTarget,
  getOrgPayrollOverlayTarget,
  ORG_PAYROLL_EMBED_PARAM,
  ORG_PAYROLL_OVERLAY_PARAM,
} from "@/lib/orgPayrollOverlay";
import {
  isOrgOnboardingComplete,
  isOrgProfileComplete,
  resolveOrgFirstRunRedirect,
} from "@/lib/orgOnboardingProgress";
import { resolveOrgTenantIdForUser } from "@/lib/orgTenantContext";

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
type OrgWorkspace = "absensi" | "hr" | "payroll";

const ACCESS_CHECK_TIMEOUT_MS = 12000;
const ACCESS_CHECK_RETRY_MAX = 1;
const ACCESS_LOADING_WATCHDOG_MS = 35000;
const ORG_ACTIVE_TENANT_STORAGE_KEY = "org_active_tenant_id";
const ORG_ACCESS_CACHE_KEY = "org_access_cache_v1";
const ORG_ACCESS_CACHE_TTL_MS = 3 * 60 * 1000;

interface OrgAccessCacheEntry {
  checkedAt: number;
  userId: string;
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
    if (!parsed.userId || !parsed.tenantId || !parsed.accessLevel) {
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

const isNetworkFetchFailure = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? `${error.name || ""} ${error.message || ""}`.toLowerCase()
      : String(error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed")
  );
};

const isTimeoutFailure = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? `${error.name || ""} ${error.message || ""}`.toLowerCase()
      : String(error || "").toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout")
  );
};

const isRecoverableAccessCheckFailure = (error: unknown): boolean => {
  return isNetworkFetchFailure(error) || isTimeoutFailure(error);
};

const runAccessQuery = <T,>(
  requestFactory: () => Promise<T>,
  timeoutMessage: string,
): Promise<T> =>
  withExponentialBackoff(
    () => withTimeout(requestFactory, ACCESS_CHECK_TIMEOUT_MS, timeoutMessage),
    {
      maxRetries: ACCESS_CHECK_RETRY_MAX,
      shouldRetry: isRetryableError,
    },
  );

export function OrganizationLayout({ children }: OrganizationLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const organizationSeo = <PrivatePageSeo title="Panel Organisasi | AbsensiKu" />;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenant_id");
  const isEmbeddedFromHrOverlay = searchParams.get(ORG_HR_EMBED_PARAM) === "1";
  const isEmbeddedFromPayrollOverlay = searchParams.get(ORG_PAYROLL_EMBED_PARAM) === "1";
  const orgHrOverlayTarget = location.pathname.startsWith("/org/hr")
    ? getOrgHrOverlayTarget(searchParams.get(ORG_HR_OVERLAY_PARAM))
    : null;
  const orgPayrollOverlayTarget = location.pathname.startsWith("/org/payroll")
    ? getOrgPayrollOverlayTarget(searchParams.get(ORG_PAYROLL_OVERLAY_PARAM))
    : null;
  const cachedAccessRef = useRef<OrgAccessCacheEntry | null>(readOrgAccessCache());
  const cachedAccess = cachedAccessRef.current;
  const isCheckingAccessRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(cachedAccess?.userId || null);
  const [accessLevel, setAccessLevel] = useState<OrgAccessLevel>(cachedAccess?.accessLevel || "operator");
  const [workspaceModules, setWorkspaceModules] = useState<OrgWorkspaceModules>(DEFAULT_ORG_WORKSPACE_MODULES);
  const [workspaceAccessState, setWorkspaceAccessState] = useState<TenantHrPayrollAccessState | null>(null);
  const [isWorkspaceStateLoading, setIsWorkspaceStateLoading] = useState(false);
  const [isFirstRunStateLoading, setIsFirstRunStateLoading] = useState(false);
  const [isProfileCompleteState, setIsProfileCompleteState] = useState(true);
  const [isOnboardingCompleteState, setIsOnboardingCompleteState] = useState<boolean | null>(null);
  const firstRunRedirectRef = useRef<string | null>(null);
  const [menuUserInfo, setMenuUserInfo] = useState<MenuUserInfo>({
    name: "Pengguna",
    email: "-",
    avatarUrl: null,
  });

  const persistOrgAccessCache = useCallback((entry: Omit<OrgAccessCacheEntry, "checkedAt">) => {
    writeOrgAccessCache(entry);
    cachedAccessRef.current = {
      ...entry,
      checkedAt: Date.now(),
    };
  }, []);

  const resetOrgAccessCache = useCallback(() => {
    clearOrgAccessCache();
    cachedAccessRef.current = null;
  }, []);

  const navigateWithHrOverlay = useCallback(
    (target: string) => {
      navigate(buildOrgHrOverlayHref(location.pathname, location.search, target));
    },
    [location.pathname, location.search, navigate],
  );

  const navigateWorkspace = useCallback(
    (workspacePath: string) => {
      if (orgPayrollOverlayTarget && workspacePath.startsWith("/org/payroll")) {
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete(ORG_HR_OVERLAY_PARAM);
        nextSearchParams.set(ORG_PAYROLL_OVERLAY_PARAM, orgPayrollOverlayTarget);
        const nextSearch = nextSearchParams.toString();
        navigate(nextSearch ? `${workspacePath}?${nextSearch}` : workspacePath);
        return;
      }
      if (orgHrOverlayTarget && workspacePath.startsWith("/org/hr")) {
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete(ORG_PAYROLL_OVERLAY_PARAM);
        nextSearchParams.set(ORG_HR_OVERLAY_PARAM, orgHrOverlayTarget);
        const nextSearch = nextSearchParams.toString();
        navigate(nextSearch ? `${workspacePath}?${nextSearch}` : workspacePath);
        return;
      }
      navigate(workspacePath);
    },
    [navigate, orgHrOverlayTarget, orgPayrollOverlayTarget, searchParams],
  );

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
    // Operator HR hanya diizinkan ke workspace bantuan/tiket, bukan modul HR penuh.
    if (pathname.startsWith("/org/hr/help")) return true;
    if (pathname.startsWith("/org/hr")) return false;
    if (pathname.startsWith("/org/payroll")) return false;
    if (pathname.startsWith("/org/onboarding")) return false;
    if (pathname.startsWith("/org/audit-log")) return false;
    if (pathname.startsWith("/org/invitations")) return false;
    if (pathname.startsWith("/org/employees")) return false;

    return allowedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }, []);

  const checkAccess = useCallback(async () => {
    if (isCheckingAccessRef.current) return;
    isCheckingAccessRef.current = true;
    let sessionUserId: string | null = null;
    try {
      const { data: { user } } = await runAccessQuery(
        () => Promise.resolve(supabase.auth.getUser()),
        "Timeout verifikasi sesi organisasi",
      );
      
      if (!user) {
        resetOrgAccessCache();
        // Tidak ada session - redirect ke login tanpa pesan error
        navigate("/org/login", { replace: true });
        return;
      }
      sessionUserId = user.id;
      setCurrentUserId(user.id);

      const metadata = user.user_metadata as Record<string, unknown> | null;
      const metadataName =
        (typeof metadata?.name === "string" && metadata.name.trim()) ||
        (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
        "";
      const metadataAvatar = typeof metadata?.avatar_url === "string" ? metadata.avatar_url : null;

      // Check user roles
      const { data: roles, error: rolesError } = await runAccessQuery(
        () => Promise.resolve(
          supabase
            .from("user_roles")
            .select("role, tenant_id, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
        ),
        "Timeout membaca role organisasi",
      );
      if (rolesError) throw rolesError;

      const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
      const hasAdminInstansiRole = roles?.some((r) => r.role === "admin_instansi") || false;
      const hasOperatorRole = roles?.some((r) => r.role === "atasan") || false;
      const hasPegawaiRole = roles?.some((r) => r.role === "pegawai") || false;
      const operatorRole = roles?.find((r) => r.role === "atasan" && r.tenant_id);
      const hasAdminAccess = isSuperAdmin || hasAdminInstansiRole;
      const roleLabel = hasAdminAccess ? "Admin Organisasi" : hasOperatorRole ? "Operator" : "Pegawai";
      setMenuUserInfo({
        name: metadataName || roleLabel,
        email: user.email || "-",
        avatarUrl: metadataAvatar,
      });
      const resolvedAdminTenantId = hasAdminInstansiRole
        ? await resolveOrgTenantIdForUser(user.id, { roleRows: roles })
        : null;
      let resolvedTenantId =
        resolvedAdminTenantId ||
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
        const { data: employeeRows, error: employeeError } = await runAccessQuery(
          () => Promise.resolve(
            supabase
              .from("employees")
              .select("tenant_id, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1),
          ),
          "Timeout menentukan tenant operator",
        );
        if (employeeError) throw employeeError;
        resolvedTenantId = employeeRows?.[0]?.tenant_id || null;
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
        const { data: tenantData, error: tenantError } = await runAccessQuery(
          () => Promise.resolve(
            supabase
              .from("tenants")
              .select("name, organization_type, logo_url, pic_name, pic_whatsapp, address")
              .eq("id", resolvedTenantId)
              .maybeSingle()
          ),
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
          setIsProfileCompleteState(
            isOrgProfileComplete({
              pic_name: tenantData.pic_name,
              pic_whatsapp: tenantData.pic_whatsapp,
              address: tenantData.address,
            }),
          );
          persistOrgAccessCache({
            userId: user.id,
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
          setIsProfileCompleteState(false);
          persistOrgAccessCache({
            userId: user.id,
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
        resetOrgAccessCache();
        setAccessLevel("admin");
        setActiveTenantId(null);
        setCurrentUserId(user.id);
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
      resetOrgAccessCache();
      if (hasPegawaiRole) {
        toast.info("Anda dialihkan ke dashboard pegawai.");
        navigate("/employee/dashboard", { replace: true });
      } else {
        toast.info("Akun tidak memiliki akses admin.");
        navigate("/employee/dashboard", { replace: true });
      }
    } catch (error) {
      const cachedAccessEntry = cachedAccessRef.current;
      if (
        cachedAccessEntry &&
        sessionUserId &&
        cachedAccessEntry.userId === sessionUserId &&
        isRecoverableAccessCheckFailure(error)
      ) {
        setAccessLevel(cachedAccessEntry.accessLevel);
        setActiveTenantId(cachedAccessEntry.tenantId);
        setCurrentUserId(cachedAccessEntry.userId);
        setTenant({
          name: cachedAccessEntry.tenantName,
          organization_type: cachedAccessEntry.tenantType,
          logo_url: cachedAccessEntry.tenantLogoUrl || null,
        });
        toast.warning("Koneksi ke server sedang tidak stabil. Mode cache sementara diaktifkan.");
      } else {
        resetOrgAccessCache();
        setActiveTenantId(null);
        setCurrentUserId(null);
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
      }
    } finally {
      isCheckingAccessRef.current = false;
      setIsLoading(false);
    }
  }, [navigate, persistOrgAccessCache, queryTenantId, resetOrgAccessCache]);

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

    const isHrPath = location.pathname.startsWith("/org/hr");
    toast.info(isHrPath ? "Operator HR dibatasi ke FAQ dan tiket bantuan HR." : "Akses operator dibatasi ke modul operasional.");
    const fallbackPath = location.pathname.startsWith("/org/hr") ? "/org/hr/help/tickets" : "/org/leave/requests";
    navigate(fallbackPath, { replace: true });
  }, [accessLevel, isLoading, isOperatorAllowedPath, location.pathname, navigate]);

  useEffect(() => {
    if (!activeTenantId || accessLevel !== "admin") {
      setWorkspaceModules(DEFAULT_ORG_WORKSPACE_MODULES);
      setWorkspaceAccessState(null);
      setIsWorkspaceStateLoading(false);
      return;
    }

    let cancelled = false;
    setIsWorkspaceStateLoading(true);
    const loadWorkspaceState = async () => {
      try {
        const [setting, accessState] = await Promise.all([
          withTimeout(
            Promise.resolve(fetchTenantOrgWorkspaceModules(activeTenantId)),
            ACCESS_CHECK_TIMEOUT_MS,
            "Timeout membaca pengaturan workspace organisasi",
          ),
          withTimeout(
            Promise.resolve(fetchTenantHrPayrollAccessState(activeTenantId)),
            ACCESS_CHECK_TIMEOUT_MS,
            "Timeout membaca policy akses HR/Payroll organisasi",
          ),
        ]);
        if (!cancelled) {
          setWorkspaceModules(setting.modules);
          setWorkspaceAccessState(accessState);
        }
      } catch (error) {
        reportError(error, "org.layout.fetch_workspace_modules", { tenant_id: activeTenantId });
        if (!cancelled) {
          setWorkspaceModules(DEFAULT_ORG_WORKSPACE_MODULES);
          setWorkspaceAccessState(null);
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceStateLoading(false);
        }
      }
    };

    void loadWorkspaceState();
    return () => {
      cancelled = true;
    };
  }, [accessLevel, activeTenantId]);

  useEffect(() => {
    if (!activeTenantId || accessLevel !== "admin") {
      firstRunRedirectRef.current = null;
      setIsFirstRunStateLoading(false);
      setIsProfileCompleteState(true);
      setIsOnboardingCompleteState(null);
      return;
    }

    let cancelled = false;
    setIsFirstRunStateLoading(true);
    const loadFirstRunState = async () => {
      try {
        const onboardingCounts = await withTimeout(
          Promise.resolve(fetchOrgOnboardingCounts(activeTenantId)),
          ACCESS_CHECK_TIMEOUT_MS,
          "Timeout membaca checklist setup awal organisasi",
        );
        if (!cancelled) {
          setIsOnboardingCompleteState(isOrgOnboardingComplete(onboardingCounts));
        }
      } catch (error) {
        reportError(error, "org.layout.fetch_first_run_state", { tenant_id: activeTenantId });
        if (!cancelled) {
          setIsOnboardingCompleteState(null);
        }
      } finally {
        if (!cancelled) {
          setIsFirstRunStateLoading(false);
        }
      }
    };

    void loadFirstRunState();
    return () => {
      cancelled = true;
    };
  }, [accessLevel, activeTenantId]);

  useEffect(() => {
    const handleWorkspaceVisibilityEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const parsedModules = parseOrgWorkspaceModulesSetting(detail);
      setWorkspaceModules(parsedModules);
    };
    window.addEventListener(ORG_WORKSPACE_MODULES_UPDATED_EVENT, handleWorkspaceVisibilityEvent);
    return () => window.removeEventListener(ORG_WORKSPACE_MODULES_UPDATED_EVENT, handleWorkspaceVisibilityEvent);
  }, []);

  const firstRunRedirectTarget =
    !isLoading && !isFirstRunStateLoading
      ? resolveOrgFirstRunRedirect({
          pathname: location.pathname,
          accessLevel,
          profileComplete: isProfileCompleteState,
          onboardingComplete: isOnboardingCompleteState,
        })
      : null;

  useEffect(() => {
    if (!firstRunRedirectTarget) {
      firstRunRedirectRef.current = null;
      return;
    }

    const redirectKey = `${location.pathname}->${firstRunRedirectTarget}`;
    if (firstRunRedirectRef.current === redirectKey) return;
    firstRunRedirectRef.current = redirectKey;

    toast.info(
      firstRunRedirectTarget === "/org/profile/setup"
        ? "Lengkapi profil organisasi dulu sebelum memakai dashboard admin."
        : "Selesaikan 5 langkah setup awal dulu sebelum memakai dashboard utama.",
    );
    navigate(firstRunRedirectTarget, { replace: true });
  }, [firstRunRedirectTarget, location.pathname, navigate]);

  useEffect(() => {
    if (isLoading || accessLevel !== "admin" || isWorkspaceStateLoading) return;

    if (location.pathname.startsWith("/org/hr") && !workspaceModules.hr) {
      toast.info("Workspace HR sedang dinonaktifkan untuk organisasi ini.");
      navigate("/org", { replace: true });
      return;
    }
    if (location.pathname.startsWith("/org/payroll") && !workspaceModules.payroll) {
      toast.info("Workspace Payroll sedang dinonaktifkan untuk organisasi ini.");
      navigate("/org", { replace: true });
    }
  }, [accessLevel, isLoading, isWorkspaceStateLoading, location.pathname, navigate, workspaceModules.hr, workspaceModules.payroll]);

  const isOperatorBlockedPath =
    !isLoading && accessLevel === "operator" && !isOperatorAllowedPath(location.pathname);
  const isWorkspaceBlockedPath =
    !isLoading &&
    !isWorkspaceStateLoading &&
    accessLevel === "admin" &&
    ((location.pathname.startsWith("/org/hr") && !workspaceModules.hr) ||
      (location.pathname.startsWith("/org/payroll") && !workspaceModules.payroll));

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

  const closeOrgHrOverlay = useCallback(() => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete(ORG_HR_OVERLAY_PARAM);
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeOrgPayrollOverlay = useCallback(() => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete(ORG_PAYROLL_OVERLAY_PARAM);
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const headerAvatarLabel = tenant?.name || menuUserInfo.name;
  const headerAvatarUrl = tenant?.logo_url || menuUserInfo.avatarUrl;
  const currentWorkspace: OrgWorkspace = location.pathname.startsWith("/org/hr")
    ? "hr"
    : location.pathname.startsWith("/org/payroll")
      ? "payroll"
      : "absensi";
  const workspaceOptions = accessLevel === "admin"
    ? [
        { key: "absensi" as const, label: "Absensi", path: "/org", icon: LayoutDashboard },
        ...(workspaceModules.hr ? [{ key: "hr" as const, label: "HR", path: "/org/hr", icon: BriefcaseBusiness }] : []),
        ...(workspaceModules.payroll
          ? [{ key: "payroll" as const, label: "Payroll", path: "/org/payroll", icon: Receipt }]
          : []),
      ]
    : [{ key: "absensi" as const, label: "Absensi", path: "/org", icon: LayoutDashboard }];
  const activeWorkspace = workspaceOptions.find((item) => item.key === currentWorkspace) ?? workspaceOptions[0];
  const currentWorkspaceScope = currentWorkspace === "hr" || currentWorkspace === "payroll" ? currentWorkspace : null;
  const currentWorkspaceMode: WorkspaceAccessMode | null =
    currentWorkspace === "hr"
      ? workspaceAccessState?.hrMode ?? null
      : currentWorkspace === "payroll"
        ? workspaceAccessState?.payrollMode ?? null
        : null;
  const currentWorkspaceStage =
    currentWorkspaceScope
      ? workspaceAccessState?.stage ?? null
      : null;
  const isWorkspaceReadonly = currentWorkspaceMode === "readonly";
  const isAdminOperatorSettingsPath = location.pathname === "/org/settings/admin-operator";
  const shouldRenderHardRequestNotifications =
    location.pathname !== "/org/billing" &&
    !location.pathname.startsWith("/org/billing/") &&
    !location.pathname.startsWith("/org/hr") &&
    !isAdminOperatorSettingsPath &&
    !isEmbeddedFromHrOverlay &&
    (accessLevel === "admin" || isOperatorAllowedPath(location.pathname));
  const shouldRenderFloatingWhatsApp =
    !isAdminOperatorSettingsPath && !isEmbeddedFromHrOverlay && !isEmbeddedFromPayrollOverlay;
  const isFirstRunGateLoading = !isLoading && accessLevel === "admin" && isFirstRunStateLoading;

  if (isLoading || isFirstRunGateLoading) {
    if (isEmbeddedFromHrOverlay) {
      return (
        <>
          {organizationSeo}
          <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </>
      );
    }
    return (
      <SidebarProvider>
        {organizationSeo}
        <div className="min-h-screen flex w-full">
          <OrganizationSidebar
            organizationName={tenant?.name}
            organizationType={tenant?.organization_type}
            accessLevel={accessLevel}
            workspaceModules={workspaceModules}
            activeTenantId={activeTenantId}
            currentUserId={currentUserId}
            workspaceAccessState={workspaceAccessState}
          />
          <main className="flex-1 overflow-auto">
            <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-4 min-w-0">
                  <SidebarTrigger />
                  <div className="h-6 w-px bg-border" />
                  <Button variant="outline" size="sm" disabled className="gap-2">
                    <activeWorkspace.icon className="h-4 w-4" />
                    {activeWorkspace.label}
                  </Button>
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

  if (isEmbeddedFromHrOverlay || isEmbeddedFromPayrollOverlay) {
    if (isWorkspaceBlockedPath || isOperatorBlockedPath) {
      return (
        <>
          {organizationSeo}
          <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center bg-background p-6">
            <div className="w-full rounded-xl border border-amber-200 bg-amber-50/70 p-5">
              <h2 className="text-base font-semibold text-amber-900">
                {isWorkspaceBlockedPath ? "Workspace Dinonaktifkan" : "Akses Halaman Dibatasi"}
              </h2>
              <p className="mt-2 text-sm text-amber-800">
                {isWorkspaceBlockedPath
                  ? "Workspace yang Anda buka sedang nonaktif untuk organisasi ini."
                  : location.pathname.startsWith("/org/hr")
                    ? "Operator HR hanya dapat mengakses FAQ HR dan Tiket HR pada fase aktivasi awal."
                    : "Role Operator hanya dapat mengakses modul operasional yang diizinkan."}
              </p>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        {organizationSeo}
        <div className="min-h-screen bg-background p-6">
          {currentWorkspaceScope && currentWorkspaceStage && currentWorkspaceMode ? (
            <div className="mb-4">
              <WorkspaceAccessStatusBanner
                scope={currentWorkspaceScope}
                stage={currentWorkspaceStage}
                mode={currentWorkspaceMode}
                onOpenBilling={() => navigate("/org/billing")}
              />
            </div>
          ) : null}
          <WorkspaceReadonlyShield active={isWorkspaceReadonly}>{children}</WorkspaceReadonlyShield>
        </div>
      </>
    );
  }

  return (
    <SidebarProvider>
      {organizationSeo}
      <div className="min-h-screen flex w-full">
          <OrganizationSidebar 
            organizationName={tenant?.name} 
            organizationType={tenant?.organization_type}
            accessLevel={accessLevel}
            workspaceModules={workspaceModules}
            activeTenantId={activeTenantId}
            currentUserId={currentUserId}
            workspaceAccessState={workspaceAccessState}
          />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-4 min-w-0">
                <SidebarTrigger />
                <div className="h-6 w-px bg-border" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <activeWorkspace.icon className="h-4 w-4" />
                      {activeWorkspace.label}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {workspaceOptions.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace.key}
                        onClick={() => navigateWorkspace(workspace.path)}
                        className={workspace.key === activeWorkspace.key ? "font-medium" : undefined}
                      >
                        <workspace.icon className="mr-2 h-4 w-4" />
                        {workspace.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-sm text-muted-foreground">
                  {accessLevel === "admin" ? "Admin Organisasi" : "Operator"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <NotificationDropdown />
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
                    {currentWorkspace === "hr" ? (
                      <>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/hr/settings")}>Pengaturan HR</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/hr/help/faq")}>FAQ HR</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/hr/help/tickets")}>Tiket HR</DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/profile")}>Profil Saya</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/profile?section=contact")}>Kontak</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/profile?section=security")}>Keamanan Akun</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/notifications")}>Riwayat Email</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/profile")}>Profil Anda</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/profile?section=password")}>Ganti Kata Sandi</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigateWithHrOverlay("/org/settings?tab=security")}>Security Settings</DropdownMenuItem>
                      </>
                    )}
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
            </div>
          </header>
          <div className="p-6">
            {isWorkspaceBlockedPath ? (
              <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50/70 p-5">
                <h2 className="text-base font-semibold text-amber-900">Workspace Dinonaktifkan</h2>
                <p className="mt-2 text-sm text-amber-800">
                  Workspace yang Anda buka sedang nonaktif. Untuk menghindari beban query yang tidak perlu, halaman ini tidak dimuat.
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => navigate("/org", { replace: true })}
                >
                  Kembali ke Absensi
                </Button>
              </div>
            ) : isOperatorBlockedPath ? (
              <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50/70 p-5">
                <h2 className="text-base font-semibold text-amber-900">Akses Halaman Dibatasi</h2>
                <p className="mt-2 text-sm text-amber-800">
                  {location.pathname.startsWith("/org/hr")
                    ? "Operator HR hanya dapat mengakses FAQ HR dan Tiket HR pada fase aktivasi awal."
                    : "Role Operator hanya dapat mengakses modul operasional seperti Permohonan, Laporan Permohonan, Bantuan, dan Profil."}
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() =>
                    navigate(location.pathname.startsWith("/org/hr") ? "/org/hr/help/tickets" : "/org/leave/requests", {
                      replace: true,
                    })
                  }
                >
                  Buka Halaman yang Diizinkan
                </Button>
              </div>
            ) : (
              <>
                {currentWorkspaceScope && currentWorkspaceStage && currentWorkspaceMode ? (
                  <WorkspaceAccessStatusBanner
                    scope={currentWorkspaceScope}
                    stage={currentWorkspaceStage}
                    mode={currentWorkspaceMode}
                    onOpenBilling={() => navigate("/org/billing")}
                  />
                ) : null}
                <WorkspaceReadonlyShield active={isWorkspaceReadonly} className="space-y-6">
                  {children}
                </WorkspaceReadonlyShield>
                {location.pathname.startsWith("/org/hr") ? <OrgHRPageGuide pathname={location.pathname} /> : null}
              </>
            )}
          </div>
        </main>
      </div>
      {shouldRenderFloatingWhatsApp ? (
        <FloatingWhatsApp
          settingKey="floating_whatsapp_org_admin"
          fallbackSettingKeys={["floating_whatsapp", "floating_whatsapp_public"]}
          panelTitle="Dukungan Admin"
          panelSubtitle="Layanan pelanggan & bantuan teknis"
        />
      ) : null}
      {shouldRenderHardRequestNotifications ? (
        <HardRequestNotifications tenantId={activeTenantId} />
      ) : null}
      <Dialog open={Boolean(orgHrOverlayTarget)} onOpenChange={(open) => !open && closeOrgHrOverlay()}>
        <DialogContent className="flex h-[88vh] w-[min(1200px,96vw)] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle>Halaman Organisasi Dibuka sebagai Overlay</DialogTitle>
                <DialogDescription className="mt-1">
                  Route organisasi tetap dibuka tanpa meninggalkan workspace HR. Gunakan tampilan penuh hanya jika memang perlu berpindah konteks.
                </DialogDescription>
              </div>
              {orgHrOverlayTarget ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    closeOrgHrOverlay();
                    navigate(orgHrOverlayTarget);
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Buka Penuh
                </Button>
              ) : null}
            </div>
          </DialogHeader>
          {orgHrOverlayTarget ? (
            <iframe
              key={orgHrOverlayTarget}
              src={buildOrgHrEmbeddedTarget(orgHrOverlayTarget)}
              title={`Overlay ${orgHrOverlayTarget}`}
              className="min-h-0 flex-1 bg-background"
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(orgPayrollOverlayTarget)} onOpenChange={(open) => !open && closeOrgPayrollOverlay()}>
        <DialogContent className="flex h-[88vh] w-[min(1200px,96vw)] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle>Halaman Payroll Dibuka sebagai Overlay</DialogTitle>
                <DialogDescription className="mt-1">
                  Anda tetap berada di workspace payroll. Gunakan tampilan penuh hanya jika perlu berpindah konteks.
                </DialogDescription>
              </div>
              {orgPayrollOverlayTarget ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    const target = orgPayrollOverlayTarget;
                    const nextSearchParams = new URLSearchParams(location.search);
                    nextSearchParams.delete(ORG_PAYROLL_OVERLAY_PARAM);
                    setSearchParams(nextSearchParams);
                    navigate(target);
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Buka Penuh
                </Button>
              ) : null}
            </div>
          </DialogHeader>
          {orgPayrollOverlayTarget ? (
            <iframe
              key={orgPayrollOverlayTarget}
              src={buildOrgPayrollEmbeddedTarget(orgPayrollOverlayTarget)}
              title={`Overlay ${orgPayrollOverlayTarget}`}
              className="min-h-0 flex-1 bg-background"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
