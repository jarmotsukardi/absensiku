import { useState } from "react";
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
  CreditCard,
  Settings,
  Bell,
  FileText,
  Shield,
  Database,
  LogOut,
  ChevronRight,
  ChevronDown,
  Crown,
  HelpCircle,
  Bug,
  Layout,
  Calendar,
  Wallet,
  Clock,
  MapPin,
  UserCog,
  Upload,
  FolderTree,
  MessageCircleQuestion,
  Activity,
  AlertTriangle,
  Ticket,
  ClipboardList,
  BarChart3,
  ListChecks,
  BriefcaseBusiness,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

const absensiMenuGroups: MenuGroup[] = [
  {
    label: "Utama Absensi",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, path: "/admin" },
      { title: "Organisasi", icon: Building2, path: "/admin/organizations" },
      { title: "Langganan", icon: CreditCard, path: "/admin/subscriptions" },
      { title: "Billing & Payment", icon: Wallet, path: "/admin/billing" },
    ],
  },
  {
    label: "Pengguna Absensi",
    items: [
      { title: "Semua User", icon: Users, path: "/admin/users" },
      { title: "Role & Permission", icon: Shield, path: "/admin/roles" },
    ],
  },
  {
    label: "Laporan Absensi",
    items: [
      { title: "Audit Log", icon: FileText, path: "/admin/reports/audit" },
      { title: "Log Error", icon: AlertTriangle, path: "/admin/log-errors" },
      { title: "Feedback & Bug", icon: Bug, path: "/admin/feedback" },
      { title: "Tiket Bantuan Org", icon: Ticket, path: "/admin/help/tickets" },
      { title: "Streak Monitoring", icon: Clock, path: "/admin/streak-monitoring" },
    ],
  },
  {
    label: "Pengaturan Absensi",
    items: [
      { title: "Profil Saya", icon: UserCog, path: "/admin/profile" },
      { title: "Tata Letak Homepage", icon: Layout, path: "/admin/homepage-layout" },
      { title: "Manajemen FAQ", icon: MessageCircleQuestion, path: "/admin/faq" },
      { title: "Keamanan Absensi", icon: Shield, path: "/admin/attendance-security" },
      {
        title: "Pengaturan Sistem",
        icon: Settings,
        path: "/admin/settings",
      },
      { title: "Cron Jobs", icon: Calendar, path: "/admin/cron-jobs" },
      { title: "Notifikasi", icon: Bell, path: "/admin/notifications" },
      { title: "Stress Test Absensi", icon: Activity, path: "/admin/stress-test" },
    ],
  },
];

const hrMenuGroups: MenuGroup[] = [
  {
    label: "1. Ringkasan Platform",
    items: [
      {
        title: "Pusat Kendali HR",
        icon: LayoutDashboard,
        subItems: [
          { title: "Dashboard HR", icon: LayoutDashboard, path: "/admin/hr" },
          { title: "Monitoring Tenant", icon: Building2, path: "/admin/hr/tenants" },
          { title: "Aktivitas & Audit", icon: FileText, path: "/admin/hr/audit" },
          { title: "Log Error HR", icon: AlertTriangle, path: "/admin/hr/error-logs" },
          { title: "Helpdesk HR", icon: Ticket, path: "/admin/hr/help/tickets" },
        ],
      },
    ],
  },
  {
    label: "2. Tata Kelola Tenant",
    items: [
      {
        title: "Kontrol Tenant",
        icon: Building2,
        subItems: [
          { title: "Data Perusahaan", icon: Building2, path: "/admin/hr/tenants" },
          { title: "Struktur & Unit Organisasi", icon: FolderTree, path: "/admin/hr/sections/struktur-unit-organisasi" },
          { title: "Jabatan & Grade", icon: BriefcaseBusiness, path: "/admin/hr/sections/jabatan-grade" },
          { title: "Lokasi & Kalender Kerja", icon: MapPin, path: "/admin/hr/sections/lokasi-kalender-kerja" },
        ],
      },
    ],
  },
  {
    label: "3. Kebijakan & Baseline",
    items: [
      {
        title: "Kebijakan Inti",
        icon: ListChecks,
        subItems: [
          { title: "Kebijakan HR", icon: Shield, path: "/admin/hr/policies" },
          { title: "Status Absensi Harian", icon: Clock, path: "/admin/hr/sections/status-absensi-hari-ini" },
          { title: "Hari Libur Nasional", icon: Calendar, path: "/admin/hr/sections/hari-libur-nasional" },
          { title: "Aturan Keterlambatan", icon: AlertTriangle, path: "/admin/hr/sections/pengaturan-keterlambatan" },
          { title: "Cuti & Izin Baseline", icon: Calendar, path: "/admin/hr/sections/cuti-izin-baseline" },
          { title: "Kontrak Kerja Baseline", icon: FileText, path: "/admin/hr/sections/kontrak-kerja-baseline" },
          { title: "KPI & Performance Baseline", icon: Activity, path: "/admin/hr/sections/kpi-performance-baseline" },
        ],
      },
    ],
  },
  {
    label: "4. Monitoring & Kepatuhan",
    items: [
      {
        title: "Monitoring HR",
        icon: BarChart3,
        subItems: [
          { title: "Rekap Absensi", icon: FileText, path: "/admin/hr/sections/rekap-absensi" },
          { title: "Analitik Cuti", icon: Calendar, path: "/admin/hr/sections/analitik-cuti" },
          { title: "Manajemen Pengguna", icon: Users, path: "/admin/hr/sections/user-management" },
          { title: "Manajemen Peran", icon: Shield, path: "/admin/hr/sections/role-management" },
          { title: "Pengaturan Izin", icon: Settings, path: "/admin/hr/sections/permission-setting" },
          { title: "Kepatuhan Dokumen", icon: FileText, path: "/admin/hr/sections/compliance-dokumen" },
        ],
      },
    ],
  },
  {
    label: "5. Operasional Dukungan",
    items: [
      {
        title: "Operasional Dukungan",
        icon: HelpCircle,
        subItems: [
          { title: "FAQ HR Superadmin", icon: MessageCircleQuestion, path: "/admin/hr/help/faq" },
          { title: "Bantuan HR Superadmin", icon: HelpCircle, path: "/admin/hr/help/support" },
          { title: "Tiket HR Superadmin", icon: Ticket, path: "/admin/hr/help/tickets" },
          { title: "SLA Monitoring", icon: Clock, path: "/admin/hr/sections/sla-monitoring" },
          { title: "Playbook Eskalasi", icon: ClipboardList, path: "/admin/hr/sections/playbook-eskalasi" },
        ],
      },
    ],
  },
  {
    label: "6. Integrasi & Keandalan",
    items: [
      {
        title: "Keandalan Sistem",
        icon: Database,
        subItems: [
          { title: "Integrasi API HR", icon: Database, path: "/admin/hr/sections/integrasi-api" },
          { title: "Integrasi Absensi", icon: Shield, path: "/admin/hr/sections/integrasi-fingerprint-gps" },
          { title: "Notifikasi Sistem", icon: Bell, path: "/admin/hr/sections/notifikasi-sistem" },
          { title: "Backup & Restore", icon: Database, path: "/admin/hr/sections/backup-restore" },
          { title: "Import / Export Data", icon: Upload, path: "/admin/hr/sections/import-export-data" },
          { title: "Pengaturan HR", icon: Settings, path: "/admin/hr/settings" },
        ],
      },
    ],
  },
];

const payrollMenuGroups: MenuGroup[] = [
  {
    label: "Payroll Workspace",
    items: [
      { title: "Dashboard Payroll", icon: BarChart3, path: "/admin/payroll" },
      { title: "Tenant Payroll", icon: Building2, path: "/admin/payroll/tenants" },
      { title: "Monitoring Payroll", icon: Activity, path: "/admin/payroll/monitoring" },
      { title: "Log Error Payroll", icon: AlertTriangle, path: "/admin/payroll/error-logs" },
      { title: "Audit Payroll", icon: FileText, path: "/admin/payroll/audit" },
      { title: "Integrasi Payroll", icon: Database, path: "/admin/payroll/integrations" },
      { title: "Pengaturan Payroll", icon: ListChecks, path: "/admin/payroll/settings" },
    ],
  },
  {
    label: "Akun",
    items: [
      { title: "Profil Saya", icon: UserCog, path: "/admin/profile" },
      { title: "Pengaturan Sistem", icon: Settings, path: "/admin/settings" },
    ],
  },
];

interface SuperAdminSidebarProps {
  workspaceMode?: "absensi" | "hr" | "payroll";
}

export function SuperAdminSidebar({ workspaceMode = "absensi" }: SuperAdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const menuGroups =
    workspaceMode === "hr"
      ? hrMenuGroups
      : workspaceMode === "payroll"
        ? payrollMenuGroups
        : absensiMenuGroups;

  const isActive = (path: string) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  const isSubMenuActive = (subItems: SubMenuItem[]) => {
    return subItems.some(item => location.pathname.startsWith(item.path));
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
    navigate("/admin/login");
  };

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
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Header */}
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <Crown className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sidebar-foreground truncate">AbsensiKu</span>
              <span className="text-xs text-sidebar-foreground/70">Super Admin</span>
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
              tooltip="Bantuan"
              onClick={() => window.open("https://docs.absensiku.id", "_blank")}
              className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Bantuan</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
