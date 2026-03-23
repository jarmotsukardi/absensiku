import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface GeneralSettingsData {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  logoUrl: string;
  adminEmail: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
}

const defaultSettings: GeneralSettingsData = {
  siteName: "AbsensiKu",
  siteTagline: "Platform Absensi GPS Terpercaya",
  siteDescription: "Aplikasi absensi pegawai berbasis GPS untuk pemerintah dan swasta",
  logoUrl: "",
  adminEmail: "admin@absensi.app",
  supportEmail: "support@absensi.app",
  supportPhone: "021-12345678",
  address: "Jakarta, Indonesia",
  maintenanceMode: false,
  registrationEnabled: true,
};

export function GeneralSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<GeneralSettingsData>(defaultSettings);

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
            .eq("key", "general_settings")
            .maybeSingle(),
        10000,
        "Load general settings timeout"
      );

      if (data?.value) {
        setSettings({ ...defaultSettings, ...(data.value as Record<string, unknown>) });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.general.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan umum", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("id")
            .eq("key", "general_settings")
            .maybeSingle(),
        10000,
        "Load general settings for save timeout"
      );

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: jsonValue, updated_at: new Date().toISOString() })
              .eq("key", "general_settings"),
          10000,
          "Update general settings timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert({ key: "general_settings", value: jsonValue }),
          10000,
          "Insert general settings timeout"
        );
        if (error) throw error;
      }

      toast.success("Pengaturan umum berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.general.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
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
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Pengaturan Umum
        </h3>
        <p className="text-sm text-muted-foreground">
          Konfigurasi dasar untuk situs Anda
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identitas Situs</CardTitle>
            <CardDescription>Nama dan deskripsi situs Anda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="siteName">Nama Situs</Label>
                <Input
                  id="siteName"
                  value={settings.siteName}
                  onChange={(e) => handleChange("siteName", e.target.value)}
                  placeholder="Nama aplikasi"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siteTagline">Tagline</Label>
                <Input
                  id="siteTagline"
                  value={settings.siteTagline}
                  onChange={(e) => handleChange("siteTagline", e.target.value)}
                  placeholder="Tagline singkat"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="siteDescription">Deskripsi Situs</Label>
              <Textarea
                id="siteDescription"
                value={settings.siteDescription}
                onChange={(e) => handleChange("siteDescription", e.target.value)}
                placeholder="Deskripsi lengkap tentang aplikasi"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Logo Situs (URL)</Label>
              <Input
                value={settings.logoUrl || ""}
                onChange={(e) => handleChange("logoUrl", e.target.value)}
                placeholder="https://example.com/logo.png"
              />
              {settings.logoUrl && (
                <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                  <img src={settings.logoUrl} alt="Logo" className="h-full object-contain" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Kontak</CardTitle>
            <CardDescription>Email dan nomor telepon untuk support</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Email Admin</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={settings.adminEmail}
                  onChange={(e) => handleChange("adminEmail", e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportEmail">Email Support</Label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => handleChange("supportEmail", e.target.value)}
                  placeholder="support@example.com"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="supportPhone">Telepon Support</Label>
                <Input
                  id="supportPhone"
                  value={settings.supportPhone}
                  onChange={(e) => handleChange("supportPhone", e.target.value)}
                  placeholder="021-12345678"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Alamat</Label>
                <Input
                  id="address"
                  value={settings.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="Alamat kantor"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mode Sistem</CardTitle>
            <CardDescription>Pengaturan mode operasi situs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="maintenanceMode" className="font-medium">Mode Maintenance</Label>
                <p className="text-sm text-muted-foreground">
                  Aktifkan untuk menutup sementara akses pengguna
                </p>
              </div>
              <Switch
                id="maintenanceMode"
                checked={settings.maintenanceMode}
                onCheckedChange={(checked) => handleChange("maintenanceMode", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="registrationEnabled" className="font-medium">Registrasi Terbuka</Label>
                <p className="text-sm text-muted-foreground">
                  Izinkan organisasi baru mendaftar
                </p>
              </div>
              <Switch
                id="registrationEnabled"
                checked={settings.registrationEnabled}
                onCheckedChange={(checked) => handleChange("registrationEnabled", checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
