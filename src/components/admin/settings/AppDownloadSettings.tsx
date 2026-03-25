import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Smartphone, Download } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface AppDownloadSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  apk_url: string;
  playstore_url: string;
  appstore_url: string;
  show_qr_code: boolean;
}

const defaultSettings: AppDownloadSettings = {
  enabled: true,
  title: "Unduh Aplikasi AbsensiKu",
  subtitle: "Tersedia untuk Android",
  description: "Unduh aplikasi seluler AbsensiKu untuk kemudahan absensi di mana saja.",
  apk_url: "",
  playstore_url: "",
  appstore_url: "",
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
      const { data } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "app_download_settings")
            .maybeSingle(),
        10000,
        "Load app download settings timeout"
      );

      if (data?.value) {
        setSettings({ ...defaultSettings, ...(data.value as Partial<AppDownloadSettings>) });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.app_download.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan unduh aplikasi", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("id")
            .eq("key", "app_download_settings")
            .maybeSingle(),
        10000,
        "Load app download existing setting timeout"
      );

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: jsonValue, updated_at: new Date().toISOString() })
              .eq("key", "app_download_settings"),
          10000,
          "Update app download setting timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert({ key: "app_download_settings", value: jsonValue }),
          10000,
          "Insert app download setting timeout"
        );
        if (error) throw error;
      }

      toast.success("Pengaturan unduh aplikasi berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.app_download.save");
      toast.error(appendErrorReference("Gagal menyimpan", errorRef));
    } finally {
      setIsSaving(false);
    }
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
            Pengaturan Unduh Aplikasi
          </CardTitle>
          <CardDescription>
            Kelola bagian unduh aplikasi seluler di halaman depan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Aktifkan Bagian Unduh</Label>
              <p className="text-sm text-muted-foreground">Tampilkan bagian unduh aplikasi di halaman depan</p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
            />
          </div>

          {/* Title & Description */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Judul Bagian</Label>
              <Input
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="Unduh Aplikasi AbsensiKu"
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
              placeholder="Unduh aplikasi seluler..."
              rows={2}
            />
          </div>

          {/* Download URLs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Tautan Unduh
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL Unduh Aplikasi</Label>
                <Input
                  value={settings.apk_url}
                  onChange={(e) => setSettings({ ...settings, apk_url: e.target.value })}
                  placeholder="https://example.com/app.apk"
                />
                <p className="text-xs text-muted-foreground">Tautan langsung ke file aplikasi Android</p>
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

          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground">Fitur Aplikasi di section unduh sudah otomatis</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Daftar fitur di halaman unduh sekarang mengikuti data dari menu <strong>Pengaturan Fitur</strong> agar tidak dobel input.
            </p>
          </div>

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
