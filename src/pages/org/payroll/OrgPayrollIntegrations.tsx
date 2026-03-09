import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  DEFAULT_PAYROLL_INTEGRATION_SETTINGS,
  fetchTenantPayrollIntegrations,
  saveTenantPayrollIntegrations,
  type PayrollIntegrationSettings,
} from "@/lib/payrollIntegrationSettings";
import {
  buildPayrollWebhookTestPayload,
  generatePayrollWebhookTraceId,
  sendPayrollWebhookTest,
} from "@/lib/payrollWebhook";

type IntegrationHealth = {
  employeeCount: number;
  employeeWithUserCount: number;
  payrollPeriodCount: number;
  attendanceRecords30d: number;
  attendanceRecordsPartitioned30d: number | null;
  sharedAttendanceStatus: "match" | "mismatch" | "unknown";
  sampleEmployeeCount: number;
  checkedAt: string;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

export default function OrgPayrollIntegrations() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [settings, setSettings] = useState<PayrollIntegrationSettings>(DEFAULT_PAYROLL_INTEGRATION_SETTINGS);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastWebhookTraceId, setLastWebhookTraceId] = useState<string | null>(null);
  const [lastWebhookLogId, setLastWebhookLogId] = useState<string | null>(null);
  const [lastWebhookRelayTraceId, setLastWebhookRelayTraceId] = useState<string | null>(null);
  const [lastWebhookSuccess, setLastWebhookSuccess] = useState<boolean | null>(null);
  const [lastWebhookError, setLastWebhookError] = useState<string | null>(null);
  const [lastWebhookResult, setLastWebhookResult] = useState<{ status: number; responseText: string } | null>(null);

  const runHealthCheck = useCallback(async (resolvedTenantId: string) => {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const employeeRes = await supabase
      .from("employees")
      .select("id, user_id", { count: "exact" })
      .eq("tenant_id", resolvedTenantId)
      .eq("is_active", true)
      .limit(200);
    if (employeeRes.error) throw employeeRes.error;

    const sampleEmployeeIds = (employeeRes.data || []).map((item) => item.id);

    const [periodRes, attendanceRes, attendancePartitionedRes] = await Promise.all([
      supabase
        .from("payroll_periods")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", resolvedTenantId),
      sampleEmployeeIds.length > 0
        ? supabase
            .from("attendance_records")
            .select("id", { count: "exact", head: true })
            .in("employee_id", sampleEmployeeIds)
            .gte("date", since.toISOString().slice(0, 10))
        : Promise.resolve({ count: 0, error: null }),
      sampleEmployeeIds.length > 0
        ? supabase
            .from("attendance_records_partitioned")
            .select("id", { count: "exact", head: true })
            .in("employee_id", sampleEmployeeIds)
            .gte("date", since.toISOString().slice(0, 10))
        : Promise.resolve({ count: 0, error: null }),
    ]);

    if (periodRes.error) throw periodRes.error;
    if (attendanceRes.error) throw attendanceRes.error;
    const attendancePartitionedCount = attendancePartitionedRes.error
      ? null
      : attendancePartitionedRes.count || 0;
    const attendanceSharedStatus =
      attendancePartitionedCount === null
        ? "unknown"
        : attendancePartitionedCount === (attendanceRes.count || 0)
          ? "match"
          : "mismatch";

    const employeeWithUserCount = (employeeRes.data || []).filter((item) => Boolean(item.user_id)).length;

    setHealth({
      employeeCount: employeeRes.count || 0,
      employeeWithUserCount,
      payrollPeriodCount: periodRes.count || 0,
      attendanceRecords30d: attendanceRes.count || 0,
      attendanceRecordsPartitioned30d: attendancePartitionedCount,
      sharedAttendanceStatus: attendanceSharedStatus,
      sampleEmployeeCount: sampleEmployeeIds.length,
      checkedAt: new Date().toISOString(),
    });
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [integrationRes] = await Promise.all([
        fetchTenantPayrollIntegrations(resolvedTenantId),
        runHealthCheck(resolvedTenantId),
      ]);

      setSettings(integrationRes.settings);
    } catch (error) {
      const ref = reportError(error, "org.payroll.integrations.fetch");
      const message = appendErrorReference("Gagal memuat konfigurasi integrasi payroll", ref);
      setLoadError(message);
      toast.error(message);
      setSettings(DEFAULT_PAYROLL_INTEGRATION_SETTINGS);
      setHealth(null);
    } finally {
      setIsLoading(false);
    }
  }, [runHealthCheck, tenantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const integrationSummary = useMemo(() => {
    const activeFlags = [
      settings.attendance.enabled,
      settings.accounting.enabled,
      settings.payout.enabled,
      settings.webhook.enabled,
    ];
    return activeFlags.filter(Boolean).length;
  }, [settings]);

  const updateSettings = <T extends keyof PayrollIntegrationSettings>(
    key: T,
    value: PayrollIntegrationSettings[T],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      if (settings.webhook.enabled && settings.webhook.endpointUrl.trim().length > 0) {
        if (!settings.webhook.endpointUrl.startsWith("http://") && !settings.webhook.endpointUrl.startsWith("https://")) {
          toast.error("Webhook URL harus dimulai http:// atau https://");
          return;
        }
      }

      const saved = await saveTenantPayrollIntegrations(resolvedTenantId, settings);
      setSettings(saved);
      toast.success("Konfigurasi integrasi payroll tersimpan");
    } catch (error) {
      const ref = reportError(error, "org.payroll.integrations.save");
      toast.error(appendErrorReference("Gagal menyimpan konfigurasi integrasi payroll", ref));
    } finally {
      setIsSaving(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      setIsChecking(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      await runHealthCheck(resolvedTenantId);
      toast.success("Health check integrasi payroll selesai");
    } catch (error) {
      const ref = reportError(error, "org.payroll.integrations.health_check");
      toast.error(appendErrorReference("Health check integrasi payroll gagal", ref));
    } finally {
      setIsChecking(false);
    }
  };

  const handleTestWebhook = async () => {
    try {
      setIsTestingWebhook(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const endpointUrl = settings.webhook.endpointUrl.trim();
      const secretKey = settings.webhook.secretKey.trim();
      if (!endpointUrl) {
        toast.error("Endpoint webhook wajib diisi.");
        return;
      }
      if (!endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
        toast.error("Endpoint webhook harus dimulai http:// atau https://");
        return;
      }
      if (!secretKey) {
        toast.error("Webhook secret wajib diisi untuk test signature.");
        return;
      }

      const traceId = generatePayrollWebhookTraceId();
      const payload = buildPayrollWebhookTestPayload({
        tenantId: resolvedTenantId,
        traceId,
        attendanceSource: settings.attendance.source,
        attendanceRecords30d: health?.attendanceRecords30d || 0,
        payrollPeriodCount: health?.payrollPeriodCount || 0,
      });

      const result = await sendPayrollWebhookTest({
        tenantId: resolvedTenantId,
        payload,
      });

      setLastWebhookTraceId(result.traceId || traceId);
      setLastWebhookLogId(result.logId);
      setLastWebhookRelayTraceId(result.relayTraceId);
      setLastWebhookSuccess(result.success);
      setLastWebhookError(result.error);
      setLastWebhookResult({ status: result.status, responseText: result.responseText });
      if (result.success) {
        toast.success(
          `Test webhook via relay terkirim (HTTP ${result.status}) | trace_id: ${result.traceId || traceId}`,
        );
      } else {
        toast.error(
          `Test webhook gagal (HTTP ${result.status || 0}) | trace_id: ${result.traceId || traceId}${result.error ? ` | ${result.error}` : ""}`,
        );
      }
    } catch (error) {
      const ref = reportError(error, "org.payroll.integrations.webhook_test");
      toast.error(appendErrorReference("Gagal mengirim test webhook", ref));
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const integrationHealthStatus =
    health && health.employeeWithUserCount > 0 && health.payrollPeriodCount > 0 ? "Terhubung" : "Perlu Setup";

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Payroll</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Integrasi Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Konfigurasi sinkronisasi payroll ke data absensi, export akuntansi, payout bank, dan webhook API.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard title="Integrasi Aktif" value={String(integrationSummary)} subtitle="Modul yang diaktifkan" />
          <SummaryCard
            title="Status Koneksi"
            value={integrationHealthStatus}
            subtitle={health ? `Dicek: ${formatDateTime(health.checkedAt)}` : "Belum dicek"}
          />
          <SummaryCard
            title="Karyawan Aktif"
            value={String(health?.employeeCount || 0)}
            subtitle={`Terhubung user: ${health?.employeeWithUserCount || 0}`}
          />
          <SummaryCard
            title="Data Absensi 30 Hari"
            value={String(health?.attendanceRecords30d || 0)}
            subtitle={`Sampel karyawan: ${health?.sampleEmployeeCount || 0}`}
          />
          <SummaryCard
            title="Shared DB Check"
            value={health?.sharedAttendanceStatus === "match" ? "Sinkron" : health?.sharedAttendanceStatus === "mismatch" ? "Mismatch" : "Unknown"}
            subtitle={
              health?.attendanceRecordsPartitioned30d === null
                ? "attendance_records_partitioned tidak terbaca"
                : `partitioned: ${health?.attendanceRecordsPartitioned30d ?? 0}`
            }
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Integrasi Absensi (DB Shared)</CardTitle>
            <CardDescription>
              Payroll membaca data absensi langsung dari database yang sama dengan aplikasi absensi (tabel
              <span className="px-1 font-mono text-xs">attendance_records</span> dan
              <span className="px-1 font-mono text-xs">attendance_records_partitioned</span>).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>Aktifkan sinkronisasi absensi</span>
                <Switch
                  checked={settings.attendance.enabled}
                  onCheckedChange={(checked) =>
                    updateSettings("attendance", { ...settings.attendance, enabled: checked })
                  }
                />
              </Label>
              <Label>Sumber data absensi</Label>
              <Select
                value={settings.attendance.source}
                onValueChange={(value) =>
                  updateSettings("attendance", {
                    ...settings.attendance,
                    source: value as PayrollIntegrationSettings["attendance"]["source"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance_records">attendance_records</SelectItem>
                  <SelectItem value="timesheet_summary">timesheet_summary (legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center justify-between">
                <span>Tarik data otomatis per run payroll</span>
                <Switch
                  checked={settings.attendance.autoSync}
                  onCheckedChange={(checked) =>
                    updateSettings("attendance", { ...settings.attendance, autoSync: checked })
                  }
                />
              </Label>
              <Label className="flex items-center justify-between">
                <span>Wajibkan mapping employee_id payroll-absensi</span>
                <Switch
                  checked={settings.attendance.requireEmployeeMapping}
                  onCheckedChange={(checked) =>
                    updateSettings("attendance", {
                      ...settings.attendance,
                      requireEmployeeMapping: checked,
                    })
                  }
                />
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Integrasi Akuntansi</CardTitle>
              <CardDescription>Export jurnal payroll ke sistem akuntansi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="flex items-center justify-between">
                <span>Aktifkan export akuntansi</span>
                <Switch
                  checked={settings.accounting.enabled}
                  onCheckedChange={(checked) =>
                    updateSettings("accounting", { ...settings.accounting, enabled: checked })
                  }
                />
              </Label>
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select
                  value={settings.accounting.provider}
                  onValueChange={(value) =>
                    updateSettings("accounting", {
                      ...settings.accounting,
                      provider: value as PayrollIntegrationSettings["accounting"]["provider"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual_csv">Manual CSV</SelectItem>
                    <SelectItem value="jurnal_api">Jurnal API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cost Center Field</Label>
                <Input
                  value={settings.accounting.costCenterField}
                  onChange={(event) =>
                    updateSettings("accounting", {
                      ...settings.accounting,
                      costCenterField: event.target.value,
                    })
                  }
                  placeholder="department"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mapping Mode</Label>
                <Select
                  value={settings.accounting.journalMappingMode}
                  onValueChange={(value) =>
                    updateSettings("accounting", {
                      ...settings.accounting,
                      journalMappingMode: value as PayrollIntegrationSettings["accounting"]["journalMappingMode"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary">Summary Journal</SelectItem>
                    <SelectItem value="component">Per Komponen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Akun Debit Default</Label>
                  <Input
                    value={settings.accounting.defaultDebitAccount}
                    onChange={(event) =>
                      updateSettings("accounting", {
                        ...settings.accounting,
                        defaultDebitAccount: event.target.value,
                      })
                    }
                    placeholder="5-1000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Akun Kredit Default</Label>
                  <Input
                    value={settings.accounting.defaultCreditAccount}
                    onChange={(event) =>
                      updateSettings("accounting", {
                        ...settings.accounting,
                        defaultCreditAccount: event.target.value,
                      })
                    }
                    placeholder="2-1000"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Integrasi Bank & Payout</CardTitle>
              <CardDescription>Konfigurasi output pembayaran gaji ke bank.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="flex items-center justify-between">
                <span>Aktifkan payout export</span>
                <Switch
                  checked={settings.payout.enabled}
                  onCheckedChange={(checked) => updateSettings("payout", { ...settings.payout, enabled: checked })}
                />
              </Label>
              <div className="space-y-1.5">
                <Label>Format file bank</Label>
                <Select
                  value={settings.payout.bankFormat}
                  onValueChange={(value) =>
                    updateSettings("payout", {
                      ...settings.payout,
                      bankFormat: value as PayrollIntegrationSettings["payout"]["bankFormat"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic_csv">Generic CSV</SelectItem>
                    <SelectItem value="bca_csv">BCA CSV</SelectItem>
                    <SelectItem value="bri_csv">BRI CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Label className="flex items-center justify-between">
                <span>Auto mark paid saat import sukses</span>
                <Switch
                  checked={settings.payout.autoMarkPaid}
                  onCheckedChange={(checked) =>
                    updateSettings("payout", { ...settings.payout, autoMarkPaid: checked })
                  }
                />
              </Label>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Payroll</CardTitle>
            <CardDescription>Kirim event payroll run/approval/payment ke endpoint eksternal.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between">
                <span>Aktifkan webhook</span>
                <Switch
                  checked={settings.webhook.enabled}
                  onCheckedChange={(checked) => updateSettings("webhook", { ...settings.webhook, enabled: checked })}
                />
              </Label>
              <Label>Endpoint URL</Label>
              <Input
                value={settings.webhook.endpointUrl}
                onChange={(event) => updateSettings("webhook", { ...settings.webhook, endpointUrl: event.target.value })}
                placeholder="https://api.example.com/payroll/webhook"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Webhook Secret</Label>
              <Input
                type="password"
                value={settings.webhook.secretKey}
                onChange={(event) => updateSettings("webhook", { ...settings.webhook, secretKey: event.target.value })}
                placeholder="whsec_..."
              />
              <p className="text-xs text-muted-foreground">
                Secret disimpan di tenant setting. Gunakan rotasi berkala jika endpoint dipakai lintas sistem.
              </p>
              <Button
                variant="secondary"
                onClick={handleTestWebhook}
                disabled={isTestingWebhook || isLoading}
                className="w-full md:w-auto"
              >
                {isTestingWebhook ? "Mengirim test..." : "Kirim Test Webhook"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {lastWebhookResult ? (
          <Card>
            <CardHeader>
              <CardTitle>Hasil Test Webhook</CardTitle>
              <CardDescription>
                trace_id: <span className="font-mono text-xs">{lastWebhookTraceId || "-"}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>
                status relay:{" "}
                <span className={lastWebhookSuccess ? "font-medium text-emerald-600" : "font-medium text-destructive"}>
                  {lastWebhookSuccess ? "success" : "failed"}
                </span>
              </p>
              <p>
                log_id audit: <span className="font-mono text-xs">{lastWebhookLogId || "-"}</span>
              </p>
              <p>
                relay_trace_id: <span className="font-mono text-xs">{lastWebhookRelayTraceId || "-"}</span>
              </p>
              <p>
                HTTP Status: <span className="font-medium">{lastWebhookResult.status}</span>
              </p>
              <p className="text-xs text-muted-foreground break-all">
                Response: {lastWebhookResult.responseText.slice(0, 300) || "-"}
              </p>
              {lastWebhookError ? (
                <p className="text-xs text-destructive break-all">Error: {lastWebhookError}</p>
              ) : null}
              <div className="pt-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const query = new URLSearchParams();
                      query.set("entity", "payroll_webhook");
                      if (lastWebhookTraceId) query.set("trace", lastWebhookTraceId);
                      if (lastWebhookLogId) query.set("log", lastWebhookLogId);
                      query.set("q", lastWebhookLogId || lastWebhookTraceId || "");
                      navigate(`/org/payroll/audit-log?${query.toString()}`);
                    }}
                  >
                    Buka di Audit Log
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook || isLoading}
                  >
                    {isTestingWebhook ? "Retry..." : "Retry Test"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loadError ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/org/payroll/audit-log")}> 
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Menyimpan..." : "Simpan Konfigurasi"}
          </Button>
          <Button variant="secondary" onClick={handleHealthCheck} disabled={isChecking || isLoading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {isChecking ? "Mengecek..." : "Health Check"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/org/payroll")}>Payroll Home</Button>
        </div>
      </div>
    </OrganizationLayout>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
