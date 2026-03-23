import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Building2, 
  School, 
  Landmark, 
  Building, 
  Save, 
  Loader2,
  Clock,
  Users,
  Calendar,
  MapPin,
  CircleHelp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

interface OrgTypeSettings {
  employee_fields: { required: string[]; optional: string[] };
  attendance_rules: { tolerance_minutes: number; require_photo: boolean; require_location: boolean };
  leave_types: { enabled: string[] };
  work_schedule: { default_start: string; default_end: string; work_days: number[] };
}
type OrganizationTypeSettingRow = Tables<"organization_type_settings">;

const ORG_TYPES = [
  { value: "pemerintah_daerah", label: "Pemerintah Daerah", icon: Landmark, color: "text-blue-500" },
  { value: "instansi_pemerintah", label: "Instansi Pemerintah", icon: Building2, color: "text-green-500" },
  { value: "perusahaan", label: "Perusahaan", icon: Building, color: "text-purple-500" },
  { value: "sekolah", label: "Sekolah", icon: School, color: "text-orange-500" },
];

const LEAVE_TYPES = [
  { value: "cuti_tahunan", label: "Cuti Tahunan" },
  { value: "cuti_penting", label: "Cuti Penting" },
  { value: "sakit", label: "Sakit" },
  { value: "izin", label: "Izin" },
  { value: "tugas_luar", label: "Tugas Luar" },
];

const EMPLOYEE_FIELDS = [
  { value: "nip", label: "NIP" },
  { value: "golongan", label: "Golongan" },
  { value: "opd_id", label: "OPD" },
  { value: "position", label: "Jabatan" },
  { value: "work_unit_id", label: "Unit Kerja" },
  { value: "employee_category", label: "Kategori Pegawai" },
  { value: "gelar_depan", label: "Gelar Depan" },
  { value: "gelar_belakang", label: "Gelar Belakang" },
];

const DAYS = [
  { value: 1, label: "Sen" },
  { value: 2, label: "Sel" },
  { value: 3, label: "Rab" },
  { value: 4, label: "Kam" },
  { value: 5, label: "Jum" },
  { value: 6, label: "Sab" },
  { value: 7, label: "Min" },
];

const defaultSettings: OrgTypeSettings = {
  employee_fields: { required: [], optional: [] },
  attendance_rules: { tolerance_minutes: 0, require_photo: false, require_location: true },
  leave_types: { enabled: ["cuti_tahunan", "sakit", "izin"] },
  work_schedule: { default_start: "08:00", default_end: "17:00", work_days: [1, 2, 3, 4, 5] },
};
const ORG_TYPE_SETTINGS_QUERY_TIMEOUT_MS = 12000;
const ORG_TYPE_SETTINGS_QUERY_RETRY_MAX = 2;

export default function OrganizationTypeSettings() {
  const [activeTab, setActiveTab] = useState("pemerintah_daerah");
  const [settings, setSettings] = useState<Record<string, OrgTypeSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("organization_type_settings")
              .select("*"),
            ORG_TYPE_SETTINGS_QUERY_TIMEOUT_MS,
            "admin.organization_type_settings.fetch timeout"
          ),
        {
          maxRetries: ORG_TYPE_SETTINGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;

      // Group by organization type
      const grouped: Record<string, OrgTypeSettings> = {};
      
      for (const orgType of ORG_TYPES) {
        grouped[orgType.value] = { ...defaultSettings };
      }

      (data as OrganizationTypeSettingRow[] | null)?.forEach((row) => {
        if (!grouped[row.organization_type]) {
          grouped[row.organization_type] = { ...defaultSettings };
        }
        const settingKey = row.setting_key as keyof OrgTypeSettings;
        if (settingKey === "work_schedule") {
          const schedule = row.setting_value as OrgTypeSettings["work_schedule"];
          grouped[row.organization_type][settingKey] = {
            ...schedule,
            work_days: (schedule?.work_days || []).map((day) => (day === 0 ? 7 : day)),
          } as OrgTypeSettings[typeof settingKey];
          return;
        }
        grouped[row.organization_type][settingKey] = row.setting_value as OrgTypeSettings[typeof settingKey];
      });

      setSettings(grouped);
    } catch (error) {
      const errorRef = reportError(error, "admin.organization_type_settings.fetch");
      const message = appendErrorReference("Gagal memuat pengaturan jenis organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const updateSetting = <K extends keyof OrgTypeSettings>(
    orgType: string,
    key: K,
    value: OrgTypeSettings[K]
  ) => {
    setSettings(prev => ({
      ...prev,
      [orgType]: {
        ...prev[orgType],
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const currentSettings = settings[activeTab];
      if (!currentSettings) return;

      for (const [key, value] of Object.entries(currentSettings)) {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("organization_type_settings")
                .upsert({
                  organization_type: activeTab,
                  setting_key: key,
                  setting_value: value,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: "organization_type,setting_key",
                }),
              ORG_TYPE_SETTINGS_QUERY_TIMEOUT_MS,
              "admin.organization_type_settings.save timeout"
            ),
          {
            maxRetries: ORG_TYPE_SETTINGS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );

        if (error) throw error;
      }

      toast.success("Pengaturan berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.organization_type_settings.save", {
        organization_type: activeTab,
      });
      const message = appendErrorReference("Gagal menyimpan pengaturan jenis organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRequiredField = (field: string) => {
    const current = settings[activeTab]?.employee_fields || defaultSettings.employee_fields;
    const isRequired = current.required.includes(field);
    const isOptional = current.optional.includes(field);

    let newRequired = [...current.required];
    let newOptional = [...current.optional];

    if (isRequired) {
      newRequired = newRequired.filter(f => f !== field);
      newOptional.push(field);
    } else if (isOptional) {
      newOptional = newOptional.filter(f => f !== field);
    } else {
      newRequired.push(field);
    }

    updateSetting(activeTab, "employee_fields", { required: newRequired, optional: newOptional });
  };

  const toggleLeaveType = (type: string) => {
    const current = settings[activeTab]?.leave_types?.enabled || [];
    const newEnabled = current.includes(type)
      ? current.filter((t: string) => t !== type)
      : [...current, type];
    updateSetting(activeTab, "leave_types", { enabled: newEnabled });
  };

  const toggleWorkDay = (day: number) => {
    const current = settings[activeTab]?.work_schedule?.work_days || [];
    const newDays = current.includes(day)
      ? current.filter((d: number) => d !== day)
      : [...current, day].sort();
    updateSetting(activeTab, "work_schedule", {
      ...settings[activeTab]?.work_schedule,
      work_days: newDays,
    });
  };

  if (isLoading) {
    return (
      <SuperAdminLayout title="Pengaturan Jenis Organisasi" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SuperAdminLayout>
    );
  }

  const currentSettings = settings[activeTab] || defaultSettings;
  const ActiveIcon = ORG_TYPES.find(o => o.value === activeTab)?.icon || Building2;

  return (
    <SuperAdminLayout 
      title="Pengaturan Jenis Organisasi" 
      subtitle="Konfigurasi default untuk setiap jenis organisasi"
    >
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang memuat pengaturan jenis organisasi...
          </div>
        )}
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void fetchSettings()}>
              Coba Lagi
            </Button>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
            {ORG_TYPES.map((org) => {
              const Icon = org.icon;
              return (
                <TabsTrigger key={org.value} value={org.value} className="flex items-center gap-2 whitespace-nowrap">
                  <Icon className={`h-4 w-4 ${org.color}`} />
                  <span className="hidden sm:inline">{org.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {ORG_TYPES.map((org) => (
            <TabsContent key={org.value} value={org.value} className="space-y-6 mt-6">
              {/* Employee Fields */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Field Data Pegawai
                  </CardTitle>
                  <CardDescription>
                    Tentukan field yang wajib dan opsional untuk pegawai
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {EMPLOYEE_FIELDS.map((field) => {
                      const isRequired = currentSettings.employee_fields?.required?.includes(field.value);
                      const isOptional = currentSettings.employee_fields?.optional?.includes(field.value);
                      return (
                        <div 
                          key={field.value}
                          className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent/50"
                          onClick={() => toggleRequiredField(field.value)}
                        >
                          <span className="font-medium">{field.label}</span>
                          <Badge 
                            variant={isRequired ? "default" : isOptional ? "secondary" : "outline"}
                            className={isRequired ? "bg-green-500" : isOptional ? "bg-blue-500" : ""}
                          >
                            {isRequired ? "Wajib" : isOptional ? "Opsional" : "Tidak Aktif"}
                          </Badge>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground mt-2">
                      Klik untuk mengubah status: Wajib → Opsional → Tidak Aktif → Wajib
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Attendance Rules */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Aturan Absensi
                  </CardTitle>
                  <CardDescription>
                    Konfigurasi aturan absensi default
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label>Toleransi Keterlambatan (menit)</Label>
                        <TooltipProvider delayDuration={120}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex text-muted-foreground hover:text-foreground">
                                <CircleHelp className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              Batas menit toleransi setelah jam masuk sebelum pegawai dinilai terlambat.
                              Nilai default 0 berarti tanpa toleransi tambahan.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        type="number"
                        value={currentSettings.attendance_rules?.tolerance_minutes ?? 0}
                        onChange={(e) => updateSetting(activeTab, "attendance_rules", {
                          ...currentSettings.attendance_rules,
                          tolerance_minutes: parseInt(e.target.value) || 0,
                        })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <Label>Wajib Foto</Label>
                      <Switch
                        checked={currentSettings.attendance_rules?.require_photo || false}
                        onCheckedChange={(checked) => updateSetting(activeTab, "attendance_rules", {
                          ...currentSettings.attendance_rules,
                          require_photo: checked,
                        })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <Label>Wajib Lokasi GPS</Label>
                      <Switch
                        checked={currentSettings.attendance_rules?.require_location ?? true}
                        onCheckedChange={(checked) => updateSetting(activeTab, "attendance_rules", {
                          ...currentSettings.attendance_rules,
                          require_location: checked,
                        })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Leave Types */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Jenis Cuti/Izin
                  </CardTitle>
                  <CardDescription>
                    Pilih jenis cuti/izin yang tersedia
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {LEAVE_TYPES.map((type) => {
                      const isEnabled = currentSettings.leave_types?.enabled?.includes(type.value);
                      return (
                        <Badge
                          key={type.value}
                          variant={isEnabled ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleLeaveType(type.value)}
                        >
                          {type.label}
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Work Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Jadwal Kerja Default
                  </CardTitle>
                  <CardDescription>
                    Jam kerja dan hari kerja default
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Jam Masuk</Label>
                      <Input
                        type="time"
                        value={currentSettings.work_schedule?.default_start || "08:00"}
                        onChange={(e) => updateSetting(activeTab, "work_schedule", {
                          ...currentSettings.work_schedule,
                          default_start: e.target.value,
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Jam Pulang</Label>
                      <Input
                        type="time"
                        value={currentSettings.work_schedule?.default_end || "17:00"}
                        onChange={(e) => updateSetting(activeTab, "work_schedule", {
                          ...currentSettings.work_schedule,
                          default_end: e.target.value,
                        })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Hari Kerja</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((day) => {
                        const isActive = currentSettings.work_schedule?.work_days?.includes(day.value);
                        return (
                          <Badge
                            key={day.value}
                            variant={isActive ? "default" : "outline"}
                            className="cursor-pointer px-4 py-2"
                            onClick={() => toggleWorkDay(day.value)}
                          >
                            {day.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

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
    </SuperAdminLayout>
  );
}
