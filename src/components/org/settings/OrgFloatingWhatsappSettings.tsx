import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface OrgFloatingWhatsappSettingsProps {
  tenantId: string;
}

interface FloatingWhatsappSettingValue {
  enabled: boolean;
  phone_number: string;
  icon_url: string;
  default_message: string;
  welcome_text: string;
  position: string;
  show_on_mobile: boolean;
  show_on_desktop: boolean;
  animation_effect: "pulse" | "glow" | "wobble" | "ripple";
}

const DEFAULT_MESSAGE = "Halo, saya butuh bantuan terkait aplikasi absensi.";

const toJsonObject = (value: Json): Record<string, Json> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, Json>;
};

export function OrgFloatingWhatsappSettings({ tenantId }: OrgFloatingWhatsappSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLegacySchema, setIsLegacySchema] = useState(false);
  const [settings, setSettings] = useState<FloatingWhatsappSettingValue>({
    enabled: false,
    phone_number: "",
    icon_url: "",
    default_message: DEFAULT_MESSAGE,
    welcome_text: "Ada yang bisa kami bantu?",
    position: "bottom-right",
    show_on_mobile: true,
    show_on_desktop: true,
    animation_effect: "pulse",
  });

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        () =>
          supabase
            .from("organization_settings")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("setting_key", "floating_whatsapp")
            .maybeSingle(),
        12000,
      );

      if (error && error.code !== "PGRST116") throw error;

      if (data?.setting_value) {
        const value = toJsonObject(data.setting_value);
        const hasLegacyKey = Boolean(value && (typeof value.phone === "string" || typeof value.message === "string"));
        const hasStandardKey = Boolean(
          value &&
            (typeof value.phone_number === "string" ||
              typeof value.default_message === "string" ||
              typeof value.welcome_text === "string")
        );
        setIsLegacySchema(hasLegacyKey && !hasStandardKey);

        const enabled = value?.enabled;
        const phoneNumber = value?.phone_number ?? value?.phone;
        const iconUrl = value?.icon_url;
        const defaultMessage = value?.default_message ?? value?.message;
        const welcomeText = value?.welcome_text ?? value?.welcome_message;
        const position = value?.position;
        const showOnMobile = value?.show_on_mobile;
        const showOnDesktop = value?.show_on_desktop;
        const animationEffect = value?.animation_effect;

        setSettings({
          enabled: typeof enabled === "boolean" ? enabled : false,
          phone_number: typeof phoneNumber === "string" ? phoneNumber : "",
          icon_url: typeof iconUrl === "string" ? iconUrl : "",
          default_message: typeof defaultMessage === "string" ? defaultMessage : DEFAULT_MESSAGE,
          welcome_text: typeof welcomeText === "string" ? welcomeText : "Ada yang bisa kami bantu?",
          position: typeof position === "string" ? position : "bottom-right",
          show_on_mobile: typeof showOnMobile === "boolean" ? showOnMobile : true,
          show_on_desktop: typeof showOnDesktop === "boolean" ? showOnDesktop : true,
          animation_effect:
            animationEffect === "pulse" || animationEffect === "glow" || animationEffect === "wobble" || animationEffect === "ripple"
              ? animationEffect
              : "pulse",
        });
      } else {
        setIsLegacySchema(false);
      }
    } catch (error) {
      const errorRef = reportError(error, "org.floating_whatsapp.fetch_settings", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal memuat pengaturan Floating WhatsApp", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (settings.enabled && !settings.phone_number) {
      toast.error("Nomor WhatsApp wajib diisi jika fitur diaktifkan");
      return;
    }

    setIsSaving(true);
    try {
      const { data: existing, error: existingError } = await withTimeout(
        () =>
          supabase
            .from("organization_settings")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("setting_key", "floating_whatsapp")
            .maybeSingle(),
        12000,
      );
      if (existingError) throw existingError;

      if (existing) {
        const { error: updateError } = await withTimeout(
          () =>
            supabase
              .from("organization_settings")
              .update({
                setting_value: settings,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id),
          12000,
        );
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await withTimeout(
          () =>
            supabase.from("organization_settings").insert({
              tenant_id: tenantId,
              setting_key: "floating_whatsapp",
              setting_value: settings,
            }),
          12000,
        );
        if (insertError) throw insertError;
      }

      setIsLegacySchema(false);
      toast.success("Pengaturan Floating WhatsApp berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "org.floating_whatsapp.save_settings", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-600" />
          Floating WhatsApp
          <Badge variant={isLegacySchema ? "secondary" : "outline"}>
            {isLegacySchema ? "Schema Legacy" : "Schema Standar"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Tampilkan tombol WhatsApp mengambang di dashboard pegawai organisasi Anda
        </CardDescription>
        {isLegacySchema && (
          <p className="text-xs text-amber-600">
            Data lama terdeteksi (`phone`/`message`). Simpan ulang untuk normalisasi ke schema standar.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label>Aktifkan Floating WhatsApp</Label>
            <p className="text-sm text-muted-foreground">
              Tombol akan muncul di sudut layar dashboard pegawai
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, enabled: checked })
            }
          />
        </div>

        {settings.enabled && (
          <>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Nomor WhatsApp
              </Label>
              <Input
                value={settings.phone_number}
                onChange={(e) =>
                  setSettings({ ...settings, phone_number: e.target.value })
                }
                placeholder="6281234567890"
              />
              <p className="text-xs text-muted-foreground">
                Format: 62xxx (tanpa + atau 0 di depan)
              </p>
            </div>

            <div className="space-y-2">
              <Label>URL Logo Kustom</Label>
              <Input
                value={settings.icon_url}
                onChange={(e) =>
                  setSettings({ ...settings, icon_url: e.target.value })
                }
                placeholder="https://.../logo-whatsapp.png"
              />
              <p className="text-xs text-muted-foreground">
                Opsional. Kosongkan jika ingin pakai ikon default.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Pesan Default</Label>
              <Textarea
                value={settings.default_message}
                onChange={(e) =>
                  setSettings({ ...settings, default_message: e.target.value })
                }
                placeholder="Pesan yang akan muncul saat klik tombol WhatsApp"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Teks Selamat Datang</Label>
              <Input
                value={settings.welcome_text}
                onChange={(e) =>
                  setSettings({ ...settings, welcome_text: e.target.value })
                }
                placeholder="Ada yang bisa kami bantu?"
              />
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Simpan Pengaturan
        </Button>
      </CardContent>
    </Card>
  );
}
