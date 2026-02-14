import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Megaphone } from "lucide-react";

interface PromoSidebarSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  show_banner_sidebar: boolean;
}

const defaultSettings: PromoSidebarSettings = {
  enabled: true,
  title: "Promosi & Info Terbaru",
  subtitle: "Dapatkan penawaran menarik dan informasi terkini dari AbsensiKu",
  show_banner_sidebar: true,
};

export function PromoSidebarSettings() {
  const [settings, setSettings] = useState<PromoSidebarSettings>(defaultSettings);
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
        .eq("key", "promo_sidebar_settings")
        .maybeSingle();

      if (data?.value) {
        setSettings({ ...defaultSettings, ...(data.value as Partial<PromoSidebarSettings>) });
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
        .eq("key", "promo_sidebar_settings")
        .maybeSingle();

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: jsonValue, updated_at: new Date().toISOString() })
          .eq("key", "promo_sidebar_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({ key: "promo_sidebar_settings", value: jsonValue });
      }

      // Also update homepage_sections table for promo_sidebar
      await supabase
        .from("homepage_sections")
        .update({ 
          is_enabled: settings.enabled,
          settings: jsonValue,
          updated_at: new Date().toISOString() 
        })
        .eq("section_key", "promo_sidebar");

      toast.success("Pengaturan Promosi & Info berhasil disimpan");
    } catch (err) {
      toast.error("Gagal menyimpan");
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
            <Megaphone className="h-5 w-5" />
            Pengaturan Promosi & Info Terbaru
          </CardTitle>
          <CardDescription>
            Kelola section "Promosi & Info Terbaru" yang menampilkan banner sidebar di halaman depan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Aktifkan Section</Label>
              <p className="text-sm text-muted-foreground">Tampilkan section promosi di halaman depan</p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
            />
          </div>

          {/* Title & Subtitle */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Judul Section</Label>
              <Input
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="Promosi & Info Terbaru"
              />
            </div>
            <div className="space-y-2">
              <Label>Sub Judul / Deskripsi</Label>
              <Textarea
                value={settings.subtitle}
                onChange={(e) => setSettings({ ...settings, subtitle: e.target.value })}
                placeholder="Dapatkan penawaran menarik..."
                rows={2}
              />
            </div>
          </div>

          {/* Show Banner Sidebar */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Tampilkan Banner Sidebar</Label>
              <p className="text-sm text-muted-foreground">
                Menampilkan banner sidebar di section ini. Kelola banner di tab "Sidebar".
              </p>
            </div>
            <Switch
              checked={settings.show_banner_sidebar}
              onCheckedChange={(checked) => setSettings({ ...settings, show_banner_sidebar: checked })}
            />
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Catatan:</strong> Banner yang ditampilkan dikelola di tab "Sidebar". 
              Pastikan banner aktif dan posisinya diatur ke "homepage" atau "all".
              Maksimal 2 banner yang akan ditampilkan.
            </p>
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
