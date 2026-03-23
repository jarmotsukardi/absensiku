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

interface CTASettingsData {
  title: string;
  description: string;
  primary_button_text: string;
  primary_button_link: string;
  secondary_button_text: string;
  secondary_button_link: string;
  background_color: string;
  show_section: boolean;
}

const defaultSettings: CTASettingsData = {
  title: "Siap Tingkatkan Produktivitas?",
  description: "Bergabung bersama ribuan organisasi yang telah menggunakan AbsensiKu untuk mengelola kehadiran pegawai dengan lebih efisien.",
  primary_button_text: "Mulai Sekarang",
  primary_button_link: "/auth?mode=register",
  secondary_button_text: "Hubungi Kami",
  secondary_button_link: "#contact",
  background_color: "primary",
  show_section: true,
};

export function CTASettings() {
  const [settings, setSettings] = useState<CTASettingsData>(defaultSettings);
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
            .eq("key", "cta_settings")
            .maybeSingle(),
        10000,
        "Load CTA settings timeout"
      );

      if (data?.value) {
        setSettings({ ...defaultSettings, ...(data.value as Record<string, unknown>) });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.cta.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan CTA", errorRef));
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
            .eq("key", "cta_settings")
            .maybeSingle(),
        10000,
        "Load CTA existing setting timeout"
      );

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: jsonValue, updated_at: new Date().toISOString() })
              .eq("key", "cta_settings"),
          10000,
          "Update CTA settings timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert({ key: "cta_settings", value: jsonValue }),
          10000,
          "Insert CTA settings timeout"
        );
        if (error) throw error;
      }
      
      toast.success("Pengaturan CTA berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.cta.save");
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
      <div className="flex items-center justify-between p-4 rounded-lg border">
        <div>
          <Label>Tampilkan Section CTA</Label>
          <p className="text-sm text-muted-foreground">Aktifkan section Call to Action di halaman depan</p>
        </div>
        <Switch 
          checked={settings.show_section} 
          onCheckedChange={(checked) => setSettings({ ...settings, show_section: checked })} 
        />
      </div>

      <div className="space-y-2">
        <Label>Judul</Label>
        <Input 
          value={settings.title} 
          onChange={(e) => setSettings({ ...settings, title: e.target.value })} 
          placeholder="Siap Tingkatkan Produktivitas?"
        />
      </div>

      <div className="space-y-2">
        <Label>Deskripsi</Label>
        <Textarea 
          value={settings.description} 
          onChange={(e) => setSettings({ ...settings, description: e.target.value })} 
          rows={3}
          placeholder="Deskripsi ajakan untuk mendaftar..."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Teks Tombol Utama</Label>
          <Input 
            value={settings.primary_button_text} 
            onChange={(e) => setSettings({ ...settings, primary_button_text: e.target.value })} 
          />
        </div>
        <div className="space-y-2">
          <Label>Link Tombol Utama</Label>
          <Input 
            value={settings.primary_button_link} 
            onChange={(e) => setSettings({ ...settings, primary_button_link: e.target.value })} 
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Teks Tombol Sekunder</Label>
          <Input 
            value={settings.secondary_button_text} 
            onChange={(e) => setSettings({ ...settings, secondary_button_text: e.target.value })} 
          />
        </div>
        <div className="space-y-2">
          <Label>Link Tombol Sekunder</Label>
          <Input 
            value={settings.secondary_button_link} 
            onChange={(e) => setSettings({ ...settings, secondary_button_link: e.target.value })} 
          />
        </div>
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
