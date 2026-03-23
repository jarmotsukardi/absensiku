import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type PayrollGlobalSettings = {
  enforce_trace_id: boolean;
  lock_after_approval: boolean;
  auto_alert_critical: boolean;
  default_retention_days: number;
  non_critical_archive_days: number;
  anomaly_threshold_per_hour: number;
};

const SYSTEM_SETTINGS_KEY = "payroll_superadmin_settings_v1";

const DEFAULT_SETTINGS: PayrollGlobalSettings = {
  enforce_trace_id: true,
  lock_after_approval: true,
  auto_alert_critical: true,
  default_retention_days: 365,
  non_critical_archive_days: 30,
  anomaly_threshold_per_hour: 25,
};

const toPositiveInteger = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normalizeSettings = (value: unknown): PayrollGlobalSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_SETTINGS;
  const raw = value as Record<string, unknown>;
  return {
    enforce_trace_id: raw.enforce_trace_id !== false,
    lock_after_approval: raw.lock_after_approval !== false,
    auto_alert_critical: raw.auto_alert_critical !== false,
    default_retention_days:
      typeof raw.default_retention_days === "number" && Number.isFinite(raw.default_retention_days)
        ? Math.max(1, raw.default_retention_days)
        : DEFAULT_SETTINGS.default_retention_days,
    non_critical_archive_days:
      typeof raw.non_critical_archive_days === "number" && Number.isFinite(raw.non_critical_archive_days)
        ? Math.max(1, raw.non_critical_archive_days)
        : DEFAULT_SETTINGS.non_critical_archive_days,
    anomaly_threshold_per_hour:
      typeof raw.anomaly_threshold_per_hour === "number" && Number.isFinite(raw.anomaly_threshold_per_hour)
        ? Math.max(1, raw.anomaly_threshold_per_hour)
        : DEFAULT_SETTINGS.anomaly_threshold_per_hour,
  };
};

export default function AdminPayrollSettings() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<PayrollGlobalSettings>(DEFAULT_SETTINGS);

  const summary = useMemo(
    () => [
      `Retensi audit: ${settings.default_retention_days} hari`,
      `Arsip non-kritis: ${settings.non_critical_archive_days} hari`,
      `Ambang anomali: ${settings.anomaly_threshold_per_hour}/jam`,
    ],
    [settings.default_retention_days, settings.non_critical_archive_days, settings.anomaly_threshold_per_hour]
  );

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("value, updated_at")
          .eq("key", SYSTEM_SETTINGS_KEY)
          .maybeSingle();
        if (error) throw error;
        if (!data) return;
        setSettings(normalizeSettings(data.value));
        setUpdatedAt(data.updated_at);
      } catch (error) {
        const errorRef = reportError(error, "admin.payroll.settings.fetch");
        toast.error(appendErrorReference("Gagal memuat pengaturan payroll global", errorRef));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollGlobalSettings = {
        enforce_trace_id: settings.enforce_trace_id,
        lock_after_approval: settings.lock_after_approval,
        auto_alert_critical: settings.auto_alert_critical,
        default_retention_days: Math.max(1, settings.default_retention_days),
        non_critical_archive_days: Math.max(1, settings.non_critical_archive_days),
        anomaly_threshold_per_hour: Math.max(1, settings.anomaly_threshold_per_hour),
      };

      const { error } = await supabase.from("system_settings").upsert(
        {
          key: SYSTEM_SETTINGS_KEY,
          value: payload,
          updated_by: user?.id ?? null,
          description: "Konfigurasi global payroll untuk superadmin",
        },
        { onConflict: "key" }
      );
      if (error) throw error;
      setUpdatedAt(new Date().toISOString());
      toast.success("Pengaturan payroll global berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.payroll.settings.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan payroll global", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SuperAdminLayout
      title="Pengaturan Payroll"
      subtitle="Kebijakan global payroll tingkat platform"
      workspaceMode="payroll"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Superadmin Payroll</Badge>
              {updatedAt ? (
                <Badge variant="secondary">
                  Update terakhir {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(updatedAt))}
                </Badge>
              ) : null}
            </div>
            <CardTitle>Kebijakan Global Payroll</CardTitle>
            <CardDescription>
              Pengaturan ini berlaku lintas tenant payroll untuk audit, retensi, dan mekanisme deteksi anomali.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {summary.map((item) => (
                <div key={item} className="rounded-lg border bg-muted/30 p-3 text-sm font-medium">
                  {item}
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Wajibkan trace_id pada event kritikal</p>
                    <p className="text-xs text-muted-foreground">Menjaga keterlacakan audit end-to-end.</p>
                  </div>
                  <Switch
                    checked={settings.enforce_trace_id}
                    onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, enforce_trace_id: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Kunci data setelah approval final</p>
                    <p className="text-xs text-muted-foreground">Perubahan pasca-approval harus lewat mekanisme koreksi resmi.</p>
                  </div>
                  <Switch
                    checked={settings.lock_after_approval}
                    onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, lock_after_approval: checked }))}
                  />
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Alert realtime error kritis</p>
                    <p className="text-xs text-muted-foreground">Aktifkan notifikasi otomatis ke endpoint alert tenant.</p>
                  </div>
                  <Switch
                    checked={settings.auto_alert_critical}
                    onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, auto_alert_critical: checked }))}
                  />
                </div>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Kebijakan alert global tetap menghormati konfigurasi webhook tiap tenant.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="default-retention-days">Retensi Audit (hari)</Label>
                <Input
                  id="default-retention-days"
                  type="number"
                  min={1}
                  value={settings.default_retention_days}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      default_retention_days: toPositiveInteger(event.target.value, prev.default_retention_days),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="non-critical-archive-days">Arsip Non Kritis (hari)</Label>
                <Input
                  id="non-critical-archive-days"
                  type="number"
                  min={1}
                  value={settings.non_critical_archive_days}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      non_critical_archive_days: toPositiveInteger(event.target.value, prev.non_critical_archive_days),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="anomaly-threshold">Ambang Anomali (/jam)</Label>
                <Input
                  id="anomaly-threshold"
                  type="number"
                  min={1}
                  value={settings.anomaly_threshold_per_hour}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      anomaly_threshold_per_hour: toPositiveInteger(event.target.value, prev.anomaly_threshold_per_hour),
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={isSaving || isLoading}>
                <Save className="mr-2 h-4 w-4" />
                Simpan Pengaturan
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/payroll/audit")}>
                Audit Payroll
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/payroll/error-logs")}>
                Log Error Payroll
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
