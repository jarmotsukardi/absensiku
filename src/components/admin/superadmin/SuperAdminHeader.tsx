import { useLocation, useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  Settings, 
  LogOut, 
  User,
  Crown,
  BriefcaseBusiness,
  Receipt,
  Clock,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";

interface SuperAdminHeaderProps {
  title?: string;
  subtitle?: string;
  workspaceMode?: "absensi" | "hr" | "payroll";
}

export function SuperAdminHeader({
  title,
  subtitle,
  workspaceMode = "absensi",
}: SuperAdminHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const workspaceLinks = [
    {
      key: "absensi",
      label: "Super Admin Absensi",
      path: "/admin",
      icon: Clock,
      active: location.pathname.startsWith("/admin") && !location.pathname.startsWith("/admin/hr") && !location.pathname.startsWith("/admin/payroll"),
    },
    {
      key: "hr",
      label: "Super Admin HR",
      path: "/admin/hr",
      icon: BriefcaseBusiness,
      active: location.pathname.startsWith("/admin/hr"),
    },
    {
      key: "payroll",
      label: "Super Admin Payroll",
      path: "/admin/payroll",
      icon: Receipt,
      active: location.pathname.startsWith("/admin/payroll"),
    },
  ] as const;
  const currentWorkspace =
    workspaceLinks.find((item) => item.active) ??
    workspaceLinks.find((item) => item.key === workspaceMode) ??
    workspaceLinks[0];
  const CurrentWorkspaceIcon = currentWorkspace.icon;
  const profilePath = workspaceMode === "hr" ? "/admin/hr/profile" : "/admin/profile";
  const settingsPath =
    workspaceMode === "hr"
      ? "/admin/hr/settings"
      : workspaceMode === "payroll"
        ? "/admin/payroll/settings"
        : "/admin/settings";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      <SidebarTrigger className="-ml-2" />
      
      {/* Title */}
      <div className="flex-1">
        <div>
          <div className="flex items-center gap-2">
            {title ? (
              <h1 className="text-lg font-semibold">{title}</h1>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Area Kerja</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <CurrentWorkspaceIcon className="h-3.5 w-3.5" />
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>Ganti Area Kerja Super Admin</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspaceLinks.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <DropdownMenuItem key={item.key} onClick={() => navigate(item.path)}>
                      <ItemIcon className="mr-2 h-4 w-4" />
                      {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      {/* Pencarian */}
      <div className="hidden md:flex relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Cari..." 
          className="pl-9 h-9"
        />
      </div>

      {/* Notifikasi */}
      <NotificationDropdown />

      {/* Menu Pengguna */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Crown className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">Super Admin</p>
              <p className="text-xs text-muted-foreground">admin@absensiku.id</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate(profilePath)}>
            <User className="mr-2 h-4 w-4" />
            Profil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(settingsPath)}>
            <Settings className="mr-2 h-4 w-4" />
            Pengaturan
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
