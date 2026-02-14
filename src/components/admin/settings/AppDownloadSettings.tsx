import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Smartphone, Plus, Trash2, Download } from "lucide-react";

interface AppDownloadSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  apk_url: string;
  playstore_url: string;
  appstore_url: string;
  features: string[];
  show_qr_code: boolean;
}

const defaultSettings: AppDownloadSettings = {
  enabled: true,
  title: "Download Aplikasi AbsensiKu",
  subtitle: "Tersedia untuk Android",
  description: "Unduh aplikasi mobile AbsensiKu untuk kemudahan absensi di mana saja.",
  apk_url: "",
  playstore_url: "",
  appstore_url: "",
  features: [
    "Absensi dengan GPS akurat",
    "Notifikasi pengingat absen",
    "Riwayat kehadiran lengkap",
    "Pengajuan izin & cuti online",
  ],
  show_qr_code: false,
};

export function AppDownloadSettings() {
  const [settings, setSettings] = useState<AppDownloadSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "app_download_settings")
        .maybeSingle();

      if (data?.value) {
        setSettings({ ...defaultSettings, ...(data.value as Partial<AppDownloadSettings>) });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "app_download_settings")
        .maybeSingle();

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: jsonValue, updated_at: new Date().toISOString() })
          .eq("key", "app_download_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({ key: "app_download_settings", value: jsonValue });
      }

      toast.success("Pengaturan download aplikasi berhasil disimpan");
    } catch (err) {
      toast.error("Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  const addFeature = () => {
    setSettings({ ...settings, features: [...settings.features, ""] });
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...settings.features];
    newFeatures[index] = value;
    setSettings({ ...settings, features: newFeatures });
  };

  const removeFeature = (index: number) => {
    setSettings({ ...settings, features: settings.features.filter((_, i) => i !== index) });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Pengaturan Download Aplikasi
          </CardTitle>
          <CardDescription>
            Kelola section download aplikasi mobile di halaman depan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Aktifkan Section Download</Label>
              <p className="text-sm text-muted-foreground">Tampilkan section download aplikasi di halaman depan</p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
            />
          </div>

          {/* Title & Description */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Judul Section</Label>
              <Input
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="Download Aplikasi AbsensiKu"
              />
            </div>
            <div className="space-y-2">
              <Label>Sub Judul</Label>
              <Input
                value={settings.subtitle}
                onChange={(e) => setSettings({ ...settings, subtitle: e.target.value })}
                placeholder="Tersedia untuk Android"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Deskripsi</Label>
            <Textarea
              value={settings.description}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
              placeholder="Unduh aplikasi mobile..."
              rows={2}
            />
          </div>

          {/* Download URLs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Link Download
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL Download APK</Label>
                <Input
                  value={settings.apk_url}
                  onChange={(e) => setSettings({ ...settings, apk_url: e.target.value })}
                  placeholder="https://example.com/app.apk"
                />
                <p className="text-xs text-muted-foreground">Link langsung ke file APK</p>
              </div>
              <div className="space-y-2">
                <Label>URL Google Play Store</Label>
                <Input
                  value={settings.playstore_url}
                  onChange={(e) => setSettings({ ...settings, playstore_url: e.target.value })}
                  placeholder="https://play.google.com/store/apps/details?id=..."
                />
              </div>
              <div className="space-y-2">
                <Label>URL App Store (iOS)</Label>
                <Input
                  value={settings.appstore_url}
                  onChange={(e) => setSettings({ ...settings, appstore_url: e.target.value })}
                  placeholder="https://apps.apple.com/app/..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Features List */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Fitur Aplikasi</CardTitle>
              <Button size="sm" variant="outline" onClick={addFeature}>
                <Plus className="h-4 w-4 mr-1" />
                Tambah
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {settings.features.map((feature, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    value={feature}
                    onChange={(e) => updateFeature(index, e.target.value)}
                    placeholder="Fitur aplikasi..."
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeFeature(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* QR Code Option */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Tampilkan QR Code</Label>
              <p className="text-sm text-muted-foreground">Tampilkan QR code untuk scan download</p>
            </div>
            <Switch
              checked={settings.show_qr_code}
              onCheckedChange={(checked) => setSettings({ ...settings, show_qr_code: checked })}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
