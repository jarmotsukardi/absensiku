import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface HeroSettingsData {
  title: string;
  subtitle: string;
  description: string;
  cta_text: string;
  cta_link: string;
  secondary_cta_text: string;
  secondary_cta_link: string;
  background_image: string;
  show_statistics: boolean;
}

const defaultSettings: HeroSettingsData = {
  title: "Sistem Absensi Digital Modern",
  subtitle: "AbsensiKu",
  description: "Kelola kehadiran pegawai dengan mudah menggunakan teknologi GPS",
  cta_text: "Daftar Sekarang",
  cta_link: "/auth?mode=register",
  secondary_cta_text: "Pelajari Lebih Lanjut",
  secondary_cta_link: "#features",
  background_image: "",
  show_statistics: true,
};

export function HeroSettings() {
  const [settings, setSettings] = useState<HeroSettingsData>(defaultSettings);
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
            .eq("key", "hero_settings")
            .maybeSingle(),
        10000,
        "Load hero settings timeout"
      );

      if (data?.value) {
        setSettings({ ...defaultSettings, ...(data.value as Record<string, unknown>) });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.hero.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan hero", errorRef));
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
            .eq("key", "hero_settings")
            .maybeSingle(),
        10000,
        "Load hero existing setting timeout"
      );

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: jsonValue, updated_at: new Date().toISOString() })
              .eq("key", "hero_settings"),
          10000,
          "Update hero settings timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert({ key: "hero_settings", value: jsonValue }),
          10000,
          "Insert hero settings timeout"
        );
        if (error) throw error;
      }
      
      toast.success("Pengaturan hero berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.hero.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Judul Utama</Label>
          <Input value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Sub Judul</Label>
          <Input value={settings.subtitle} onChange={(e) => setSettings({ ...settings, subtitle: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Deskripsi</Label>
        <Textarea value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} rows={3} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Teks CTA Utama</Label>
          <Input value={settings.cta_text} onChange={(e) => setSettings({ ...settings, cta_text: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Link CTA</Label>
          <Input value={settings.cta_link} onChange={(e) => setSettings({ ...settings, cta_link: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center justify-between p-4 rounded-lg border">
        <div>
          <Label>Tampilkan Statistik</Label>
          <p className="text-sm text-muted-foreground">Menampilkan angka statistik di hero</p>
        </div>
        <Switch checked={settings.show_statistics} onCheckedChange={(checked) => setSettings({ ...settings, show_statistics: checked })} />
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan
        </Button>
      </div>
    </div>
  );
}
