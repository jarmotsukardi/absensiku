import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Save, Clock, MapPin, Bell, Shield, Home } from "lucide-react";
import { toast } from "sonner";
import { useWfhSettings } from "@/hooks/useWfhSettings";

interface OrganizationSettingsProps {
  tenantId: string;
}

export function OrganizationSettings({ tenantId }: OrganizationSettingsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { settings: wfhSettings, updateSetting: updateWfhSetting, isLoading: wfhLoading } = useWfhSettings(tenantId);
  
  const [settings, setSettings] = useState({
    // Jam Kerja
    defaultWorkStart: "08:00",
    defaultWorkEnd: "17:00",
    lateToleranceMinutes: 15,
    earlyLeaveToleranceMinutes: 15,
    
    // Hari Kerja
    workDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    
    // GPS
    defaultRadiusMeters: 100,
    requireGpsForCheckout: true,
    allowMockLocation: false,
    
    // Notifikasi
    enableWhatsAppNotification: false,
    enableEmailNotification: true,
    sendDailyReminder: true,
    reminderTime: "07:00",
    
    // Persetujuan
    requireApprovalForLeave: true,
    requireApprovalForCorrection: true,
    autoApproveAfterDays: 0,
    
    // Keamanan
    maxLoginAttempts: 5,
    sessionTimeoutMinutes: 60,
    requireStrongPassword: true,
  });

  const handleChange = (field: string, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Pengaturan organisasi berhasil disimpan");
  };

  return (
    <div className="space-y-6">
      {/* Jam Kerja */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Pengaturan Jam Kerja
          </CardTitle>
          <CardDescription>Konfigurasi jam kerja default untuk organisasi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Jam Masuk Default</Label>
              <Input
                type="time"
                value={settings.defaultWorkStart}
                onChange={(e) => handleChange("defaultWorkStart", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Jam Pulang Default</Label>
              <Input
                type="time"
                value={settings.defaultWorkEnd}
                onChange={(e) => handleChange("defaultWorkEnd", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Toleransi Terlambat (menit)</Label>
              <Input
                type="number"
                value={settings.lateToleranceMinutes}
                onChange={(e) => handleChange("lateToleranceMinutes", parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Toleransi Pulang Cepat (menit)</Label>
              <Input
                type="number"
                value={settings.earlyLeaveToleranceMinutes}
                onChange={(e) => handleChange("earlyLeaveToleranceMinutes", parseInt(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work From Home Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Pengaturan Work From Home (WFH)
          </CardTitle>
          <CardDescription>Konfigurasi absensi dari rumah atau lokasi lain</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Izinkan Work From Home</Label>
              <p className="text-sm text-muted-foreground">
                Pegawai dapat absen dari mana saja tanpa validasi lokasi kantor
              </p>
            </div>
            <Switch
              checked={wfhSettings.allow_wfh}
              onCheckedChange={async (checked) => {
                const success = await updateWfhSetting("allow_wfh", checked);
                if (success) {
                  toast.success(checked ? "WFH diaktifkan" : "WFH dinonaktifkan");
                }
              }}
              disabled={wfhLoading}
            />
          </div>
          {wfhSettings.allow_wfh && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">WFH Memerlukan Persetujuan</Label>
                <p className="text-sm text-muted-foreground">
                  Pegawai harus mengajukan WFH terlebih dahulu ke atasan
                </p>
              </div>
              <Switch
                checked={wfhSettings.wfh_requires_approval}
                onCheckedChange={async (checked) => {
                  const success = await updateWfhSetting("wfh_requires_approval", checked);
                  if (success) {
                    toast.success("Pengaturan persetujuan WFH disimpan");
                  }
                }}
                disabled={wfhLoading}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* GPS Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Pengaturan GPS
          </CardTitle>
          <CardDescription>Konfigurasi validasi lokasi absensi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Radius Default (meter)</Label>
            <Input
              type="number"
              value={settings.defaultRadiusMeters}
              onChange={(e) => handleChange("defaultRadiusMeters", parseInt(e.target.value))}
              className="max-w-xs"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Wajib GPS saat Checkout</Label>
              <p className="text-sm text-muted-foreground">
                Pegawai harus dalam radius kantor saat pulang
              </p>
            </div>
            <Switch
              checked={settings.requireGpsForCheckout}
              onCheckedChange={(checked) => handleChange("requireGpsForCheckout", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Izinkan Mock Location</Label>
              <p className="text-sm text-muted-foreground">
                Izinkan penggunaan lokasi palsu (tidak disarankan)
              </p>
            </div>
            <Switch
              checked={settings.allowMockLocation}
              onCheckedChange={(checked) => handleChange("allowMockLocation", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Pengaturan Notifikasi
          </CardTitle>
          <CardDescription>Konfigurasi pengiriman notifikasi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Notifikasi WhatsApp</Label>
              <p className="text-sm text-muted-foreground">Kirim notifikasi via WhatsApp</p>
            </div>
            <Switch
              checked={settings.enableWhatsAppNotification}
              onCheckedChange={(checked) => handleChange("enableWhatsAppNotification", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Notifikasi Email</Label>
              <p className="text-sm text-muted-foreground">Kirim notifikasi via Email</p>
            </div>
            <Switch
              checked={settings.enableEmailNotification}
              onCheckedChange={(checked) => handleChange("enableEmailNotification", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Pengingat Harian</Label>
              <p className="text-sm text-muted-foreground">Kirim pengingat absensi setiap pagi</p>
            </div>
            <Switch
              checked={settings.sendDailyReminder}
              onCheckedChange={(checked) => handleChange("sendDailyReminder", checked)}
            />
          </div>
          {settings.sendDailyReminder && (
            <div className="space-y-2 max-w-xs">
              <Label>Waktu Pengingat</Label>
              <Input
                type="time"
                value={settings.reminderTime}
                onChange={(e) => handleChange("reminderTime", e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Pengaturan Persetujuan
          </CardTitle>
          <CardDescription>Konfigurasi alur persetujuan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Perlu Persetujuan untuk Cuti/Izin</Label>
              <p className="text-sm text-muted-foreground">
                Pengajuan harus disetujui atasan terlebih dahulu
              </p>
            </div>
            <Switch
              checked={settings.requireApprovalForLeave}
              onCheckedChange={(checked) => handleChange("requireApprovalForLeave", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Perlu Persetujuan untuk Koreksi</Label>
              <p className="text-sm text-muted-foreground">
                Koreksi absensi harus disetujui admin
              </p>
            </div>
            <Switch
              checked={settings.requireApprovalForCorrection}
              onCheckedChange={(checked) => handleChange("requireApprovalForCorrection", checked)}
            />
          </div>
          <div className="space-y-2 max-w-xs">
            <Label>Auto-Approve Setelah (hari)</Label>
            <Select
              value={settings.autoApproveAfterDays.toString()}
              onValueChange={(value) => handleChange("autoApproveAfterDays", parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Tidak ada (manual)</SelectItem>
                <SelectItem value="1">1 hari</SelectItem>
                <SelectItem value="3">3 hari</SelectItem>
                <SelectItem value="7">7 hari</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
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
