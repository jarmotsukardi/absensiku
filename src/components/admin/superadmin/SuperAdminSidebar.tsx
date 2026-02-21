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
  MessageCircleQuestion,
  Activity,
  AlertTriangle,
  Ticket,
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
      { title: "Dashboard", icon: LayoutDashboard, path: "/admin" },
      { title: "Organisasi", icon: Building2, path: "/admin/organizations" },
      { title: "Langganan", icon: CreditCard, path: "/admin/subscriptions" },
      { title: "Billing & Payment", icon: Wallet, path: "/admin/billing" },
    ],
  },
  {
    label: "Pengguna",
    items: [
      { title: "Semua User", icon: Users, path: "/admin/users" },
      { title: "Role & Permission", icon: Shield, path: "/admin/roles" },
    ],
  },
  {
    label: "Laporan",
    items: [
      { title: "Audit Log", icon: FileText, path: "/admin/reports/audit" },
      { title: "Log Error", icon: AlertTriangle, path: "/admin/log-errors" },
      { title: "Feedback & Bug", icon: Bug, path: "/admin/feedback" },
      { title: "Tiket Bantuan Org", icon: Ticket, path: "/admin/help/tickets" },
      { title: "Streak Monitoring", icon: Clock, path: "/admin/streak-monitoring" },
    ],
  },
  {
    label: "Pengaturan",
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
      { title: "Notifikasi", icon: Bell, path: "/admin/notifications" },
      { title: "Stress Test Absensi", icon: Activity, path: "/admin/stress-test" },
    ],
  },
];

export function SuperAdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

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
