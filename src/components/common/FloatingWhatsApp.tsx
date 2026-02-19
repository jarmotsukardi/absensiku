import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bot, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type AnimationEffect = "pulse" | "glow" | "wobble" | "ripple";

interface FloatingWhatsAppSettings {
  enabled: boolean;
  phone_number: string;
  phone?: string; // legacy key compatibility
  icon_url?: string;
  welcome_message?: string;
  welcome_text?: string;
  message?: string; // legacy key compatibility
  default_message?: string;
  position?: "left" | "right" | "bottom-left" | "bottom-right";
  show_on_pages?: string[];
  show_on_mobile?: boolean;
  show_on_desktop?: boolean;
  animation_effect?: AnimationEffect;
}

interface FloatingWhatsAppProps {
  settingKey?: string;
  fallbackSettingKeys?: string[];
  panelTitle?: string;
  panelSubtitle?: string;
  showChatAgentOption?: boolean;
  onOpenChatAgent?: () => void;
  chatAgentNoticeText?: string;
  chatAgentButtonText?: string;
}

const defaultFallbackSettingKeys = ["floating_whatsapp"];

const animationClasses: Record<AnimationEffect, string> = {
  pulse: "animate-wa-pulse",
  glow: "animate-wa-glow",
  wobble: "animate-wa-wobble",
  ripple: "",
};

const defaultSettings: FloatingWhatsAppSettings = {
  enabled: false,
  phone_number: "",
  default_message: "Halo, saya tertarik dengan AbsensiKu",
  welcome_text: "Halo! Ada yang bisa kami bantu?",
  position: "bottom-right",
  show_on_mobile: true,
  show_on_desktop: true,
  animation_effect: "pulse",
};

export function FloatingWhatsApp({
  settingKey = "floating_whatsapp_public",
  fallbackSettingKeys = defaultFallbackSettingKeys,
  panelTitle = "Tim Support",
  panelSubtitle = "Biasanya merespon dalam 1 jam",
  showChatAgentOption = false,
  onOpenChatAgent,
  chatAgentNoticeText = "Chat Agent akan menjawab semua pertanyaan Anda dengan cepat.",
  chatAgentButtonText = "Pakai Chat Agent",
}: FloatingWhatsAppProps = {}) {
  const [settings, setSettings] = useState<FloatingWhatsAppSettings | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const keysToTry = [settingKey, ...fallbackSettingKeys];

      for (const key of keysToTry) {
        const { data } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", key)
          .maybeSingle();

        if (data?.value) {
          const settingsData = {
            ...defaultSettings,
            ...(data.value as Record<string, unknown>),
          } as FloatingWhatsAppSettings;
          setSettings(settingsData);
          return;
        }
      }

      setSettings(defaultSettings);
    } catch (error) {
      console.error("Error fetching floating WhatsApp settings:", error);
      setSettings(defaultSettings);
    }
  }, [settingKey, fallbackSettingKeys]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    applyPreference();
    mediaQuery.addEventListener("change", applyPreference);
    return () => mediaQuery.removeEventListener("change", applyPreference);
  }, []);

  useEffect(() => {
    setIconLoadFailed(false);
  }, [settings?.icon_url]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const resolvedPhone = (settings?.phone_number || settings?.phone || "").replace(/\D/g, "");
  if (!settings?.enabled || !resolvedPhone) return null;

  const isMobile =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 768px)").matches
      : false;
  if (isMobile && settings.show_on_mobile === false) return null;
  if (!isMobile && settings.show_on_desktop === false) return null;

  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
  if (Array.isArray(settings.show_on_pages) && settings.show_on_pages.length > 0) {
    const pathAllowed = settings.show_on_pages.some((item) => currentPath.startsWith(item));
    if (!pathAllowed) return null;
  }

  const resolvedWelcomeText =
    settings.welcome_text || settings.welcome_message || "Halo! Ada yang bisa kami bantu?";
  const resolvedDefaultMessage =
    settings.default_message || settings.message || settings.welcome_message || "Halo, saya tertarik dengan AbsensiKu";
  const resolvedIconUrl = settings.icon_url?.trim() || "";

  const isDashboardWithBottomNav = currentPath.startsWith("/employee/dashboard") || currentPath.startsWith("/dashboard");
  const isOrgArea = currentPath.startsWith("/org");
  const bottomOffset = isOrgArea
    ? "calc(env(safe-area-inset-bottom) + 5rem)"
    : isMobile && isDashboardWithBottomNav
      ? "calc(env(safe-area-inset-bottom) + 5.25rem)"
      : "calc(env(safe-area-inset-bottom) + 1rem)";

  const handleClick = () => {
    const message = encodeURIComponent(resolvedDefaultMessage);
    window.open(`https://wa.me/${resolvedPhone}?text=${message}`, "_blank", "noopener,noreferrer");
  };

  const handleOpenChatAgent = () => {
    if (onOpenChatAgent) {
      onOpenChatAgent();
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("homepage-chat-agent:open"));
    }
    setIsOpen(false);
  };

  const isLeftPosition = settings.position === "left" || settings.position === "bottom-left";
  const effect = settings.animation_effect || "pulse";
  const animClass = prefersReducedMotion ? "" : animationClasses[effect] || "";
  const panelAnimationClass = prefersReducedMotion ? "" : "animate-slide-in-up";
  const horizontalStyle = isLeftPosition
    ? { left: "1rem" }
    : { right: isOrgArea ? "6rem" : "1rem" };

  return (
    <div
      ref={containerRef}
      className="fixed z-50"
      style={{ bottom: bottomOffset, ...horizontalStyle }}
    >
      {isOpen && (
        <div
          className={`mb-4 w-72 rounded-lg border border-border bg-card p-4 shadow-lg ${panelAnimationClass}`}
          role="dialog"
          aria-modal="false"
          aria-live="polite"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center">
                {resolvedIconUrl && !iconLoadFailed ? (
                  <img
                    src={resolvedIconUrl}
                    alt="WhatsApp"
                    className="h-5 w-5 object-contain"
                    onError={() => setIconLoadFailed(true)}
                  />
                ) : (
                  <MessageCircle className="w-5 h-5 text-success-foreground" />
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">{panelTitle}</p>
                <p className="text-xs text-muted-foreground">{panelSubtitle}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsOpen(false)}
              aria-label="Tutup panel WhatsApp"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 mb-3">
            <p className="text-sm text-muted-foreground">
              {resolvedWelcomeText}
            </p>
          </div>
          {showChatAgentOption && (
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-xs text-primary font-medium">{chatAgentNoticeText}</p>
            </div>
          )}
          <div className="space-y-2">
            <Button onClick={handleClick} className="w-full bg-success hover:bg-success/90">
              <MessageCircle className="w-4 h-4 mr-2" />
              Chat via WhatsApp
            </Button>
            {showChatAgentOption && (
              <Button onClick={handleOpenChatAgent} variant="outline" className="w-full">
                <Bot className="w-4 h-4 mr-2" />
                {chatAgentButtonText}
              </Button>
            )}
          </div>
        </div>
      )}
      
      <div className="relative">
        {/* Ripple effect rings */}
        {effect === "ripple" && !isOpen && !prefersReducedMotion && (
          <>
            <span className="absolute inset-0 rounded-full bg-success/30 animate-wa-ripple-1" />
            <span className="absolute inset-0 rounded-full bg-success/20 animate-wa-ripple-2" />
          </>
        )}
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={`h-14 w-14 rounded-full bg-success hover:bg-success/90 shadow-lg relative ${!isOpen ? animClass : ''}`}
          aria-label={isOpen ? "Tutup widget WhatsApp" : "Buka widget WhatsApp"}
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <>
              {resolvedIconUrl && !iconLoadFailed ? (
                <img
                  src={resolvedIconUrl}
                  alt="WhatsApp"
                  className="h-6 w-6 object-contain"
                  onError={() => setIconLoadFailed(true)}
                />
              ) : (
                <MessageCircle className="h-6 w-6" />
              )}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
