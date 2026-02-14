import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import {
  Home,
  Newspaper,
  FileText,
  Megaphone,
  Bell,
  Settings,
  Key,
  Moon,
  Sun,
  X,
  ChevronRight,
  Zap,
  BookOpen,
} from "lucide-react";

// WhatsApp SVG Icon component
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

interface EmployeeSidebarProps {
  open: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
  tenantWhatsapp?: string | null;
  tenantName?: string | null;
  billingMode?: string | null;
  picWhatsapp?: string | null;
  picName?: string | null;
}

export function EmployeeSidebar({ open, onClose, onNavigateTab, tenantWhatsapp, tenantName, billingMode, picWhatsapp, picName }: EmployeeSidebarProps) {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDarkMode(isDark);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleContactAdmin = () => {
    // Prioritas: PIC WhatsApp > Tenant WhatsApp
    const waNumber = picWhatsapp || tenantWhatsapp;
    if (waNumber) {
      const cleanNumber = waNumber.replace(/\D/g, "");
      const formattedNumber = cleanNumber.startsWith("0") ? "62" + cleanNumber.slice(1) : cleanNumber;
      const contactName = picName ? ` (${picName})` : "";
      window.open(`https://wa.me/${formattedNumber}?text=Halo Admin${contactName}, saya membutuhkan bantuan.`, "_blank");
    }
    onClose();
  };

  const menuItems = [
    {
      id: "dashboard",
      icon: Home,
      label: "Dashboard",
      onClick: () => {
        onNavigateTab?.("home");
        onClose();
      },
    },
    {
      id: "informasi",
      icon: Newspaper,
      label: "Informasi",
      children: [
        { label: "Artikel", icon: BookOpen, onClick: () => { onNavigateTab?.("articles"); onClose(); } },
        { label: "Pengumuman", icon: Megaphone, onClick: () => { onNavigateTab?.("announcements"); onClose(); } },
      ],
    },
    {
      id: "notifikasi",
      icon: Bell,
      label: "Notifikasi",
      onClick: () => {
        onNavigateTab?.("notifications");
        onClose();
      },
    },
    {
      id: "settings",
      icon: Settings,
      label: "Pengaturan",
      children: [
        { label: "Lupa / Ganti Password", icon: Key, onClick: () => { setShowForgotPassword(true); onClose(); } },
      ],
    },
    ...(billingMode === "individual" ? [{
      id: "activation",
      icon: Zap,
      label: "Aktivasi",
      onClick: () => {
        onNavigateTab?.("activation");
        onClose();
      },
    }] : []),
    {
      id: "contact",
      icon: WhatsAppIcon as any,
      label: "Hubungi Admin Organisasi",
      onClick: handleContactAdmin,
    },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-card border-r border-border z-[70] transform transition-transform duration-300 ease-in-out shadow-2xl ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">A</span>
            </div>
            <div>
              <h2 className="font-bold text-foreground">AbsensiKu</h2>
              <p className="text-xs text-muted-foreground">Menu Navigasi</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Menu Items */}
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-180px)]">
          {menuItems.map((item) => (
            <div key={item.id}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                onClick={() => {
                  if (item.children) {
                    setExpandedMenu(expandedMenu === item.id ? null : item.id);
                  } else {
                    item.onClick?.();
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{item.label}</span>
                </div>
                {item.children && (
                  <ChevronRight
                    className={`w-4 h-4 transition-transform duration-200 ${
                      expandedMenu === item.id ? "rotate-90" : ""
                    }`}
                  />
                )}
              </button>

              {/* Children */}
              {item.children && expandedMenu === item.id && (
                <div className="ml-8 space-y-1 mt-1 animate-fade-in">
                  {item.children.map((child) => (
                    <button
                      key={child.label}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200 text-sm"
                      onClick={child.onClick}
                    >
                      <child.icon className="w-4 h-4" />
                      <span>{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

        </nav>

        {/* Dark Mode Toggle - Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {darkMode ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-amber-500" />}
              <Label htmlFor="dark-mode" className="text-sm font-medium cursor-pointer">
                Mode Gelap
              </Label>
            </div>
            <Switch id="dark-mode" checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>
        </div>
      </aside>

      <ForgotPasswordDialog
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
        loginType="employee"
      />
    </>
  );
}
