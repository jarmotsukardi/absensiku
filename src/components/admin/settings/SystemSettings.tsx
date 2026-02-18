import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { Settings, Save, Database, Shield, Clock, AlertTriangle, Trash2, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface SystemSettingsData {
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  language: string;
  sessionTimeout: string;
  maxLoginAttempts: string;
  passwordMinLength: string;
  requireStrongPassword: boolean;
  enableTwoFactorSuperAdmin: boolean;
  enableTwoFactorOrgAdmin: boolean;
  autoBackup: boolean;
  backupFrequency: string;
  logRetentionDays: string;
  enableAuditLog: boolean;
  restrictAccessDuringAttendance: boolean;
  accessRestrictionBufferHours: string;
}

const defaultSettings: SystemSettingsData = {
  timezone: "Asia/Jakarta",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "24h",
  language: "id",
  sessionTimeout: "60",
  maxLoginAttempts: "5",
  passwordMinLength: "8",
  requireStrongPassword: true,
  enableTwoFactorSuperAdmin: false,
  enableTwoFactorOrgAdmin: false,
  autoBackup: true,
  backupFrequency: "daily",
  logRetentionDays: "90",
  enableAuditLog: true,
  restrictAccessDuringAttendance: false,
  accessRestrictionBufferHours: "3",
};

export function SystemSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettingsData>(defaultSettings);

  // Fetch settings dari database
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("key, value")
          .in("key", [
            "system_config",
            "restrict_access_during_attendance",
            "access_restriction_buffer_hours",
            "super_admin_2fa_enabled",
            "org_admin_2fa_enabled",
          ]);

        if (error) throw error;

        // Parse settings dari database
        const newSettings = { ...defaultSettings };
        
        data?.forEach((item) => {
          if (item.key === "system_config" && typeof item.value === "object") {
            Object.assign(newSettings, item.value);
          } else if (item.key === "restrict_access_during_attendance") {
            newSettings.restrictAccessDuringAttendance = item.value === "true" || item.value === true;
          } else if (item.key === "access_restriction_buffer_hours") {
            newSettings.accessRestrictionBufferHours = String(item.value);
          } else if (item.key === "super_admin_2fa_enabled") {
            newSettings.enableTwoFactorSuperAdmin = item.value === "true" || item.value === true;
          } else if (item.key === "org_admin_2fa_enabled") {
            newSettings.enableTwoFactorOrgAdmin = item.value === "true" || item.value === true;
          }
        });

        setSettings(newSettings);
      } catch (error) {
        console.error("Error fetching settings:", error);
        toast.error("Gagal memuat pengaturan");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleChange = (field: keyof SystemSettingsData, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Simpan pengaturan ke beberapa key di system_settings
      const updates = [
        {
          key: "system_config",
          value: {
            timezone: settings.timezone,
            dateFormat: settings.dateFormat,
            timeFormat: settings.timeFormat,
            language: settings.language,
            sessionTimeout: settings.sessionTimeout,
            maxLoginAttempts: settings.maxLoginAttempts,
            passwordMinLength: settings.passwordMinLength,
            requireStrongPassword: settings.requireStrongPassword,
            autoBackup: settings.autoBackup,
            backupFrequency: settings.backupFrequency,
            logRetentionDays: settings.logRetentionDays,
            enableAuditLog: settings.enableAuditLog,
          },
          description: "Konfigurasi sistem umum",
        },
        {
          key: "restrict_access_during_attendance",
          value: String(settings.restrictAccessDuringAttendance),
          description: "Batasi akses ke halaman non-absensi saat jam sibuk absensi",
        },
        {
          key: "access_restriction_buffer_hours",
          value: settings.accessRestrictionBufferHours,
          description: "Jam buffer setelah jam pulang sebelum akses dibuka kembali",
        },
        {
          key: "super_admin_2fa_enabled",
          value: String(settings.enableTwoFactorSuperAdmin),
          description: "Aktifkan 2FA untuk login Super Admin",
        },
        {
          key: "org_admin_2fa_enabled",
          value: String(settings.enableTwoFactorOrgAdmin),
          description: "Aktifkan 2FA untuk login Admin Organisasi",
        },
      ];

      // Upsert semua pengaturan
      for (const update of updates) {
        const { data: existing } = await supabase
          .from("system_settings")
          .select("id")
          .eq("key", update.key)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("system_settings")
            .update({ value: update.value, updated_at: new Date().toISOString() })
            .eq("key", update.key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("system_settings")
            .insert(update);
          if (error) throw error;
        }
      }

      toast.success("Pengaturan sistem berhasil disimpan");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Gagal menyimpan pengaturan");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCache = async () => {
    // Clear localStorage cache
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.startsWith("supabase") || key.startsWith("cache_")
    );
    keysToRemove.forEach(key => localStorage.removeItem(key));
    toast.success("Cache berhasil dibersihkan");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Pengaturan Sistem
        </h3>
        <p className="text-sm text-muted-foreground">
          Konfigurasi teknis dan keamanan
        </p>
      </div>

      <div className="grid gap-6">
        {/* Resource Prioritization - NEW SECTION */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Prioritas Resource Absensi
            </CardTitle>
            <CardDescription>
              Optimalkan performa server saat jam sibuk absensi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
              <div>
                <Label className="font-medium">Batasi Akses Non-Absensi</Label>
                <p className="text-sm text-muted-foreground">
                  Prioritaskan resource server untuk absensi saat jam masuk/pulang
                </p>
              </div>
              <Switch
                checked={settings.restrictAccessDuringAttendance}
                onCheckedChange={(checked) => handleChange("restrictAccessDuringAttendance", checked)}
              />
            </div>
            {settings.restrictAccessDuringAttendance && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/30">
                <Label>Buffer Waktu (jam)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Berapa jam setelah jam pulang sebelum akses non-absensi dibuka kembali
                </p>
                <Select
                  value={settings.accessRestrictionBufferHours}
                  onValueChange={(value) => handleChange("accessRestrictionBufferHours", value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Jam</SelectItem>
                    <SelectItem value="2">2 Jam</SelectItem>
                    <SelectItem value="3">3 Jam</SelectItem>
                    <SelectItem value="4">4 Jam</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Lokalisasi
            </CardTitle>
            <CardDescription>Pengaturan waktu dan format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(value) => handleChange("timezone", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Jakarta">WIB (UTC+7)</SelectItem>
                    <SelectItem value="Asia/Makassar">WITA (UTC+8)</SelectItem>
                    <SelectItem value="Asia/Jayapura">WIT (UTC+9)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bahasa</Label>
                <Select
                  value={settings.language}
                  onValueChange={(value) => handleChange("language", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="id">Bahasa Indonesia</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Format Tanggal</Label>
                <Select
                  value={settings.dateFormat}
                  onValueChange={(value) => handleChange("dateFormat", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format Waktu</Label>
                <Select
                  value={settings.timeFormat}
                  onValueChange={(value) => handleChange("timeFormat", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24 Jam (14:30)</SelectItem>
                    <SelectItem value="12h">12 Jam (2:30 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Keamanan
            </CardTitle>
            <CardDescription>Pengaturan autentikasi dan akses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Session Timeout (menit)</Label>
                <Input
                  type="number"
                  value={settings.sessionTimeout}
                  onChange={(e) => handleChange("sessionTimeout", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Login Attempts</Label>
                <Input
                  type="number"
                  value={settings.maxLoginAttempts}
                  onChange={(e) => handleChange("maxLoginAttempts", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Min Password Length</Label>
                <Input
                  type="number"
                  value={settings.passwordMinLength}
                  onChange={(e) => handleChange("passwordMinLength", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Password Kuat Wajib</Label>
                <p className="text-sm text-muted-foreground">
                  Harus mengandung huruf besar, angka, dan simbol
                </p>
              </div>
              <Switch
                checked={settings.requireStrongPassword}
                onCheckedChange={(checked) => handleChange("requireStrongPassword", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">2FA Super Admin</Label>
                <p className="text-sm text-muted-foreground">
                  Aktifkan 2FA untuk login Super Admin
                </p>
              </div>
              <Switch
                checked={settings.enableTwoFactorSuperAdmin}
                onCheckedChange={(checked) => handleChange("enableTwoFactorSuperAdmin", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">2FA Admin Organisasi</Label>
                <p className="text-sm text-muted-foreground">
                  Aktifkan 2FA untuk login Admin Organisasi/Instansi
                </p>
              </div>
              <Switch
                checked={settings.enableTwoFactorOrgAdmin}
                onCheckedChange={(checked) => handleChange("enableTwoFactorOrgAdmin", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database & Backup
            </CardTitle>
            <CardDescription>Pengaturan backup dan penyimpanan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Auto Backup</Label>
                <p className="text-sm text-muted-foreground">
                  Backup otomatis database
                </p>
              </div>
              <Switch
                checked={settings.autoBackup}
                onCheckedChange={(checked) => handleChange("autoBackup", checked)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Frekuensi Backup</Label>
                <Select
                  value={settings.backupFrequency}
                  onValueChange={(value) => handleChange("backupFrequency", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Setiap Jam</SelectItem>
                    <SelectItem value="daily">Harian</SelectItem>
                    <SelectItem value="weekly">Mingguan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Retensi Log (hari)</Label>
                <Input
                  type="number"
                  value={settings.logRetentionDays}
                  onChange={(e) => handleChange("logRetentionDays", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Audit Log</Label>
                <p className="text-sm text-muted-foreground">
                  Catat semua aktivitas penting
                </p>
              </div>
              <Switch
                checked={settings.enableAuditLog}
                onCheckedChange={(checked) => handleChange("enableAuditLog", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Zona Bahaya
            </CardTitle>
            <CardDescription>Aksi yang tidak dapat dibatalkan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-4">
              <div>
                <Label className="font-medium">Bersihkan Cache</Label>
                <p className="text-sm text-muted-foreground">
                  Hapus semua data cache sistem
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleClearCache}>
                <Trash2 className="h-4 w-4 mr-2" />
                Bersihkan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <PageGlossarySection preset="settings_system" />

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
