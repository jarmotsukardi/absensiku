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
  Settings,
  FileText,
  Calendar,
  MapPin,
  BarChart3,
  LogOut,
  ChevronRight,
  ChevronDown,
  HelpCircle,
  Briefcase,
  Clock,
  UserCheck,
  UserX,
  FileWarning,
  ClipboardList,
  AlertTriangle,
  Plane,
  HeartPulse,
  FileSpreadsheet,
  FolderTree,
  Timer,
  Database,
  LandmarkIcon,
  ShieldCheck,
  Upload,
  Newspaper,
  Home,
  MapPinOff,
  UserCog,
  Bell,
  Zap,
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

const menuGroups: MenuGroup[] = [
  {
    label: "Utama",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, path: "/org" },
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
        subItems: [
          { title: "Pegawai Aktif", path: "/org/employees/active", icon: UserCheck },
          { title: "Pegawai Non-Aktif", path: "/org/employees/inactive", icon: UserX },
          { title: "Permohonan Mutasi", path: "/org/employees/mutations", icon: UserCog },
          { title: "Import Pegawai", path: "/org/master/employee-import", icon: Upload },
        ]
      },
    ],
  },
  {
    label: "Izin/Cuti",
    items: [
      { 
        title: "Permohonan", 
        icon: ClipboardList, 
        subItems: [
          { title: "Permohonan Cuti", path: "/org/leave/requests", icon: FileText },
          { title: "Pengajuan Lembur", path: "/org/leave/overtime", icon: Timer },
          { title: "Permohonan WFH", path: "/org/leave/wfh", icon: Home },
          { title: "Absensi Khusus", path: "/org/leave/flexible", icon: MapPinOff },
          { title: "Izin/Cuti", path: "/org/leave/approved", icon: Calendar },
          { title: "Sakit", path: "/org/leave/sick", icon: HeartPulse },
          { title: "Dinas/Lainnya", path: "/org/leave/official", icon: Plane },
          { title: "Tanpa Keterangan", path: "/org/leave/absent", icon: FileWarning },
        ]
      },
    ],
  },
  {
    label: "Laporan",
    items: [
      { title: "Laporan Absensi", icon: FileSpreadsheet, path: "/org/reports/attendance" },
      { title: "Rekapitulasi", icon: BarChart3, path: "/org/reports/recap" },
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
      { title: "Aktivasi", icon: Zap, path: "/org/activation" },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { title: "Pengaturan Umum", icon: Settings, path: "/org/settings" },
      { title: "Undangan Pegawai", icon: UserCheck, path: "/org/invitations" },
      { title: "Landing Page & Aplikasi", icon: LandmarkIcon, path: "/org/landing-settings" },
      { title: "Log Aktivitas", icon: ClipboardList, path: "/org/audit-log" },
    ],
  },
  {
    label: "Bantuan",
    items: [
      { title: "Pusat Bantuan", icon: HelpCircle, path: "/org/help" },
    ],
  },
];

interface OrganizationSidebarProps {
  organizationName?: string;
  organizationType?: string;
}

export function OrganizationSidebar({ organizationName = "Organisasi", organizationType = "Pemerintah Daerah" }: OrganizationSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const isActive = (path: string) => {
    if (path === "/org") {
      return location.pathname === "/org";
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
