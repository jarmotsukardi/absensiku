import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { Save, Loader2, Flame, Clock, AlertTriangle, RefreshCw, Play, ShieldCheck, ShieldAlert, ChevronsUpDown, Check } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { cn } from "@/lib/utils";

const getNumericSettingValue = (settingValue: Json, fallback: number) => {
  if (typeof settingValue === "object" && settingValue !== null && !Array.isArray(settingValue)) {
    const value = (settingValue as Record<string, unknown>).value;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const getBooleanSettingValue = (settingValue: Json, fallback: boolean) => {
  if (typeof settingValue === "boolean") return settingValue;
  if (typeof settingValue === "string") {
    const normalized = settingValue.toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof settingValue === "object" && settingValue !== null && !Array.isArray(settingValue)) {
    const value = (settingValue as Record<string, unknown>).value;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }
  return fallback;
};

const extractIntegerArray = (settingValue: Json, primaryKey: string): number[] => {
  const source =
    typeof settingValue === "object" && settingValue !== null && !Array.isArray(settingValue)
      ? (settingValue as Record<string, unknown>)[primaryKey] ??
        (settingValue as Record<string, unknown>).value ??
        settingValue
      : settingValue;

  if (!Array.isArray(source)) return [];

  const parsed = source
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(0, Math.floor(entry)));

  return Array.from(new Set(parsed)).sort((a, b) => b - a);
};

const extractStringArray = (settingValue: Json, primaryKey: string): string[] => {
  const source =
    typeof settingValue === "object" && settingValue !== null && !Array.isArray(settingValue)
      ? (settingValue as Record<string, unknown>)[primaryKey] ??
        (settingValue as Record<string, unknown>).value ??
        settingValue
      : settingValue;

  if (!Array.isArray(source)) return [];

  const parsed = source
    .map((entry) => String(entry).trim().toUpperCase())
    .filter(Boolean);

  return Array.from(new Set(parsed));
};

const parseReminderDaysInput = (raw: string): number[] => {
  return Array.from(
    new Set(
      raw
        .split(/[,\s;]+/)
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item))
        .map((item) => Math.max(0, Math.floor(item)))
    )
  ).sort((a, b) => b - a);
};

const MALUKU_TENGAH_CODE = "KAB2512015";
const PROTECTED_CODES_DEFAULT = [MALUKU_TENGAH_CODE];
const TRIAL_SETTINGS_OP_TIMEOUT_MS = 15000;
const TRIAL_SETTINGS_OP_RETRY_MAX = 1;

type TenantPickerOption = {
  id: string;
  code: string;
  name: string;
  is_active: boolean | null;
};

type LifecycleActionResult = {
  action: "sync" | "dry_run" | "run_now";
  at: string;
  payload: Json | null;
};

const GLOSSARY_ITEMS: Array<{ term: string; description: string }> = [
  {
    term: "Ambang Streak",
    description: "Batas minimal streak penggunaan pada hari kerja sebelum tenant masuk fase penagihan.",
  },
  {
    term: "Masa Tenggang",
    description: "Masa tenggang setelah tagihan diterbitkan. Selama fase ini tenant masih bisa melanjutkan pembayaran.",
  },
  {
    term: "Siklus Pembersihan Non-Bayar",
    description: "Mekanisme otomatis penjadwalan pengingat dan pembersihan untuk tenant yang tetap tidak membayar.",
  },
  {
    term: "Hari Retensi",
    description: "Jumlah hari dari status kedaluwarsa sampai tanggal hapus final dijalankan.",
  },
  {
    term: "Hari Pengingat",
    description: "Hari pengingat sebelum penghapusan (contoh: H-14, H-7, H-3, H-1) untuk admin organisasi dan super admin.",
  },
  {
    term: "Hapus Permanen Auth",
    description: "Jika aktif, akun autentikasi tenant ikut dihapus saat penghapusan final. Rekomendasi: tetap nonaktif untuk keamanan.",
  },
  {
    term: "Kode Tenant Terlindungi",
    description: "Daftar kode tenant yang dikecualikan dari pembersihan/penghapusan otomatis untuk kebutuhan uji coba.",
  },
  {
    term: "Sinkronkan Jadwal",
    description: "Menyelaraskan jadwal siklus dengan kondisi langganan + tagihan terbaru.",
  },
  {
    term: "Simulasi Uji",
    description: "Simulasi tanpa mengubah data untuk memvalidasi tenant mana yang akan diproses.",
  },
  {
    term: "Jalankan Sekarang",
    description: "Eksekusi siklus saat ini sesuai konfigurasi; gunakan hanya setelah validasi hasil simulasi uji.",
  },
];

const WORKFLOW_STEPS = [
  "Atur ambang streak + masa tenggang sesuai kebijakan tagihan instansi.",
  "Aktifkan siklus pembersihan non-bayar dan set hari retensi/hari pengingat.",
  "Pastikan kode tenant uji coba tetap masuk kode terlindungi (wajib: KAB2512015).",
  "Jalankan tombol Sinkron Jadwal untuk memperbarui antrian siklus.",
  "Jalankan Simulasi Uji dan tinjau hasil sebelum eksekusi nyata.",
  "Jika valid, jalankan Eksekusi Sekarang untuk menerapkan mekanisme.",
  "Pemantauan pengingat dan status tenant dilakukan dari `/admin/streak-monitoring`.",
];

export default function TrialSettings({ embedded = false }: { embedded?: boolean }) {
  const [streakThreshold, setStreakThreshold] = useState(30);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [cleanupRetentionDays, setCleanupRetentionDays] = useState(30);
  const [cleanupReminderDays, setCleanupReminderDays] = useState("14, 7, 3, 1");
  const [cleanupHardDeleteAuth, setCleanupHardDeleteAuth] = useState(false);
  const [protectedTenantCodes, setProtectedTenantCodes] = useState<string[]>(PROTECTED_CODES_DEFAULT);
  const [tenantOptions, setTenantOptions] = useState<TenantPickerOption[]>([]);
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [lastActionResult, setLastActionResult] = useState<LifecycleActionResult | null>(null);

  const protectedCodeSet = useMemo(() => new Set(protectedTenantCodes), [protectedTenantCodes]);
  const unknownProtectedCodes = useMemo(
    () =>
      protectedTenantCodes.filter(
        (code) => !tenantOptions.some((tenant) => tenant.code.toUpperCase() === code.toUpperCase())
      ),
    [protectedTenantCodes, tenantOptions]
  );
  const parsedReminderDays = useMemo(() => parseReminderDaysInput(cleanupReminderDays), [cleanupReminderDays]);

  useEffect(() => {
    void fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const [settingsRes, tenantsRes] = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              Promise.all([
                supabase
                  .from("system_settings")
                  .select("key, value")
                  .in("key", [
                    "streak_threshold",
                    "streak_grace_period_days",
                    "unpaid_cleanup_enabled",
                    "unpaid_cleanup_retention_days",
                    "unpaid_cleanup_reminder_days",
                    "unpaid_cleanup_hard_delete_auth",
                    "unpaid_cleanup_protected_tenant_codes",
                  ]),
                supabase
                  .from("tenants")
                  .select("id, code, name, is_active")
                  .order("name", { ascending: true }),
              ]),
            TRIAL_SETTINGS_OP_TIMEOUT_MS,
            "admin.trial_settings.fetch_settings.query timeout",
          ),
        {
          maxRetries: TRIAL_SETTINGS_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );

      if (settingsRes.error) throw settingsRes.error;
      if (tenantsRes.error) throw tenantsRes.error;

      const settingsRows = settingsRes.data;
      const tenantsRows = tenantsRes.data;

      if (tenantsRows) {
        setTenantOptions(
          tenantsRows.map((tenant) => ({
            id: tenant.id,
            code: String(tenant.code || "").toUpperCase(),
            name: tenant.name || "-",
            is_active: tenant.is_active,
          }))
        );
      }

      if (settingsRows) {
        const threshold = settingsRows.find((item) => item.key === "streak_threshold");
        const grace = settingsRows.find((item) => item.key === "streak_grace_period_days");
        const cleanupFlag = settingsRows.find((item) => item.key === "unpaid_cleanup_enabled");
        const retention = settingsRows.find((item) => item.key === "unpaid_cleanup_retention_days");
        const reminders = settingsRows.find((item) => item.key === "unpaid_cleanup_reminder_days");
        const hardDelete = settingsRows.find((item) => item.key === "unpaid_cleanup_hard_delete_auth");
        const protectedCodes = settingsRows.find((item) => item.key === "unpaid_cleanup_protected_tenant_codes");

        if (threshold) setStreakThreshold(getNumericSettingValue(threshold.value, 30));
        if (grace) setGracePeriodDays(getNumericSettingValue(grace.value, 7));
        if (cleanupFlag) setCleanupEnabled(getBooleanSettingValue(cleanupFlag.value, false));
        if (retention) setCleanupRetentionDays(getNumericSettingValue(retention.value, 30));
        if (hardDelete) setCleanupHardDeleteAuth(getBooleanSettingValue(hardDelete.value, false));
        if (reminders) {
          const days = extractIntegerArray(reminders.value, "days");
          if (days.length > 0) setCleanupReminderDays(days.join(", "));
        }
        if (protectedCodes) {
          const codes = extractStringArray(protectedCodes.value, "codes");
          if (codes.length > 0) {
            setProtectedTenantCodes(Array.from(new Set([...codes, MALUKU_TENGAH_CODE])));
          }
        }
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.trial_settings.fetch_settings");
      toast.error(appendErrorReference("Gagal memuat konfigurasi streak", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const upsertSetting = async (key: string, value: Json, description: string) => {
    const { data: existing, error: existingError } = await withExponentialBackoff(
      () =>
        withTimeout(
          () =>
            supabase
              .from("system_settings")
              .select("id")
              .eq("key", key)
              .maybeSingle(),
          TRIAL_SETTINGS_OP_TIMEOUT_MS,
          `Load setting ${key} timeout`,
        ),
      {
        maxRetries: TRIAL_SETTINGS_OP_RETRY_MAX,
        shouldRetry: isRetryableError,
      },
    );

    if (existingError) throw existingError;

    if (existing?.id) {
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              supabase
                .from("system_settings")
                .update({ value, updated_at: new Date().toISOString() })
                .eq("id", existing.id),
            TRIAL_SETTINGS_OP_TIMEOUT_MS,
            `Update setting ${key} timeout`,
          ),
        {
          maxRetries: TRIAL_SETTINGS_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );
      if (error) throw error;
      return;
    }

    const { error } = await withExponentialBackoff(
      () =>
        withTimeout(
          () => supabase.from("system_settings").insert({ key, value, description }),
          TRIAL_SETTINGS_OP_TIMEOUT_MS,
          `Insert setting ${key} timeout`,
        ),
      {
        maxRetries: TRIAL_SETTINGS_OP_RETRY_MAX,
        shouldRetry: isRetryableError,
      },
    );
    if (error) throw error;
  };

  const toggleProtectedTenant = (tenantCode: string) => {
    const normalizedCode = tenantCode.toUpperCase();
    setProtectedTenantCodes((prev) => {
      const exists = prev.includes(normalizedCode);
      if (exists) {
        if (normalizedCode === MALUKU_TENGAH_CODE) {
          toast.error(`Kode ${MALUKU_TENGAH_CODE} wajib terlindungi dan tidak bisa dihapus`);
          return prev;
        }
        return prev.filter((code) => code !== normalizedCode);
      }
      return [...prev, normalizedCode];
    });
  };

  const protectAllActiveTenants = () => {
    const activeCodes = tenantOptions
      .filter((tenant) => tenant.is_active !== false)
      .map((tenant) => tenant.code.toUpperCase())
      .filter(Boolean);
    setProtectedTenantCodes(Array.from(new Set([...activeCodes, MALUKU_TENGAH_CODE])));
  };

  const resetProtectedToDefault = () => {
    setProtectedTenantCodes([MALUKU_TENGAH_CODE]);
  };

  const handleSave = async () => {
    const reminderDaysArray = parseReminderDaysInput(cleanupReminderDays);
    const protectedCodesArray = Array.from(new Set([...protectedTenantCodes, MALUKU_TENGAH_CODE]));

    if (reminderDaysArray.length === 0) {
      toast.error("Reminder days wajib diisi minimal 1 angka. Contoh: 14,7,3,1");
      return;
    }
    if (!protectedCodesArray.includes(MALUKU_TENGAH_CODE)) {
      toast.error(`Kode ${MALUKU_TENGAH_CODE} wajib ada agar member Maluku Tengah tetap aman`);
      return;
    }

    setIsSaving(true);
    try {
      const settingsPayload: Array<{ key: string; value: Json; description: string }> = [
        { key: "streak_threshold", value: { value: streakThreshold }, description: "Jumlah hari streak untuk aktivasi" },
        { key: "streak_grace_period_days", value: { value: gracePeriodDays }, description: "Masa tenggang pembayaran (hari)" },
        { key: "unpaid_cleanup_enabled", value: { value: cleanupEnabled }, description: "Aktifkan lifecycle cleanup tenant tidak bayar" },
        { key: "unpaid_cleanup_retention_days", value: { value: cleanupRetentionDays }, description: "Durasi hari menuju purge setelah status expired" },
        { key: "unpaid_cleanup_reminder_days", value: { days: reminderDaysArray }, description: "Daftar hari reminder sebelum purge data" },
        { key: "unpaid_cleanup_hard_delete_auth", value: { value: cleanupHardDeleteAuth }, description: "Hapus auth.users saat purge (opsional, berisiko tinggi)" },
        {
          key: "unpaid_cleanup_protected_tenant_codes",
          value: { codes: protectedCodesArray },
          description: "Daftar kode tenant yang dilindungi dari mekanisme unpaid cleanup",
        },
      ];

      for (const item of settingsPayload) {
        await upsertSetting(item.key, item.value, item.description);
      }

      toast.success("Konfigurasi streak berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.trial_settings.save_settings", {
        streak_threshold: streakThreshold,
        grace_period_days: gracePeriodDays,
      });
      toast.error(appendErrorReference("Gagal menyimpan konfigurasi", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncLifecycle = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () => supabase.rpc("sync_unpaid_cleanup_schedules", { p_tenant_id: null }),
            TRIAL_SETTINGS_OP_TIMEOUT_MS,
            "Sync cleanup schedules timeout"
          ),
        {
          maxRetries: TRIAL_SETTINGS_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        }
      );
      if (error) throw error;

      setLastActionResult({
        action: "sync",
        at: new Date().toISOString(),
        payload: (data ?? null) as Json | null,
      });

      toast.success("Jadwal lifecycle cleanup berhasil disinkronkan");
    } catch (error) {
      const errorRef = reportError(error, "admin.trial_settings.sync_cleanup_schedules");
      toast.error(appendErrorReference("Gagal sinkron jadwal cleanup", errorRef));
    } finally {
      setIsSyncing(false);
    }
  };

  const executeLifecycleRun = async (dryRun: boolean) => {
    const protectedCodesArray = Array.from(new Set([...protectedTenantCodes, MALUKU_TENGAH_CODE]));
    if (!protectedCodesArray.includes(MALUKU_TENGAH_CODE)) {
      toast.error(`Eksekusi diblokir: kode ${MALUKU_TENGAH_CODE} wajib ada pada tenant terlindungi`);
      return;
    }

    if (dryRun) {
      setIsDryRunning(true);
    } else {
      setIsRunningNow(true);
    }

    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              supabase.rpc("run_unpaid_cleanup_lifecycle", {
                p_limit: 200,
                p_dry_run: dryRun,
                p_tenant_id: null,
              }),
            TRIAL_SETTINGS_OP_TIMEOUT_MS,
            dryRun ? "Dry-run lifecycle timeout" : "Run lifecycle timeout"
          ),
        {
          maxRetries: TRIAL_SETTINGS_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        }
      );
      if (error) throw error;

      setLastActionResult({
        action: dryRun ? "dry_run" : "run_now",
        at: new Date().toISOString(),
        payload: (data ?? null) as Json | null,
      });

      toast.success(dryRun ? "Dry-run lifecycle selesai" : "Lifecycle cleanup dijalankan");
    } catch (error) {
      const errorRef = reportError(error, dryRun ? "admin.trial_settings.lifecycle_dry_run" : "admin.trial_settings.lifecycle_run_now");
      toast.error(appendErrorReference(dryRun ? "Dry-run lifecycle gagal" : "Eksekusi lifecycle gagal", errorRef));
    } finally {
      if (dryRun) {
        setIsDryRunning(false);
      } else {
        setIsRunningNow(false);
      }
    }
  };

  if (isLoading) {
    const loadingContent = <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (embedded) return loadingContent;
    return (
      <SuperAdminLayout title="Konfigurasi Streak" subtitle="Atur parameter stabilitas penggunaan">
        {loadingContent}
      </SuperAdminLayout>
    );
  }

  const content = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            Konfigurasi Pemantauan Streak
          </h1>
          <p className="text-muted-foreground">Parameter ini menentukan kapan tenant dianggap aktif dan siap ditagih</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Simpan
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Ambang Streak
            </CardTitle>
            <CardDescription>Jumlah hari berturut-turut penggunaan absensi pada hari kerja</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Target Hari Streak</Label>
              <Input
                type="number"
                value={streakThreshold}
                onChange={(e) => setStreakThreshold(parseInt(e.target.value) || 30)}
                min={7}
                max={90}
              />
              <p className="text-xs text-muted-foreground">
                Setelah mencapai {streakThreshold} hari berturut-turut, status tenant berubah menjadi "Siap Ditagih"
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Masa Tenggang Pembayaran
            </CardTitle>
            <CardDescription>Waktu yang diberikan untuk menyelesaikan pembayaran</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Masa Tenggang (hari)</Label>
              <Input
                type="number"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(parseInt(e.target.value) || 7)}
                min={1}
                max={30}
              />
              <p className="text-xs text-muted-foreground">
                Jika pembayaran tidak diselesaikan dalam {gracePeriodDays} hari, akses fitur absensi akan dikunci
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Mekanisme Unpaid Cleanup Lifecycle
          </CardTitle>
          <CardDescription>
            Pengaturan reminder + cleanup tenant tidak bayar setelah grace period selesai
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Aktifkan lifecycle cleanup</Label>
                <Switch checked={cleanupEnabled} onCheckedChange={setCleanupEnabled} />
              </div>
              <p className="text-xs text-muted-foreground">
                Jika aktif, sistem menjadwalkan reminder dan cleanup untuk tenant yang tetap tidak melakukan pembayaran.
              </p>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Hard delete akun auth</Label>
                <Switch checked={cleanupHardDeleteAuth} onCheckedChange={setCleanupHardDeleteAuth} />
              </div>
              <p className="text-xs text-muted-foreground">
                Rekomendasi produksi: nonaktif. Aktifkan hanya jika SOP legal/compliance sudah siap.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Retention menuju purge (hari)</Label>
              <Input
                type="number"
                value={cleanupRetentionDays}
                onChange={(e) => setCleanupRetentionDays(Math.max(1, parseInt(e.target.value, 10) || 30))}
                min={1}
                max={365}
              />
              <p className="text-xs text-muted-foreground">
                Contoh: 30 berarti purge dijadwalkan 30 hari setelah status expired unpaid.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reminder days (format CSV)</Label>
              <Input
                value={cleanupReminderDays}
                onChange={(e) => setCleanupReminderDays(e.target.value)}
                placeholder="14, 7, 3, 1"
              />
              <p className="text-xs text-muted-foreground">
                Parsed: {parsedReminderDays.length > 0 ? parsedReminderDays.join(", ") : "-"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pilih tenant/member terlindungi</Label>
            <Popover open={tenantPickerOpen} onOpenChange={setTenantPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={tenantPickerOpen} className="w-full justify-between font-normal">
                  <span className="truncate">
                    {protectedTenantCodes.length > 0
                      ? `${protectedTenantCodes.length} tenant/member terlindungi`
                      : "Pilih tenant/member terdaftar"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cari nama atau kode tenant..." />
                  <CommandList>
                    <CommandEmpty>Tenant tidak ditemukan.</CommandEmpty>
                    <CommandGroup>
                      {tenantOptions.map((tenant) => {
                        const isSelected = protectedCodeSet.has(tenant.code);
                        return (
                          <CommandItem
                            key={tenant.id}
                            value={`${tenant.name} ${tenant.code}`}
                            onSelect={() => toggleProtectedTenant(tenant.code)}
                          >
                            <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span>{tenant.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {tenant.code} • {tenant.is_active === false ? "nonaktif" : "aktif"}
                              </span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
                <div className="border-t p-2 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={protectAllActiveTenants}>
                    Lindungi semua tenant aktif
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={resetProtectedToDefault}>
                    Reset ke bawaan
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex flex-wrap gap-2">
              {protectedTenantCodes.map((code) => {
                const matchedTenant = tenantOptions.find((tenant) => tenant.code === code);
                return (
                <Badge key={code} variant={code === MALUKU_TENGAH_CODE ? "default" : "secondary"}>
                  {matchedTenant ? `${matchedTenant.name} (${code})` : code}
                </Badge>
                );
              })}
            </div>
            {unknownProtectedCodes.length > 0 && (
              <p className="text-xs text-amber-600">
                Ada kode lama yang tidak ditemukan di daftar tenant saat ini: {unknownProtectedCodes.join(", ")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Pilih dari tenant/member terdaftar. Kode {MALUKU_TENGAH_CODE} wajib ada agar member Maluku Tengah tidak ikut terhapus saat lifecycle berjalan.
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-amber-900 text-sm">
            <p className="font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Proteksi Database Uji Coba Aktif
            </p>
            <p className="text-xs mt-1">
              Mekanisme ini disiapkan agar tenant uji coba Maluku Tengah tetap aman. Gunakan <strong>simulasi</strong> sebelum eksekusi nyata.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tombol Mekanisme Lifecycle</CardTitle>
          <CardDescription>
            Jalankan sinkronisasi, simulasi, atau eksekusi langsung dari panel admin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleSyncLifecycle} disabled={isSyncing || isDryRunning || isRunningNow}>
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sinkron Jadwal
            </Button>
            <Button variant="secondary" onClick={() => void executeLifecycleRun(true)} disabled={isSyncing || isDryRunning || isRunningNow}>
              {isDryRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Simulasi Uji
            </Button>
            <Button onClick={() => void executeLifecycleRun(false)} disabled={isSyncing || isDryRunning || isRunningNow || !cleanupEnabled}>
              {isRunningNow ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Jalankan Sekarang
            </Button>
          </div>

          {!cleanupEnabled && (
            <p className="text-xs text-amber-600">
              Catatan: tombol "Jalankan Sekarang" aktif setelah lifecycle di-enable dan disimpan.
            </p>
          )}

          {lastActionResult && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">
                Hasil aksi terakhir: {lastActionResult.action} ({new Date(lastActionResult.at).toLocaleString("id-ID")})
              </p>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(lastActionResult.payload, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-300">Algoritma Streak</p>
              <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
                <li>Streak bertambah setiap hari kerja jika ada aktivitas absensi</li>
                <li>Hari Sabtu, Minggu, dan libur nasional dikecualikan</li>
                <li>Hari libur khusus yang ditetapkan admin organisasi juga dikecualikan</li>
                <li>Streak di-reset ke 1 jika terputus pada hari kerja aktif</li>
                <li>Setelah target tercapai -&gt; status "Siap Ditagihkan" + masa tenggang dimulai</li>
                <li>Jika pembayaran tidak dilakukan -&gt; status "Ditangguhkan" (fitur dikunci, data tetap aman)</li>
                <li>Setelah masa tenggang berakhir -&gt; pengingat siklus berjalan sesuai hari pengingat</li>
                <li>Saat melewati retensi -&gt; pembersihan dijalankan sesuai pengaturan siklus</li>
                <li>Tenant berkode {MALUKU_TENGAH_CODE} dilindungi agar tidak ikut terhapus</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Glosarium & Penjelasan Lengkap</CardTitle>
          <CardDescription>
            Referensi istilah dan alur mekanisme streak sampai siklus pembersihan non-bayar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {GLOSSARY_ITEMS.map((item) => (
              <div key={item.term} className="rounded-md border p-3">
                <p className="text-sm font-semibold">{item.term}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-semibold">Alur Mekanisme</p>
            <ol className="mt-2 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
              {WORKFLOW_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (embedded) return content;

  return (
    <SuperAdminLayout title="Konfigurasi Streak" subtitle="Atur parameter stabilitas penggunaan tenant">
      {content}
    </SuperAdminLayout>
  );
}
