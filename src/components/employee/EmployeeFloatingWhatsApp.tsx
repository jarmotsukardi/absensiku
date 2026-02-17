import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface EmployeeFloatingWhatsAppProps {
  tenantId: string | null | undefined;
}

interface FloatingWhatsappSettingValue {
  enabled?: boolean;
  phone?: string;
  phone_number?: string;
  message?: string;
  default_message?: string;
  icon_url?: string;
}

interface DragPosition {
  x: number;
  y: number;
}

const BUTTON_SIZE = 56;
const EDGE_PADDING = 12;
const DEFAULT_TOP_OFFSET = 84;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function EmployeeFloatingWhatsApp({ tenantId }: EmployeeFloatingWhatsAppProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [message, setMessage] = useState("Halo, saya butuh bantuan terkait absensi.");
  const [iconUrl, setIconUrl] = useState("");
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const [position, setPosition] = useState<DragPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pointerOffsetRef = useRef<DragPosition>({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const storageKey = useMemo(() => (
    tenantId ? `employee_floating_whatsapp_position_${tenantId}` : null
  ), [tenantId]);

  const getDefaultPosition = useCallback((): DragPosition => {
    if (typeof window === "undefined") {
      return { x: EDGE_PADDING, y: DEFAULT_TOP_OFFSET };
    }
    return {
      x: window.innerWidth - BUTTON_SIZE - EDGE_PADDING,
      y: DEFAULT_TOP_OFFSET,
    };
  }, []);

  const sanitizePhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("0")) return `62${digits.slice(1)}`;
    return digits;
  };

  const clampPosition = useCallback((next: DragPosition): DragPosition => {
    if (typeof window === "undefined") return next;
    return {
      x: clamp(next.x, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
      y: clamp(next.y, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
    };
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      if (!tenantId) {
        setIsVisible(false);
        return;
      }

      const { data } = await supabase
        .from("organization_settings")
        .select("setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", "floating_whatsapp")
        .maybeSingle();

      const raw = (data?.setting_value || {}) as FloatingWhatsappSettingValue;
      const enabled = raw.enabled === true;
      const phone = sanitizePhone(raw.phone || raw.phone_number || "");
      const defaultMessage = raw.message || raw.default_message || "Halo, saya butuh bantuan terkait absensi.";
      const customIcon = typeof raw.icon_url === "string" ? raw.icon_url.trim() : "";

      setIsVisible(enabled && phone.length > 0);
      setPhoneNumber(phone);
      setMessage(defaultMessage);
      setIconUrl(customIcon);
      setIconLoadFailed(false);
    };

    void loadSettings();
  }, [tenantId]);

  useEffect(() => {
    const fallback = getDefaultPosition();
    if (!storageKey) {
      setPosition(fallback);
      return;
    }

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        setPosition(fallback);
        return;
      }
      const parsed = JSON.parse(saved) as DragPosition;
      setPosition(clampPosition(parsed));
    } catch {
      setPosition(fallback);
    }
  }, [clampPosition, getDefaultPosition, storageKey]);

  useEffect(() => {
    if (!position) return;
    const handleResize = () => setPosition((prev) => (prev ? clampPosition(prev) : prev));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition, position]);

  const savePosition = useCallback((next: DragPosition) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore storage failure
    }
  }, [storageKey]);

  const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!position) return;
    movedRef.current = false;
    setIsDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointerOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
  };

  const handlePointerMove: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!isDragging) return;
    movedRef.current = true;
    const next = clampPosition({
      x: event.clientX - pointerOffsetRef.current.x,
      y: event.clientY - pointerOffsetRef.current.y,
    });
    setPosition(next);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLButtonElement> = () => {
    if (!position) return;
    setIsDragging(false);
    savePosition(position);

    // If pointer up without significant move, treat as click.
    if (!movedRef.current && phoneNumber) {
      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/${phoneNumber}?text=${encodedMessage}`, "_blank", "noopener,noreferrer");
    }
  };

  if (!isVisible || !position) return null;

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setIsDragging(false)}
      className={cn(
        "fixed z-[60] h-14 w-14 rounded-full bg-green-600 text-white shadow-lg",
        "flex items-center justify-center",
        "transition-transform duration-150 hover:scale-105",
        "animate-wa-wobble"
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      aria-label="Hubungi WhatsApp"
      title="Geser untuk pindah posisi. Ketuk untuk membuka WhatsApp."
    >
      {iconUrl && !iconLoadFailed ? (
        <img
          src={iconUrl}
          alt="WhatsApp"
          className="h-6 w-6 object-contain"
          onError={() => setIconLoadFailed(true)}
        />
      ) : (
        <MessageCircle className="h-6 w-6" />
      )}
    </button>
  );
}
