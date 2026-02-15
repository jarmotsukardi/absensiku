import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type AnimationEffect = "pulse" | "glow" | "wobble" | "ripple";

interface FloatingWhatsAppSettings {
  enabled: boolean;
  phone_number: string;
  welcome_message?: string;
  welcome_text?: string;
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
}: FloatingWhatsAppProps = {}) {
  const [settings, setSettings] = useState<FloatingWhatsAppSettings | null>(null);
  const [isOpen, setIsOpen] = useState(false);

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

  if (!settings?.enabled || !settings?.phone_number) return null;

  const isMobile =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 768px)").matches
      : false;
  if (isMobile && settings.show_on_mobile === false) return null;
  if (!isMobile && settings.show_on_desktop === false) return null;

  const resolvedWelcomeText =
    settings.welcome_text || settings.welcome_message || "Halo! Ada yang bisa kami bantu?";
  const resolvedDefaultMessage =
    settings.default_message || settings.welcome_message || "Halo, saya tertarik dengan AbsensiKu";

  const handleClick = () => {
    const phone = settings.phone_number.replace(/\D/g, "");
    const message = encodeURIComponent(resolvedDefaultMessage);
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  const positionClass =
    settings.position === "left" || settings.position === "bottom-left" ? "left-4" : "right-4";
  const effect = settings.animation_effect || "pulse";
  const animClass = animationClasses[effect] || "";

  return (
    <div className={`fixed bottom-4 ${positionClass} z-50`}>
      {isOpen && (
        <div className="mb-4 bg-card border border-border rounded-lg shadow-lg p-4 w-72 animate-slide-in-up">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-success-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm">{panelTitle}</p>
                <p className="text-xs text-muted-foreground">{panelSubtitle}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 mb-3">
            <p className="text-sm text-muted-foreground">
              {resolvedWelcomeText}
            </p>
          </div>
          <Button onClick={handleClick} className="w-full bg-success hover:bg-success/90">
            <MessageCircle className="w-4 h-4 mr-2" />
            Mulai Chat
          </Button>
        </div>
      )}
      
      <div className="relative">
        {/* Ripple effect rings */}
        {effect === "ripple" && !isOpen && (
          <>
            <span className="absolute inset-0 rounded-full bg-success/30 animate-wa-ripple-1" />
            <span className="absolute inset-0 rounded-full bg-success/20 animate-wa-ripple-2" />
          </>
        )}
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={`h-14 w-14 rounded-full bg-success hover:bg-success/90 shadow-lg relative ${!isOpen ? animClass : ''}`}
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
        </Button>
      </div>
    </div>
  );
}
