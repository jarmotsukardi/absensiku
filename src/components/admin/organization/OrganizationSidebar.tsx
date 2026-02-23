import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  FileText,
  Calendar,
  MapPin,
  LogOut,
  ChevronRight,
  ChevronDown,
  HelpCircle,
  Briefcase,
  Clock,
  UserCheck,
  ClipboardList,
  AlertTriangle,
  FileSpreadsheet,
  FolderTree,
  Timer,
  Database,
  LandmarkIcon,
  ShieldCheck,
  Newspaper,
  Home,
  Bell,
  Receipt,
  Wand2,
  LifeBuoy,
  Ticket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchOrgOnboardingCounts } from "@/lib/orgOnboardingTemplates";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface SubMenuItem {
  title: string;
  path: string;
  icon: React.ElementType;
}

interface MenuItem {
  title: string;
  icon: React.ElementType;
  path?: string;
  subItems?: SubMenuItem[];
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

type OrgSidebarAccessLevel = "admin" | "operator";

const ORG_ONBOARDING_MODULE_TOTAL = 7;
const SIDEBAR_ONBOARDING_TIMEOUT_MS = 10000;

const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Utama",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, path: "/org" },
      { title: "Setup Awal", icon: Wand2, path: "/org/onboarding" },
    ],
  },
  {
    label: "Master Data",
    items: [
      { 
        title: "Master Data", 
        icon: Database, 
        subItems: [
          { title: "Data OPD", path: "/org/master/opd", icon: FolderTree },
          { title: "Admin OPD", path: "/org/master/opd-admins", icon: ShieldCheck },
          { title: "Jenis Instansi", path: "/org/master/institution-types", icon: LandmarkIcon },
          { title: "Satuan Kerja", path: "/org/master/work-units", icon: Building2 },
          { title: "Lokasi Kerja", path: "/org/master/work-locations", icon: MapPin },
          { title: "Jabatan", path: "/org/master/positions", icon: Briefcase },
        ]
      },
      { 
        title: "Jadwal Kerja", 
        icon: Clock, 
        subItems: [
          { title: "Libur Nasional", path: "/org/schedule/national-holidays", icon: Calendar },
          { title: "Data Libur", path: "/org/schedule/holidays", icon: Calendar },
          { title: "Jam Kerja", path: "/org/schedule/work-hours", icon: Timer },
          { title: "Pengaturan Lembur", path: "/org/schedule/overtime", icon: Timer },
          { title: "Batas Absen", path: "/org/schedule/absence-limits", icon: AlertTriangle },
          { title: "Jadwal WFH", path: "/org/schedule/wfh", icon: Home },
        ]
      },
      { 
        title: "Data Pegawai", 
        icon: Users,
        path: "/org/employees",
      },
      { title: "Undangan Pegawai", icon: UserCheck, path: "/org/invitations" },
    ],
  },
  {
    label: "Permohonan",
    items: [
      { title: "Permohonan", icon: ClipboardList, path: "/org/leave" },
    ],
  },
  {
    label: "Laporan",
    items: [
      { title: "Laporan Absensi & Rekap", icon: FileSpreadsheet, path: "/org/reports/attendance-recap" },
      { title: "Laporan Permohonan", icon: FileText, path: "/org/reports" },
    ],
  },
  {
    label: "Konten",
    items: [
      { title: "Pengumuman", icon: Newspaper, path: "/org/news" },
      { title: "Notifikasi", icon: Bell, path: "/org/notifications" },
    ],
  },
  {
    label: "Billing",
    items: [
      { title: "Billing", icon: Receipt, path: "/org/billing" },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { title: "Pengaturan Umum", icon: Settings, path: "/org/settings" },
      { title: "Admin & Operator", icon: Users, path: "/org/settings/admin-operator" },
      { title: "Log Aktivitas", icon: ClipboardList, path: "/org/audit-log" },
    ],
  },
  {
    label: "Bantuan",
    items: [
      {
        title: "FAQ, Bantuan & Buat Tiket",
        icon: HelpCircle,
        subItems: [
          { title: "FAQ", path: "/org/help/faq", icon: HelpCircle },
          { title: "Bantuan", path: "/org/help/support", icon: LifeBuoy },
          { title: "Buat Tiket", path: "/org/help/tickets", icon: Ticket },
        ],
      },
    ],
  },
];

interface OrganizationSidebarProps {
  organizationName?: string;
  organizationType?: string;
  accessLevel?: OrgSidebarAccessLevel;
}

export function OrganizationSidebar({
  organizationName = "Organisasi",
  organizationType = "Pemerintah Daerah",
  accessLevel = "admin",
}: OrganizationSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [onboardingReadyModules, setOnboardingReadyModules] = useState<number | null>(null);
  const [isOnboardingStatusLoading, setIsOnboardingStatusLoading] = useState(false);

  const isActive = (path: string) => {
    if (path === "/org") {
      return location.pathname === "/org";
    }
    if (path === "/org/settings") {
      return location.pathname === "/org/settings";
    }
    if (path === "/org/leave") {
      return (
        location.pathname.startsWith("/org/leave") ||
        location.pathname === "/org/employees/mutations" ||
        location.pathname.startsWith("/org/employees/mutations/")
      );
    }
    if (path === "/org/reports") {
      return ["/org/reports/leave", "/org/reports/overtime", "/org/reports/flexible", "/org/reports/mutations"]
        .some((reportPath) => location.pathname === reportPath || location.pathname.startsWith(`${reportPath}/`));
    }
    if (path === "/org/reports/attendance-recap") {
      return ["/org/reports/attendance", "/org/reports/recap"]
        .some((reportPath) => location.pathname === reportPath || location.pathname.startsWith(`${reportPath}/`));
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const isSubMenuActive = (subItems: SubMenuItem[]) => {
    return subItems.some(item => isActive(item.path));
  };

  const toggleMenu = (title: string) => {
    setOpenMenus(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/org/login");
  };

  const menuGroups = accessLevel === "admin"
    ? MENU_GROUPS
    : MENU_GROUPS
        .map((group) => {
          if (group.label === "Utama") {
            return {
              ...group,
              items: group.items.filter((item) => item.path !== "/org/onboarding"),
            };
          }
          if (group.label === "Permohonan") {
            return group;
          }
          if (group.label === "Laporan") {
            return {
              ...group,
              items: group.items.filter((item) => item.path === "/org/reports"),
            };
          }
          if (group.label === "Pengaturan") {
            return { ...group, items: [] };
          }
          if (group.label === "Bantuan") {
            return group;
          }
          return { ...group, items: [] };
        })
        .filter((group) => group.items.length > 0);

  useEffect(() => {
    if (accessLevel !== "admin") return;

    let cancelled = false;
    const loadOnboardingStatus = async () => {
      setIsOnboardingStatusLoading(true);
      try {
        const tenantId = await withTimeout(
          Promise.resolve(resolveOrgTenantId()),
          SIDEBAR_ONBOARDING_TIMEOUT_MS,
          "Timeout menentukan tenant onboarding sidebar",
        );
        if (!tenantId) {
          if (!cancelled) setOnboardingReadyModules(0);
          return;
        }
        const counts = await withTimeout(
          Promise.resolve(fetchOrgOnboardingCounts(tenantId)),
          SIDEBAR_ONBOARDING_TIMEOUT_MS,
          "Timeout membaca status onboarding sidebar",
        );
        const readyCount = Object.values(counts).filter((value) => value > 0).length;
        if (!cancelled) {
          setOnboardingReadyModules(readyCount);
        }
      } catch (error) {
        reportError(error, "org.sidebar.fetch_onboarding_status");
        if (!cancelled) {
          setOnboardingReadyModules(0);
        }
      } finally {
        if (!cancelled) {
          setIsOnboardingStatusLoading(false);
        }
      }
    };

    void loadOnboardingStatus();
    return () => {
      cancelled = true;
    };
  }, [accessLevel]);

  const hasOnboardingIncomplete =
    onboardingReadyModules !== null && onboardingReadyModules < ORG_ONBOARDING_MODULE_TOTAL;
  const onboardingStatusLabel =
    onboardingReadyModules === null || isOnboardingStatusLoading
      ? "MEMUAT"
      : hasOnboardingIncomplete
        ? "TIDAK SIAP"
        : "SIAP";

  const renderMenuItem = (item: MenuItem) => {
    if (item.subItems) {
      const isOpen = openMenus[item.title] || isSubMenuActive(item.subItems);
      
      return (
        <Collapsible key={item.title} open={isOpen} onOpenChange={() => toggleMenu(item.title)}>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                tooltip={item.title}
                className={cn(
                  "transition-all",
                  isSubMenuActive(item.subItems) && "bg-sidebar-accent text-sidebar-primary"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
                {!isCollapsed && (
                  isOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )
                )}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.subItems.map((subItem) => (
                  <SidebarMenuSubItem key={subItem.path}>
                    <SidebarMenuSubButton
                      onClick={() => handleNavigation(subItem.path)}
                      isActive={isActive(subItem.path)}
                      className={cn(
                        "transition-all cursor-pointer",
                        isActive(subItem.path) && "bg-sidebar-accent text-sidebar-primary"
                      )}
                    >
                      <subItem.icon className="h-3 w-3" />
                      <span>{subItem.title}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton
          tooltip={item.title}
          isActive={isActive(item.path!)}
          onClick={() => handleNavigation(item.path!)}
          className={cn(
            "transition-all",
            isActive(item.path!) && "bg-sidebar-accent text-sidebar-primary"
          )}
        >
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
          {isActive(item.path!) && !isCollapsed && (
            <ChevronRight className="ml-auto h-4 w-4" />
          )}
        </SidebarMenuButton>
        {item.path === "/org/onboarding" && !isCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleNavigation("/org/onboarding")}
                className={cn(
                  "mt-1 ml-7 flex w-[calc(100%-1.75rem)] items-center justify-between rounded-md border px-2 py-1 text-[11px] transition-colors",
                  hasOnboardingIncomplete
                    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                <span className="truncate">Status Setup</span>
                <Badge
                  className={cn(
                    "h-5 px-1.5 text-[10px] text-white",
                    hasOnboardingIncomplete
                      ? "bg-red-600 hover:bg-red-600 animate-pulse"
                      : "bg-emerald-600 hover:bg-emerald-600"
                  )}
                >
                  {onboardingStatusLabel}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {onboardingReadyModules ?? 0}/{ORG_ONBOARDING_MODULE_TOTAL} modul siap. Klik untuk buka Setup Awal.
            </TooltipContent>
          </Tooltip>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Header */}
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sidebar-foreground truncate">{organizationName}</span>
              <span className="text-xs text-sidebar-foreground/70">{organizationType}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Main Content */}
      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-[10px] font-semibold tracking-wider">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => renderMenuItem(item))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      {/* Footer */}
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Keluar"
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Keluar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
