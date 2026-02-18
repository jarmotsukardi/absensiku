import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Shield,
  MapPin,
  Smartphone,
  AlertTriangle,
  Settings,
  Save,
  Loader2,
  Eye,
  Fingerprint,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface SecuritySettings {
  // GPS Validation
  require_realtime_location: boolean;
  // Device Validation
  block_desktop_browser: boolean;
  block_all_browsers: boolean;
  allow_iphone_safari: boolean;
  // Device Binding Settings
  enable_device_binding: boolean;
  max_device_reset_count: number;
  require_password_change_for_reset: boolean;
  otp_send_rate_limit_enabled: boolean;
  otp_send_max_attempts: number;
  otp_send_lockout_minutes: number;
  otp_send_window_minutes: number;
  // APK Compatibility
  min_android_version: number;
}

export default function AttendanceSecuritySettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SecuritySettings>({
    // GPS Validation
    require_realtime_location: true,
    // Device Validation
    block_desktop_browser: true,
    block_all_browsers: false,
    allow_iphone_safari: true,
    // Device Binding
    enable_device_binding: true,
    max_device_reset_count: 3,
    require_password_change_for_reset: true,
    otp_send_rate_limit_enabled: true,
    otp_send_max_attempts: 3,
    otp_send_lockout_minutes: 60,
    otp_send_window_minutes: 60,
    // APK Compatibility
    min_android_version: 7,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoadError(null);
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .eq("key", "attendance_security")
        .maybeSingle();

      if (error) throw error;

      if (data?.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
        // Merge dengan default settings untuk memastikan field baru tetap ada
        const savedSettings = data.value as Record<string, unknown>;
        setSettings(prev => ({
          // GPS Validation
          require_realtime_location: typeof savedSettings.require_realtime_location === 'boolean' ? savedSettings.require_realtime_location : prev.require_realtime_location,
          // Device Validation
          block_desktop_browser: typeof savedSettings.block_desktop_browser === 'boolean' ? savedSettings.block_desktop_browser : prev.block_desktop_browser,
          block_all_browsers: typeof savedSettings.block_all_browsers === 'boolean' ? savedSettings.block_all_browsers : prev.block_all_browsers,
          allow_iphone_safari: typeof savedSettings.allow_iphone_safari === 'boolean' ? savedSettings.allow_iphone_safari : prev.allow_iphone_safari,
          // Device Binding
          enable_device_binding: typeof savedSettings.enable_device_binding === 'boolean' ? savedSettings.enable_device_binding : prev.enable_device_binding,
          max_device_reset_count: typeof savedSettings.max_device_reset_count === 'number' ? savedSettings.max_device_reset_count : prev.max_device_reset_count,
          require_password_change_for_reset: typeof savedSettings.require_password_change_for_reset === 'boolean' ? savedSettings.require_password_change_for_reset : prev.require_password_change_for_reset,
          otp_send_rate_limit_enabled: typeof savedSettings.otp_send_rate_limit_enabled === 'boolean' ? savedSettings.otp_send_rate_limit_enabled : prev.otp_send_rate_limit_enabled,
          otp_send_max_attempts: typeof savedSettings.otp_send_max_attempts === 'number' ? savedSettings.otp_send_max_attempts : prev.otp_send_max_attempts,
          otp_send_lockout_minutes: typeof savedSettings.otp_send_lockout_minutes === 'number' ? savedSettings.otp_send_lockout_minutes : prev.otp_send_lockout_minutes,
          otp_send_window_minutes: typeof savedSettings.otp_send_window_minutes === 'number' ? savedSettings.otp_send_window_minutes : prev.otp_send_window_minutes,
          // APK Compatibility
          min_android_version: typeof savedSettings.min_android_version === 'number' ? savedSettings.min_android_version : prev.min_android_version,
        }));
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.attendance_security.fetch_settings");
      const message = appendErrorReference("Gagal memuat pengaturan keamanan", errorRef);
      toast.error(message);
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      setLoadError(null);
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "attendance_security")
        .maybeSingle();

      const settingsValue = JSON.parse(JSON.stringify(settings)) as Json;

      if (existing) {
        const { error } = await supabase
          .from("system_settings")
          .update({ value: settingsValue, updated_at: new Date().toISOString() })
          .eq("key", "attendance_security");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("system_settings")
          .insert({
            key: "attendance_security",
            value: settingsValue,
            description: "Pengaturan keamanan absensi GPS",
          });
        if (error) throw error;
      }

      toast.success("Pengaturan keamanan berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.attendance_security.save_settings", {
        block_all_browsers: settings.block_all_browsers,
        block_desktop_browser: settings.block_desktop_browser,
        allow_iphone_safari: settings.allow_iphone_safari,
        require_realtime_location: settings.require_realtime_location,
      });
      const message = appendErrorReference("Gagal menyimpan pengaturan keamanan", errorRef);
      toast.error(message);
      setLoadError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (key: keyof SecuritySettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Pengaturan Keamanan Absensi
            </h1>
            <p className="text-muted-foreground">
              Konfigurasi validasi dan deteksi kecurangan pada sistem absensi
            </p>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Simpan Pengaturan
              </>
            )}
          </Button>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Tabs defaultValue="gps" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="gps">Validasi GPS</TabsTrigger>
            <TabsTrigger value="device">Validasi Perangkat</TabsTrigger>
            <TabsTrigger value="binding">Device Binding</TabsTrigger>
            <TabsTrigger value="apk">Kompatibilitas Aplikasi</TabsTrigger>
          </TabsList>

          <TabsContent value="gps" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Validasi Lokasi Realtime
                </CardTitle>
                <CardDescription>
                  Pastikan absensi memakai koordinat terbaru saat proses check-in/check-out
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Wajib Lokasi Realtime</Label>
                    <p className="text-sm text-muted-foreground">
                      Memastikan lokasi diambil secara realtime, bukan dari cache
                    </p>
                  </div>
                  <Switch
                    checked={settings.require_realtime_location}
                    onCheckedChange={(checked) => updateSetting("require_realtime_location", checked)}
                  />
                </div>

                <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                    <div>
                      <h4 className="font-medium text-warning">Rekomendasi</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Aktifkan validasi lokasi realtime agar absensi memakai data GPS terbaru,
                        bukan lokasi cache yang sudah lama.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="device" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Validasi Perangkat
                </CardTitle>
                <CardDescription>
                  Pengaturan untuk memvalidasi perangkat yang digunakan untuk absensi
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Blokir Semua Browser</Label>
                    <p className="text-sm text-muted-foreground">
                      Memblokir akses absensi dari browser (desktop & mobile) dan memaksa penggunaan aplikasi mobile internal.
                    </p>
                  </div>
                  <Switch
                    checked={settings.block_all_browsers}
                    onCheckedChange={(checked) => updateSetting("block_all_browsers", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Blokir Browser Desktop</Label>
                    <p className="text-sm text-muted-foreground">
                      Absensi tidak dapat dilakukan via browser PC/Laptop (Windows, macOS, Linux)
                    </p>
                  </div>
                  <Switch
                    checked={settings.block_desktop_browser}
                    onCheckedChange={(checked) => updateSetting("block_desktop_browser", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Izinkan Safari iPhone</Label>
                    <p className="text-sm text-muted-foreground">
                      Saat "Blokir Semua Browser" aktif, Safari iPhone dapat dikecualikan untuk rute absensi berbasis browser.
                    </p>
                  </div>
                  <Switch
                    checked={settings.allow_iphone_safari}
                    onCheckedChange={(checked) => updateSetting("allow_iphone_safari", checked)}
                  />
                </div>

                <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                    <div>
                      <h4 className="font-medium text-warning">Catatan Penting</h4>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>"Blokir Semua Browser" akan memaksa pegawai menggunakan aplikasi mobile internal</li>
                        <li>Jika dimatikan, /employee/login dapat diakses sesuai kebijakan blokir lainnya</li>
                        <li>Pastikan aplikasi internal sudah tersedia sebelum mengaktifkan fitur ini</li>
                        <li>Admin tetap bisa mengakses halaman via browser</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="binding" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5" />
                  Device Binding (Android ID)
                </CardTitle>
                <CardDescription>
                  Pengaturan untuk mencegah titip absen dengan mengikat perangkat ke pegawai
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Aktifkan Device Binding</Label>
                    <p className="text-sm text-muted-foreground">
                      Setiap pegawai hanya bisa absen dari perangkat yang sudah terdaftar (Android ID)
                    </p>
                  </div>
                  <Switch
                    checked={settings.enable_device_binding}
                    onCheckedChange={(checked) => updateSetting("enable_device_binding", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Maks. Reset Device ID</Label>
                    <p className="text-sm text-muted-foreground">
                      Batas maksimal reset device mandiri per pegawai dalam 1 bulan berjalan (dienforce di backend).
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.max_device_reset_count}
                    onChange={(e) => setSettings(prev => ({ ...prev, max_device_reset_count: parseInt(e.target.value) || 3 }))}
                    className="w-20"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Wajib Ganti Password Saat Reset</Label>
                    <p className="text-sm text-muted-foreground">
                      Jika aktif, reset device mandiri wajib disertai penggantian password (divalidasi di backend).
                    </p>
                  </div>
                  <Switch
                    checked={settings.require_password_change_for_reset}
                    onCheckedChange={(checked) => updateSetting("require_password_change_for_reset", checked)}
                  />
                </div>

                <div className="p-4 bg-info/10 border border-info/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Fingerprint className="h-5 w-5 text-info mt-0.5" />
                    <div>
                      <h4 className="font-medium text-info">Cara Kerja Device Binding</h4>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Saat pertama kali absen, Android ID akan otomatis tersimpan</li>
                        <li>Absen selanjutnya harus dari perangkat dengan Android ID yang sama</li>
                        <li>Jika ganti HP, pegawai bisa reset mandiri via OTP (dan wajib ganti password jika pengaturan di bawah diaktifkan)</li>
                        <li>Admin dapat reset device ID pegawai melalui menu manajemen pegawai</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="font-medium">Aktifkan Lock OTP Reset Device</Label>
                      <p className="text-sm text-muted-foreground">
                        Membatasi pengiriman OTP reset device agar tidak disalahgunakan.
                      </p>
                    </div>
                    <Switch
                      checked={settings.otp_send_rate_limit_enabled}
                      onCheckedChange={(checked) => updateSetting("otp_send_rate_limit_enabled", checked)}
                    />
                  </div>

                  {settings.otp_send_rate_limit_enabled && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Maks. kirim OTP</Label>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={settings.otp_send_max_attempts}
                          onChange={(e) =>
                            setSettings(prev => ({ ...prev, otp_send_max_attempts: Math.max(1, parseInt(e.target.value) || 3) }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">Batas kirim OTP per window</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Window (menit)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={240}
                          value={settings.otp_send_window_minutes}
                          onChange={(e) =>
                            setSettings(prev => ({ ...prev, otp_send_window_minutes: Math.max(1, parseInt(e.target.value) || 60) }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">Periode hitung percobaan OTP</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Durasi Lock (menit)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={240}
                          value={settings.otp_send_lockout_minutes}
                          onChange={(e) =>
                            setSettings(prev => ({ ...prev, otp_send_lockout_minutes: Math.max(1, parseInt(e.target.value) || 60) }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">Lama akun terkunci saat limit tercapai</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                    <div>
                      <h4 className="font-medium text-warning">Rekomendasi Pengaturan</h4>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Aktifkan device binding untuk mencegah titip absen</li>
                        <li>Set maksimal reset 3x untuk menghindari penyalahgunaan</li>
                        <li>Wajibkan ganti password saat reset untuk verifikasi identitas</li>
                        <li>Kombinasikan dengan deteksi GPS untuk keamanan maksimal</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="apk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Kompatibilitas Aplikasi
                </CardTitle>
                <CardDescription>
                  Batas minimum versi Android agar fitur absensi tetap stabil
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Versi Android Minimum</Label>
                    <p className="text-sm text-muted-foreground">
                      Versi Android terendah yang diizinkan (Android 7 = Nougat)
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={5}
                    max={14}
                    value={settings.min_android_version}
                    onChange={(e) => setSettings(prev => ({ ...prev, min_android_version: parseInt(e.target.value) || 7 }))}
                    className="w-20"
                  />
                </div>

                <div className="p-4 bg-info/10 border border-info/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Settings className="h-5 w-5 text-info mt-0.5" />
                    <div>
                      <h4 className="font-medium text-info">Catatan Kompatibilitas</h4>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Perangkat di bawah versi minimum berisiko gagal akses GPS dan sinkronisasi</li>
                        <li>Gunakan baseline Android yang sama untuk menurunkan variasi bug perangkat</li>
                        <li>Android 7 (Nougat) masih jadi baseline minimum yang disarankan</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                    <div>
                      <h4 className="font-medium text-warning">Catatan Penting</h4>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Pastikan versi Android minimum sesuai populasi perangkat pegawai</li>
                        <li>Android 7 (Nougat) adalah minimum yang disarankan untuk fitur keamanan</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Eye className="h-5 w-5 text-success mt-0.5" />
                    <div>
                      <h4 className="font-medium text-success">Indikator Visual</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Pada halaman absensi, pegawai akan melihat indikator warna:
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-success" />
                          <span className="text-sm">Hijau: Bisa Absen</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-destructive" />
                          <span className="text-sm">Merah: Tidak Bisa Absen</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SuperAdminLayout>
  );
}
