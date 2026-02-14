import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type AnimationEffect = "pulse" | "glow" | "wobble" | "ripple";

interface FloatingWhatsAppSettings {
  enabled: boolean;
  phone_number: string;
  welcome_message: string;
  position: "left" | "right";
  show_on_pages: string[];
  animation_effect?: AnimationEffect;
}

const animationClasses: Record<AnimationEffect, string> = {
  pulse: "animate-wa-pulse",
  glow: "animate-wa-glow",
  wobble: "animate-wa-wobble",
  ripple: "",
};

export function FloatingWhatsApp() {
  const [settings, setSettings] = useState<FloatingWhatsAppSettings | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "floating_whatsapp")
        .maybeSingle();

      if (data?.value) {
        const settingsData = data.value as unknown as FloatingWhatsAppSettings;
        setSettings(settingsData);
      }
    } catch (error) {
      console.error("Error fetching floating WhatsApp settings:", error);
    }
  };

  if (!settings?.enabled || !settings?.phone_number) return null;

  const handleClick = () => {
    const phone = settings.phone_number.replace(/\D/g, "");
    const message = encodeURIComponent(settings.welcome_message || "Halo, saya tertarik dengan AbsensiKu");
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  const positionClass = settings.position === "left" ? "left-4" : "right-4";
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
                <p className="font-semibold text-sm">Tim Support</p>
                <p className="text-xs text-muted-foreground">Biasanya merespon dalam 1 jam</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 mb-3">
            <p className="text-sm text-muted-foreground">
              {settings.welcome_message || "Halo! Ada yang bisa kami bantu?"}
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
