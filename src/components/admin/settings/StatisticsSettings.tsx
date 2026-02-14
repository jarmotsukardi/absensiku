import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, BarChart3 } from "lucide-react";

interface StatisticsSettings {
  title: string;
  subtitle: string;
  show_active_institutions: boolean;
  show_employees: boolean;
  show_provinces: boolean;
  show_uptime: boolean;
  institutions_count: number;
  employees_count: number;
  provinces_count: number;
  uptime_percent: number;
}

const defaultSettings: StatisticsSettings = {
  title: "Platform Terpercaya",
  subtitle: "Dipercaya oleh berbagai instansi di seluruh Indonesia",
  show_active_institutions: true,
  show_employees: true,
  show_provinces: true,
  show_uptime: true,
  institutions_count: 500,
  employees_count: 50000,
  provinces_count: 34,
  uptime_percent: 99.9,
};

export function StatisticsSettings() {
  const [settings, setSettings] = useState<StatisticsSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("settings")
        .eq("section_key", "statistics")
        .maybeSingle();

      if (error) throw error;
      if (data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
        setSettings({ ...defaultSettings, ...(data.settings as Record<string, unknown>) as Partial<StatisticsSettings> });
      }
    } catch (error) {
      console.error("Error fetching statistics settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("homepage_sections")
        .update({ 
          settings: JSON.parse(JSON.stringify(settings)) as Json,
          updated_at: new Date().toISOString()
        })
        .eq("section_key", "statistics");

      if (error) throw error;
      toast.success("Pengaturan statistik berhasil disimpan");
    } catch (error) {
      toast.error("Gagal menyimpan pengaturan");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Pengaturan Statistik Pengguna
          </CardTitle>
          <CardDescription>
            Atur tampilan statistik di halaman depan (instansi aktif, pegawai, provinsi, uptime)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Teks Header */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Judul Section</Label>
              <Input
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="Platform Terpercaya"
              />
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input
                value={settings.subtitle}
                onChange={(e) => setSettings({ ...settings, subtitle: e.target.value })}
                placeholder="Dipercaya oleh berbagai instansi"
              />
            </div>
          </div>

          {/* Toggle Visibility */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label className="text-sm">Instansi Aktif</Label>
              <Switch
                checked={settings.show_active_institutions}
                onCheckedChange={(checked) => setSettings({ ...settings, show_active_institutions: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label className="text-sm">Pegawai</Label>
              <Switch
                checked={settings.show_employees}
                onCheckedChange={(checked) => setSettings({ ...settings, show_employees: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label className="text-sm">Provinsi</Label>
              <Switch
                checked={settings.show_provinces}
                onCheckedChange={(checked) => setSettings({ ...settings, show_provinces: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label className="text-sm">Uptime</Label>
              <Switch
                checked={settings.show_uptime}
                onCheckedChange={(checked) => setSettings({ ...settings, show_uptime: checked })}
              />
            </div>
          </div>

          {/* Nilai Statistik */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Jumlah Instansi</Label>
              <Input
                type="number"
                value={settings.institutions_count}
                onChange={(e) => setSettings({ ...settings, institutions_count: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Jumlah Pegawai</Label>
              <Input
                type="number"
                value={settings.employees_count}
                onChange={(e) => setSettings({ ...settings, employees_count: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Jumlah Provinsi</Label>
              <Input
                type="number"
                value={settings.provinces_count}
                onChange={(e) => setSettings({ ...settings, provinces_count: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Uptime (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.uptime_percent}
                onChange={(e) => setSettings({ ...settings, uptime_percent: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Simpan Pengaturan
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
