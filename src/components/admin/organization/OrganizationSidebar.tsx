import { useEffect, useMemo, useState } from "react";
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
  Activity,
  ListChecks,
  Upload,
  Home,
  Bell,
  Receipt,
  Wand2,
  LifeBuoy,
  Ticket,
  GraduationCap,
  Award,
  BrainCircuit,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchOrgOnboardingCounts, type OrgOnboardingCounts } from "@/lib/orgOnboardingTemplates";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  buildHrSidebarGroupsStorageKey,
  clearHrSidebarGroupsState,
  readHrSidebarGroupsState,
  writeHrSidebarGroupsState,
} from "@/lib/hrSidebarPreferences";
import { reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";
import { toast } from "sonner";
import {
  DEFAULT_ORG_MASTER_DATA_MODULES,
  fetchTenantOrgMasterDataModules,
  ORG_MASTER_DATA_MODULES_UPDATED_EVENT,
  ORG_MASTER_DATA_MODULE_PATH_MAP,
  parseOrgMasterDataModulesSetting,
  type OrgMasterDataModules,
} from "@/lib/orgMasterDataModules";
import {
  DEFAULT_ORG_WORKSPACE_MODULES,
  type OrgWorkspaceModules,
} from "@/lib/orgWorkspaceModules";
import {
  getAccessStageLabel,
  getWorkspaceModeLabel,
  type TenantHrPayrollAccessState,
} from "@/lib/hrPayrollAccessPolicy";
import {
  getHrWorkspaceRouteDefinition,
  HR_FOCUSED_SIDEBAR_GROUPS,
  HR_OVERVIEW_SIDEBAR_SECTIONS,
  type HrSidebarIconKey,
  type HrSidebarItemDefinition,
} from "@/lib/hrWorkspaceRegistry";

interface SubMenuItem {
  title: string;
  path: string;
  icon: React.ElementType;
  badgeLabel?: string;
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

interface PayrollMenuSection {
  title: string;
  icon: React.ElementType;
  paths: string[];
}

type OrgSidebarAccessLevel = "admin" | "operator";
type OrgWorkspace = "absensi" | "hr" | "payroll";

const SIDEBAR_ONBOARDING_TIMEOUT_MS = 10000;
const ORG_ONBOARDING_CHECKLIST_KEYS: Array<keyof OrgOnboardingCounts> = [
  "opd",
  "work_units",
  "offices",
  "work_hours",
  "absence_limits",
];

const getOnboardingModuleTotal = () => ORG_ONBOARDING_CHECKLIST_KEYS.length;

const getOnboardingReadyModules = (counts: OrgOnboardingCounts) =>
  ORG_ONBOARDING_CHECKLIST_KEYS.filter((key) => counts[key] > 0).length;

const getHrSidebarBadgeLabel = (path: string): string | undefined => {
  if (!path.startsWith("/org/hr")) return undefined;
  const routeDefinition = getHrWorkspaceRouteDefinition(path);
  if (!routeDefinition) return undefined;
  if (routeDefinition.status === "redirect") return "Alias";
  if (routeDefinition.status === "internal") return "Internal";
  if (routeDefinition.status === "tunda") return "Tunda";
  return undefined;
};

const withHrSidebarBadges = (subItems: SubMenuItem[]): SubMenuItem[] =>
  subItems.map((subItem) => ({
    ...subItem,
    badgeLabel: subItem.badgeLabel || getHrSidebarBadgeLabel(subItem.path),
  }));

const withPayrollSidebarBadges = (subItems: SubMenuItem[]): SubMenuItem[] => subItems;

const HR_SIDEBAR_ICON_MAP: Record<HrSidebarIconKey, React.ElementType> = {
  layout_dashboard: LayoutDashboard,
  building2: Building2,
  users: Users,
  settings: Settings,
  file_text: FileText,
  calendar: Calendar,
  map_pin: MapPin,
  log_out: LogOut,
  help_circle: HelpCircle,
  briefcase: Briefcase,
  clock: Clock,
  user_check: UserCheck,
  clipboard_list: ClipboardList,
  alert_triangle: AlertTriangle,
  file_spreadsheet: FileSpreadsheet,
  folder_tree: FolderTree,
  timer: Timer,
  activity: Activity,
  ticket: Ticket,
  graduation_cap: GraduationCap,
  award: Award,
  brain_circuit: BrainCircuit,
  home: Home,
  list_checks: ListChecks,
};

const buildHrSidebarSubItems = (items: HrSidebarItemDefinition[]): SubMenuItem[] =>
  withHrSidebarBadges(
    items.map((item) => ({
      title: item.title || getHrWorkspaceRouteDefinition(item.path)?.label || item.path,
      path: item.path,
      icon: HR_SIDEBAR_ICON_MAP[item.iconKey],
      badgeLabel: item.badgeLabel,
    })),
  );

const buildHrOverviewMenuItems = (): MenuItem[] =>
  HR_OVERVIEW_SIDEBAR_SECTIONS.map((section) => ({
    title: section.title,
    icon: HR_SIDEBAR_ICON_MAP[section.iconKey],
    subItems: buildHrSidebarSubItems(section.items),
  }));

const buildHrFocusedMenuGroups = (): MenuGroup[] =>
  HR_FOCUSED_SIDEBAR_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      title: item.title || getHrWorkspaceRouteDefinition(item.path)?.label || item.path,
      icon: HR_SIDEBAR_ICON_MAP[item.iconKey],
      path: item.path,
    })),
  }));

const PAYROLL_OVERVIEW_SUB_ITEMS = withPayrollSidebarBadges([
  { title: "Beranda Payroll", path: "/org/payroll", icon: Receipt },
  { title: "Kompensasi Pegawai", path: "/org/payroll/employees", icon: Users },
  { title: "Struktur Organisasi dan Grade", path: "/org/payroll/org-grade", icon: Building2 },
  { title: "Komponen Penghasilan", path: "/org/payroll/income-components", icon: Briefcase },
  { title: "Komponen Potongan", path: "/org/payroll/deduction-components", icon: Briefcase },
  { title: "Kebijakan Payroll", path: "/org/payroll/policies", icon: ClipboardList },
  { title: "Master Kepatuhan Payroll", path: "/org/payroll/compliance-master", icon: ShieldCheck },
  { title: "Periode Payroll", path: "/org/payroll/periods", icon: Calendar },
  { title: "Input Variabel", path: "/org/payroll/variable-input", icon: FileText },
  { title: "Validasi Payroll", path: "/org/payroll/validation", icon: ShieldCheck },
  { title: "Proses Payroll", path: "/org/payroll/run-engine", icon: Timer },
  { title: "Persetujuan Payroll", path: "/org/payroll/approval", icon: UserCheck },
  { title: "Slip Gaji", path: "/org/payroll/slips", icon: FileSpreadsheet },
  { title: "Pembayaran Payroll", path: "/org/payroll/payment", icon: Receipt },
  { title: "Pajak dan Kepatuhan", path: "/org/payroll/tax-compliance", icon: LandmarkIcon },
  { title: "Laporan Payroll", path: "/org/payroll/reports", icon: FileSpreadsheet },
  { title: "Log Audit Payroll", path: "/org/payroll/audit-log", icon: ClipboardList },
  { title: "Hak Akses Payroll", path: "/org/payroll/roles", icon: Settings },
  { title: "Integrasi Payroll", path: "/org/payroll/integrations", icon: Database },
  { title: "Bantuan Payroll", path: "/org/payroll/help", icon: LifeBuoy },
]);

const HRIS_MENU_ITEMS: MenuItem[] = [
  ...buildHrOverviewMenuItems(),
  {
    title: "Payroll",
    icon: Receipt,
    subItems: PAYROLL_OVERVIEW_SUB_ITEMS,
  },
];

const HR_FOCUSED_MENU_GROUPS: MenuGroup[] = buildHrFocusedMenuGroups();

const BASE_MENU_GROUPS: MenuGroup[] = [
  {
    label: "Utama",
    items: [
      { title: "Dasbor", icon: LayoutDashboard, path: "/org" },
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
          { title: "Kategori Pegawai", path: "/org/master/employee-categories", icon: Users },
          { title: "Golongan Pegawai", path: "/org/master/employee-golongan", icon: UserCheck },
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

const PAYROLL_MENU_SECTIONS: PayrollMenuSection[] = [
  {
    title: "Inti",
    icon: LayoutDashboard,
    paths: [
      "/org/payroll",
      "/org/payroll/policies",
      "/org/payroll/periods",
      "/org/payroll/variable-input",
      "/org/payroll/validation",
      "/org/payroll/run-engine",
      "/org/payroll/approval",
      "/org/payroll/reports",
    ],
  },
  {
    title: "Referensi",
    icon: Users,
    paths: ["/org/payroll/employees", "/org/payroll/org-grade"],
  },
  {
    title: "Lanjutan",
    icon: Briefcase,
    paths: [
      "/org/payroll/income-components",
      "/org/payroll/deduction-components",
      "/org/payroll/slips",
      "/org/payroll/payment",
      "/org/payroll/tax-compliance",
      "/org/payroll/audit-log",
      "/org/payroll/integrations",
    ],
  },
  {
    title: "Pengaturan",
    icon: Settings,
    paths: ["/org/payroll/compliance-master", "/org/payroll/roles", "/org/payroll/help"],
  },
];

interface OrganizationSidebarProps {
  organizationName?: string;
  organizationType?: string;
  accessLevel?: OrgSidebarAccessLevel;
  workspaceModules?: OrgWorkspaceModules;
  activeTenantId?: string | null;
  currentUserId?: string | null;
  workspaceAccessState?: TenantHrPayrollAccessState | null;
}

export function OrganizationSidebar({
  organizationName = "Organisasi",
  organizationType = "Pemerintah Daerah",
  accessLevel = "admin",
  workspaceModules = DEFAULT_ORG_WORKSPACE_MODULES,
  activeTenantId = null,
  currentUserId = null,
  workspaceAccessState = null,
}: OrganizationSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [openHrGroups, setOpenHrGroups] = useState<Record<string, boolean>>({});
  const [onboardingReadyModules, setOnboardingReadyModules] = useState<number | null>(null);
  const [onboardingModuleTotal, setOnboardingModuleTotal] = useState<number>(
    getOnboardingModuleTotal()
  );
  const [onboardingCounts, setOnboardingCounts] = useState<OrgOnboardingCounts | null>(null);
  const [isOnboardingStatusLoading, setIsOnboardingStatusLoading] = useState(false);
  const [masterDataModules, setMasterDataModules] = useState(DEFAULT_ORG_MASTER_DATA_MODULES);
  const currentWorkspace: OrgWorkspace = useMemo(() => {
    if (location.pathname.startsWith("/org/hr")) return "hr";
    if (location.pathname.startsWith("/org/payroll")) return "payroll";
    return "absensi";
  }, [location.pathname]);
  const hrSidebarGroupsStorageKey = useMemo(
    () =>
      buildHrSidebarGroupsStorageKey({
        tenantId: activeTenantId,
        userId: currentUserId,
        accessLevel,
      }),
    [accessLevel, activeTenantId, currentUserId],
  );

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

  const isGroupActive = (items: MenuItem[]) =>
    items.some((item) => {
      if (item.path) return isActive(item.path);
      if (item.subItems) return isSubMenuActive(item.subItems);
      return false;
    });

  const toggleMenu = (title: string) => {
    setOpenMenus(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const toggleHrGroup = (label: string) => {
    setOpenHrGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const resetHrGroupPreferences = () => {
    setOpenHrGroups({});
    clearHrSidebarGroupsState(hrSidebarGroupsStorageKey);
    toast.success("Preferensi sidebar HR direset.");
  };

  const handleNavigation = (path: string) => {
    if (path.startsWith("/manuals/") || path.endsWith(".pdf")) {
      window.open(path, "_blank", "noopener,noreferrer");
      if (isMobile) setOpenMobile(false);
      return;
    }
    navigate(path);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/org/login");
  };

  const baseMenuGroups = useMemo<MenuGroup[]>(
    () =>
      [...BASE_MENU_GROUPS, { label: "HRIS", items: HRIS_MENU_ITEMS }].map((group) => {
        if (group.label !== "Master Data") return group;
        return {
          ...group,
          items: group.items
            .map((item) => {
              if (!item.subItems) return item;
              const filteredSubItems = item.subItems.filter((subItem) => {
                const moduleKey = ORG_MASTER_DATA_MODULE_PATH_MAP[subItem.path];
                return moduleKey ? masterDataModules[moduleKey] : true;
              });
              if (filteredSubItems.length === 0) return null;
              return { ...item, subItems: filteredSubItems };
            })
            .filter((item): item is MenuItem => Boolean(item)),
        };
      }),
    [masterDataModules]
  );

  const menuGroupsByAccess = accessLevel === "admin"
    ? baseMenuGroups
    : baseMenuGroups
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

  const workspaceMenuGroups = useMemo<MenuGroup[]>(() => {
    if (currentWorkspace === "absensi") {
      // Pindah workspace menggunakan switcher header, bukan menu sidebar.
      return menuGroupsByAccess.filter((group) => group.label !== "HRIS");
    }

    if (currentWorkspace === "hr") {
      if (accessLevel === "operator") {
        return [
          {
            label: "HR Operator",
            items: [
              {
                title: "Dukungan HR",
                icon: HelpCircle,
                subItems: [
                  { title: "FAQ HR", path: "/org/hr/help/faq", icon: HelpCircle },
                  { title: "Tiket HR", path: "/org/hr/help/tickets", icon: Ticket },
                ],
              },
            ],
          },
        ];
      }
      return HR_FOCUSED_MENU_GROUPS;
    }

    const filterHrisItems = (items: MenuItem[]) =>
      items.filter((item) => {
        if (item.title.startsWith("HR")) return workspaceModules.hr;
        if (item.title === "Payroll") return workspaceModules.payroll;
        return true;
      });
    const hrisGroup = menuGroupsByAccess.find((group) => group.label === "HRIS");
    const hrisItems = filterHrisItems(hrisGroup?.items ?? []);
    const payrollItems =
      hrisItems.find((item) => item.title === "Payroll")?.subItems?.map((item) => ({
        title: item.title,
        icon: item.icon,
        path: item.path,
        badgeLabel: item.badgeLabel,
      })) ?? [];
    const payrollItemsByPath = new Map(
      payrollItems
        .filter((item): item is Required<Pick<MenuItem, "title" | "icon" | "path">> => Boolean(item.path))
        .map((item) => [
          item.path,
          {
            title: item.title,
            path: item.path,
            icon: item.icon,
            badgeLabel: item.badgeLabel,
          } satisfies SubMenuItem,
        ])
    );
    const groupedPayrollItems: MenuItem[] = PAYROLL_MENU_SECTIONS
      .map((section) => ({
        title: section.title,
        icon: section.icon,
        subItems: section.paths
          .map((path) => payrollItemsByPath.get(path))
          .filter((item): item is SubMenuItem => Boolean(item)),
      }))
      .filter((item) => (item.subItems?.length ?? 0) > 0);

    return [
      { label: "Payroll", items: groupedPayrollItems },
    ].filter((group) => group.items.length > 0);
  }, [
    accessLevel,
    currentWorkspace,
    menuGroupsByAccess,
    workspaceModules.hr,
    workspaceModules.payroll,
  ]);

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
          if (!cancelled) {
            setOnboardingReadyModules(0);
            setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
            setOnboardingCounts(null);
            setOnboardingModuleTotal(getOnboardingModuleTotal());
          }
          return;
        }
        const [counts, moduleSetting] = await Promise.all([
          withTimeout(
            Promise.resolve(fetchOrgOnboardingCounts(tenantId)),
            SIDEBAR_ONBOARDING_TIMEOUT_MS,
            "Timeout membaca status onboarding sidebar",
          ),
          withTimeout(
            Promise.resolve(fetchTenantOrgMasterDataModules(tenantId)),
            SIDEBAR_ONBOARDING_TIMEOUT_MS,
            "Timeout membaca pengaturan modul master data sidebar",
          ),
        ]);
        const readyCount = getOnboardingReadyModules(counts);
        if (!cancelled) {
          setOnboardingReadyModules(readyCount);
          setOnboardingCounts(counts);
          setOnboardingModuleTotal(getOnboardingModuleTotal());
          setMasterDataModules(moduleSetting.modules);
        }
      } catch (error) {
        reportError(error, "org.sidebar.fetch_onboarding_status");
        if (!cancelled) {
          setOnboardingReadyModules(0);
          setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
          setOnboardingCounts(null);
          setOnboardingModuleTotal(getOnboardingModuleTotal());
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

  useEffect(() => {
    const handleModuleVisibilityEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const parsedModules = parseOrgMasterDataModulesSetting(detail);
      setMasterDataModules(parsedModules);
      setOnboardingModuleTotal(getOnboardingModuleTotal());
      if (onboardingCounts) {
        setOnboardingReadyModules(getOnboardingReadyModules(onboardingCounts));
      }
    };
    window.addEventListener(ORG_MASTER_DATA_MODULES_UPDATED_EVENT, handleModuleVisibilityEvent);
    return () => window.removeEventListener(ORG_MASTER_DATA_MODULES_UPDATED_EVENT, handleModuleVisibilityEvent);
  }, [onboardingCounts]);

  useEffect(() => {
    if (currentWorkspace !== "hr" || accessLevel !== "admin") return;
    setOpenHrGroups(readHrSidebarGroupsState(hrSidebarGroupsStorageKey));
  }, [accessLevel, currentWorkspace, hrSidebarGroupsStorageKey]);

  useEffect(() => {
    if (currentWorkspace !== "hr" || accessLevel !== "admin") return;
    writeHrSidebarGroupsState(hrSidebarGroupsStorageKey, openHrGroups);
  }, [accessLevel, currentWorkspace, hrSidebarGroupsStorageKey, openHrGroups]);

  const hasOnboardingIncomplete =
    onboardingReadyModules !== null && onboardingReadyModules < onboardingModuleTotal;
  const onboardingStatusLabel =
    onboardingReadyModules === null || isOnboardingStatusLoading
      ? "MEMUAT"
      : hasOnboardingIncomplete
        ? "TIDAK SIAP"
        : "SIAP";
  const hrWorkspaceBadge =
    workspaceAccessState && workspaceModules.hr
      ? `HR ${getWorkspaceModeLabel(workspaceAccessState.hrMode)}`
      : null;
  const payrollWorkspaceBadge =
    workspaceAccessState && workspaceModules.payroll
      ? `Payroll ${getWorkspaceModeLabel(workspaceAccessState.payrollMode)}`
      : null;
  const accessStageBadge = workspaceAccessState ? getAccessStageLabel(workspaceAccessState.stage) : null;

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
                  <SidebarMenuSubItem key={`${subItem.path}-${subItem.title}`}>
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
                      {!isCollapsed && subItem.badgeLabel ? (
                        <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px] leading-none">
                          {subItem.badgeLabel}
                        </Badge>
                      ) : null}
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
              {onboardingReadyModules ?? 0}/{onboardingModuleTotal} modul siap. Klik untuk buka Setup Awal.
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
              {accessLevel === "admin" && accessStageBadge ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline" className="h-5 border-sidebar-border/60 bg-sidebar-accent/20 px-1.5 text-[10px]">
                    {accessStageBadge}
                  </Badge>
                  {hrWorkspaceBadge ? (
                    <Badge variant="outline" className="h-5 border-sidebar-border/60 bg-sidebar-accent/20 px-1.5 text-[10px]">
                      {hrWorkspaceBadge}
                    </Badge>
                  ) : null}
                  {payrollWorkspaceBadge ? (
                    <Badge variant="outline" className="h-5 border-sidebar-border/60 bg-sidebar-accent/20 px-1.5 text-[10px]">
                      {payrollWorkspaceBadge}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Main Content */}
      <SidebarContent>
        {workspaceMenuGroups.map((group) => {
          const shouldUseHrGroupCollapse =
            currentWorkspace === "hr" && accessLevel === "admin" && !isCollapsed;
          const isHrGroupOpen =
            openHrGroups[group.label] ?? (isGroupActive(group.items) || group.label === "Beranda");

          if (!shouldUseHrGroupCollapse) {
            return (
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
            );
          }

          return (
            <Collapsible key={group.label} open={isHrGroupOpen} onOpenChange={() => toggleHrGroup(group.label)}>
              <SidebarGroup className="py-1">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-full items-center rounded-md px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                  >
                    <span>{group.label}</span>
                    {isHrGroupOpen ? (
                      <ChevronDown className="ml-auto h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="ml-auto h-3.5 w-3.5" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => renderMenuItem(item))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarSeparator />

      {/* Footer */}
      <SidebarFooter className="p-2">
        <SidebarMenu>
          {currentWorkspace === "hr" && accessLevel === "admin" && !isCollapsed ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Reset preferensi sidebar HR"
                onClick={resetHrGroupPreferences}
              >
                <Upload className="h-4 w-4" />
                <span>Reset Sidebar HR</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
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
