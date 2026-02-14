import { useState, useEffect } from "react";
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

export function FloatingWhatsappSettings() {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [settings, setSettings] = useState({
    enabled: true,
    phone_number: "6281234567890",
    default_message: "Halo, saya ingin bertanya tentang layanan AbsensiKu.",
    position: "bottom-right",
    welcome_text: "Ada yang bisa kami bantu?",
    show_on_mobile: true,
    show_on_desktop: true,
    animation_effect: "pulse" as string,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "floating_whatsapp")
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      
      if (data?.value) {
        setSettings(data.value as typeof settings);
      }
    } catch (error) {
      console.error("Error fetching floating whatsapp settings:", error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          {
            key: "floating_whatsapp",
            value: settings,
            description: "Pengaturan Floating WhatsApp Button",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      toast.success("Pengaturan Floating WhatsApp berhasil disimpan");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Gagal menyimpan pengaturan");
    } finally {
      setIsLoading(false);
    }
  };

  const getWhatsappUrl = () => {
    const phone = settings.phone_number.replace(/[^0-9]/g, "");
    const message = encodeURIComponent(settings.default_message);
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
          Floating WhatsApp
        </h3>
        <p className="text-sm text-muted-foreground">
          Tampilkan tombol WhatsApp mengambang di halaman publik
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
            <CardDescription>Aktifkan atau nonaktifkan tombol WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan Floating WhatsApp</Label>
                <p className="text-sm text-muted-foreground">
                  Tombol akan muncul di sudut layar
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => handleChange("enabled", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan di Desktop</Label>
                <p className="text-sm text-muted-foreground">
                  Tampilkan di browser laptop/PC
                </p>
              </div>
              <Switch
                checked={settings.show_on_desktop}
                onCheckedChange={(checked) => handleChange("show_on_desktop", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan di Mobile</Label>
                <p className="text-sm text-muted-foreground">
                  Tampilkan di browser HP
                </p>
              </div>
              <Switch
                checked={settings.show_on_mobile}
                onCheckedChange={(checked) => handleChange("show_on_mobile", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konfigurasi</CardTitle>
            <CardDescription>Pengaturan nomor dan pesan default</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nomor WhatsApp</Label>
              <Input
                value={settings.phone_number}
                onChange={(e) => handleChange("phone_number", e.target.value)}
                placeholder="6281234567890"
              />
              <p className="text-xs text-muted-foreground">
                Format: 62xxx (kode negara tanpa + atau 0)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Pesan Default</Label>
              <Textarea
                value={settings.default_message}
                onChange={(e) => handleChange("default_message", e.target.value)}
                placeholder="Halo, saya ingin bertanya..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Teks Selamat Datang (Tooltip)</Label>
              <Input
                value={settings.welcome_text}
                onChange={(e) => handleChange("welcome_text", e.target.value)}
                placeholder="Ada yang bisa kami bantu?"
              />
            </div>

            <div className="space-y-2">
              <Label>Efek Animasi</Label>
              <Select value={settings.animation_effect} onValueChange={(v) => handleChange("animation_effect", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pulse">Pulsing (Denyut)</SelectItem>
                  <SelectItem value="glow">Glow (Pendaran Cahaya)</SelectItem>
                  <SelectItem value="wobble">Wobble (Goyangan)</SelectItem>
                  <SelectItem value="ripple">Ripple (Gelombang)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>Lihat tampilan tombol WhatsApp</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <div className="relative">
                <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                  <MessageCircle className="h-7 w-7 text-white" />
                </div>
                {settings.welcome_text && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 px-3 py-1 rounded-lg shadow text-xs whitespace-nowrap">
                    {settings.welcome_text}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Contoh Tampilan</p>
                <p className="text-xs text-muted-foreground">
                  Tombol akan muncul di sudut kanan bawah layar
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={getWhatsappUrl()} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Test Link
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
