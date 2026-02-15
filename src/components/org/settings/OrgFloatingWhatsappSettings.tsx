import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface OrgFloatingWhatsappSettingsProps {
  tenantId: string;
}

interface FloatingWhatsappSettingValue {
  enabled: boolean;
  phone: string;
  message: string;
  position: string;
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
  const [settings, setSettings] = useState<FloatingWhatsappSettingValue>({
    enabled: false,
    phone: "",
    message: DEFAULT_MESSAGE,
    position: "bottom-right",
  });

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("organization_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("setting_key", "floating_whatsapp")
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data?.setting_value) {
        const value = toJsonObject(data.setting_value);
        const enabled = value?.enabled;
        const phone = value?.phone;
        const message = value?.message;
        const position = value?.position;

        setSettings({
          enabled: typeof enabled === "boolean" ? enabled : false,
          phone: typeof phone === "string" ? phone : "",
          message: typeof message === "string" ? message : DEFAULT_MESSAGE,
          position: typeof position === "string" ? position : "bottom-right",
        });
      }
    } catch (error) {
      console.error("Error fetching floating WA settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (settings.enabled && !settings.phone) {
      toast.error("Nomor WhatsApp wajib diisi jika fitur diaktifkan");
      return;
    }

    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", "floating_whatsapp")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("organization_settings")
          .update({
            setting_value: settings,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: "floating_whatsapp",
          setting_value: settings,
        });
      }

      toast.success("Pengaturan Floating WhatsApp berhasil disimpan");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Gagal menyimpan pengaturan");
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
        </CardTitle>
        <CardDescription>
          Tampilkan tombol WhatsApp mengambang di dashboard pegawai organisasi Anda
        </CardDescription>
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
                value={settings.phone}
                onChange={(e) =>
                  setSettings({ ...settings, phone: e.target.value })
                }
                placeholder="6281234567890"
              />
              <p className="text-xs text-muted-foreground">
                Format: 62xxx (tanpa + atau 0 di depan)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Pesan Default</Label>
              <Textarea
                value={settings.message}
                onChange={(e) =>
                  setSettings({ ...settings, message: e.target.value })
                }
                placeholder="Pesan yang akan muncul saat klik tombol WhatsApp"
                rows={3}
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
