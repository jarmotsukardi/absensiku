import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

type AnimationEffect = "pulse" | "glow" | "wobble" | "ripple";

interface FloatingWhatsappValue {
  enabled: boolean;
  phone_number: string;
  icon_url: string;
  default_message: string;
  position: "bottom-right" | "bottom-left" | "right" | "left";
  welcome_text: string;
  show_on_mobile: boolean;
  show_on_desktop: boolean;
  animation_effect: AnimationEffect;
}

const defaultSetting: FloatingWhatsappValue = {
  enabled: false,
  phone_number: "",
  icon_url: "",
  default_message: "Halo, saya ingin bertanya tentang layanan AbsensiKu.",
  position: "bottom-right",
  welcome_text: "Ada yang bisa kami bantu?",
  show_on_mobile: true,
  show_on_desktop: true,
  animation_effect: "pulse",
};

interface ChannelSetting {
  key: "floating_whatsapp_org_admin" | "floating_whatsapp_public";
  title: string;
  description: string;
  hint: string;
  value: FloatingWhatsappValue;
}

export function FloatingWhatsappSettings() {
  const REQUEST_TIMEOUT_MS = 12000;
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [channels, setChannels] = useState<ChannelSetting[]>([
    {
      key: "floating_whatsapp_org_admin",
      title: "Admin Organisasi (Layanan Pelanggan/Teknis)",
      description: "Muncul di halaman admin organisasi (/org/*) untuk bantuan operasional.",
      hint: "Contoh pesan: Halo tim support, saya admin organisasi dan butuh bantuan teknis.",
      value: {
        ...defaultSetting,
        default_message: "Halo tim support, saya admin organisasi dan butuh bantuan teknis.",
      },
    },
    {
      key: "floating_whatsapp_public",
      title: "Halaman Utama (Calon Pelanggan)",
      description: "Muncul di halaman publik utama (/, /faq, /about) untuk kebutuhan pra-penjualan.",
      hint: "Contoh pesan: Halo, saya calon pelanggan dan ingin demo AbsensiKu.",
      value: {
        ...defaultSetting,
        enabled: true,
        default_message: "Halo, saya calon pelanggan dan ingin demo AbsensiKu.",
      },
    },
  ]);

  const fetchSettings = useCallback(async () => {
    try {
      const [orgAdminRes, publicRes, legacyPublicRes] = await withTimeout(
        Promise.all([
          supabase.from("system_settings").select("value").eq("key", "floating_whatsapp_org_admin").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "floating_whatsapp_public").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "floating_whatsapp").maybeSingle(),
        ]),
        REQUEST_TIMEOUT_MS,
        "Memuat pengaturan floating WhatsApp terlalu lama",
      );

      const publicValue = (publicRes.data?.value || legacyPublicRes.data?.value || {}) as Record<string, unknown>;
      const orgAdminValue = (orgAdminRes.data?.value || {}) as Record<string, unknown>;

      setChannels((prev) =>
        prev.map((channel) => {
          const merged =
            channel.key === "floating_whatsapp_org_admin"
              ? ({ ...channel.value, ...orgAdminValue } as FloatingWhatsappValue)
              : ({ ...channel.value, ...publicValue } as FloatingWhatsappValue);

          return {
            ...channel,
            value: merged,
          };
        })
      );
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.floating_whatsapp.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan WhatsApp", errorRef));
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleChange = (key: ChannelSetting["key"], field: keyof FloatingWhatsappValue, value: string | boolean) => {
    setChannels((prev) =>
      prev.map((channel) =>
        channel.key === key
          ? { ...channel, value: { ...channel.value, [field]: value } as FloatingWhatsappValue }
          : channel
      )
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      const payload = channels.map((channel) => ({
        key: channel.key,
        value: channel.value,
        description: `Pengaturan Floating WhatsApp - ${channel.title}`,
        updated_at: now,
      }));

      const { error } = await withTimeout(
        supabase.from("system_settings").upsert(payload, { onConflict: "key" }),
        REQUEST_TIMEOUT_MS,
        "Menyimpan pengaturan floating WhatsApp terlalu lama",
      );
      if (error) throw error;

      toast.success("Pengaturan WhatsApp per tujuan berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.floating_whatsapp.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const getWhatsappUrl = (value: FloatingWhatsappValue) => {
    const phone = value.phone_number.replace(/[^0-9]/g, "");
    const message = encodeURIComponent(value.default_message);
    return `https://wa.me/${phone}?text=${message}`;
  };

  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-500" />
          Floating WhatsApp Per Tujuan
        </h3>
        <p className="text-sm text-muted-foreground">
          Atur nomor dan pesan berbeda untuk admin organisasi dan calon pelanggan publik.
        </p>
      </div>

      {channels.map((channel) => (
        <div key={channel.key} className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{channel.title}</CardTitle>
              <CardDescription>{channel.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label className="font-medium">Aktifkan Floating WhatsApp</Label>
                  <p className="text-sm text-muted-foreground">Tombol muncul sesuai target halaman.</p>
                </div>
                <Switch
                  checked={channel.value.enabled}
                  onCheckedChange={(checked) => handleChange(channel.key, "enabled", checked)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Nomor WhatsApp</Label>
                  <Input
                    value={channel.value.phone_number}
                    onChange={(e) => handleChange(channel.key, "phone_number", e.target.value)}
                    placeholder="6281234567890"
                  />
                  <p className="text-xs text-muted-foreground">Format: 62xxx (tanpa + atau 0).</p>
                </div>
                <div className="space-y-2">
                  <Label>URL Logo Kustom</Label>
                  <Input
                    value={channel.value.icon_url}
                    onChange={(e) => handleChange(channel.key, "icon_url", e.target.value)}
                    placeholder="https://.../logo-whatsapp.png"
                  />
                  <p className="text-xs text-muted-foreground">Opsional. Kosongkan untuk ikon default.</p>
                </div>
                <div className="space-y-2">
                  <Label>Efek Animasi</Label>
                  <Select
                    value={channel.value.animation_effect}
                    onValueChange={(v) => handleChange(channel.key, "animation_effect", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pulse">Pulsing (Denyut)</SelectItem>
                      <SelectItem value="glow">Glow (Pendaran)</SelectItem>
                      <SelectItem value="wobble">Wobble (Goyangan)</SelectItem>
                      <SelectItem value="ripple">Ripple (Gelombang)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pesan Bawaan</Label>
                <Textarea
                  value={channel.value.default_message}
                  onChange={(e) => handleChange(channel.key, "default_message", e.target.value)}
                  placeholder={channel.hint}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Teks Selamat Datang</Label>
                <Input
                  value={channel.value.welcome_text}
                  onChange={(e) => handleChange(channel.key, "welcome_text", e.target.value)}
                  placeholder="Ada yang bisa kami bantu?"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label className="font-medium">Tampilkan di Desktop</Label>
                  <p className="text-sm text-muted-foreground">Browser laptop/PC</p>
                </div>
                <Switch
                  checked={channel.value.show_on_desktop}
                  onCheckedChange={(checked) => handleChange(channel.key, "show_on_desktop", checked)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label className="font-medium">Tampilkan di Seluler</Label>
                  <p className="text-sm text-muted-foreground">Browser ponsel</p>
                </div>
                <Switch
                  checked={channel.value.show_on_mobile}
                  onCheckedChange={(checked) => handleChange(channel.key, "show_on_mobile", checked)}
                />
              </div>

              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                  {channel.value.icon_url?.trim() ? (
                    <img src={channel.value.icon_url} alt="Logo WhatsApp" className="h-7 w-7 object-contain" />
                  ) : (
                    <MessageCircle className="h-7 w-7 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Pratinjau Target</p>
                  <p className="text-xs text-muted-foreground">{channel.description}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={getWhatsappUrl(channel.value)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Test Link
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
