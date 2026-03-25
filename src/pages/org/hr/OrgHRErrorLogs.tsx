import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { getHrRoutePolicy } from "@/lib/hrRouteAccess";
import { getHrRouteStatusBadgeLabel, getHrRouteStatusDescription } from "@/lib/hrRouteStatusPresentation";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  DEFAULT_HR_ERROR_ALERT_SETTINGS,
  fetchTenantHrErrorAlertSettings,
  saveTenantHrErrorAlertSettings,
  type HrErrorAlertSettings,
} from "@/lib/hrErrorAlertSettings";
import { BellRing, Download, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

type HrErrorStatus = "kritis" | "non_kritis" | "selesai" | "arsip_kritis" | "arsip_non_kritis";
type ClientErrorLogRow = Database["public"]["Tables"]["client_error_logs"]["Row"];
type AlertTarget = { channel: "webhook" | "slack" | "whatsapp" | "email"; url: string };

const ERROR_STORAGE_KEY = "absensiku:error_logs";

const RANGE_OPTIONS = [
  { label: "1 Jam", value: "1" },
  { label: "6 Jam", value: "6" },
  { label: "24 Jam", value: "24" },
  { label: "72 Jam", value: "72" },
  { label: "7 Hari", value: "168" },
] as const;

const CRITICAL_ALERT_RELAY_FUNCTION = "critical-error-alert-relay";

const parseDateLabel = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(parsed);
};

const isHrError = (entry: Pick<ClientErrorLogRow, "context" | "route">) => {
  const context = (entry.context || "").toLowerCase();
  const route = (entry.route || "").toLowerCase();
  return context.startsWith("org.hr.") || route.includes("/org/hr");
};

const deriveStatus = (entry: ClientErrorLogRow): HrErrorStatus => {
  if (entry.is_archived && entry.is_non_critical) return "arsip_non_kritis";
  if (entry.is_archived) return "arsip_kritis";
  if (entry.is_resolved) return "selesai";
  if (entry.is_non_critical) return "non_kritis";
  return "kritis";
};

const toCsv = (rows: ClientErrorLogRow[]) => {
  const header = ["ref", "timestamp", "context", "message", "route"];
  const lines = rows.map((item) => [item.error_ref, item.occurred_at, item.context, item.message, item.route || ""]);
  const encode = (value: string) => `"${(value || "").replaceAll('"', '""')}"`;
  return [header, ...lines].map((line) => line.map((cell) => encode(String(cell || ""))).join(",")).join("\n");
};

const download = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const toAlertTargets = (settings: HrErrorAlertSettings): AlertTarget[] =>
  [
    { channel: "webhook", url: settings.webhookUrl.trim() },
    { channel: "slack", url: settings.slackWebhookUrl.trim() },
    { channel: "whatsapp", url: settings.whatsappWebhookUrl.trim() },
    { channel: "email", url: settings.emailWebhookUrl.trim() },
  ].filter((target) => target.url.length > 0);

export default function OrgHRErrorLogs() {
  const routePolicy = getHrRoutePolicy("/org/hr/help/error-logs");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<ClientErrorLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [selectedContext, setSelectedContext] = useState<string>("all");
  const [rangeHours, setRangeHours] = useState<string>("24");
  const [activeTab, setActiveTab] = useState<HrErrorStatus>("kritis");
  const [alertSettings, setAlertSettings] = useState<HrErrorAlertSettings>(DEFAULT_HR_ERROR_ALERT_SETTINGS);
  const [isSavingAlertSettings, setIsSavingAlertSettings] = useState(false);
  const [canManageAlertSettings, setCanManageAlertSettings] = useState(false);
  const realtimeNotifiedRefs = useRef<Set<string>>(new Set());
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/help/error-logs");

  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [{ data, error }, settingsResult, authResult] = await Promise.all([
        supabase
          .from("client_error_logs")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("occurred_at", { ascending: false })
          .limit(1000),
        fetchTenantHrErrorAlertSettings(resolvedTenantId),
        supabase.auth.getUser(),
      ]);

      if (error) throw error;
      setRows(((data || []) as ClientErrorLogRow[]).filter(isHrError));
      setAlertSettings(settingsResult);

      const userId = authResult.data.user?.id;
      if (!userId) {
        setCanManageAlertSettings(false);
      } else {
        const { data: roleRows, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("tenant_id", resolvedTenantId)
          .in("role", ["super_admin", "admin_instansi"]);
        if (roleError) throw roleError;
        setCanManageAlertSettings((roleRows || []).length > 0);
      }
    } catch (error) {
      const ref = reportError(error, "org.hr.error_logs.fetch");
      toast.error(appendErrorReference("Gagal memuat log error HR", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const sendCriticalAlertToWebhooks = useCallback(
    async (entry: ClientErrorLogRow) => {
      if (!alertSettings.enableRealtimeAlerts) return;
      const targets = toAlertTargets(alertSettings);
      if (targets.length === 0) return;

      const payload = {
        event: "critical_error_log",
        source: "absensiku.org.hr.error_logs",
        sent_at: new Date().toISOString(),
        tenant_id: tenantId,
        error: {
          ref: entry.error_ref,
          timestamp: entry.occurred_at,
          context: entry.context,
          message: entry.message,
          route: entry.route,
          metadata: entry.metadata,
        },
      };

      const postDirectlyFromClient = async () => {
        const results = await Promise.allSettled(
          targets.map((target) =>
            fetch(target.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, channel: target.channel }),
            }),
          ),
        );
        const failed = results.filter((result) => result.status === "rejected");
        if (failed.length > 0) {
          const ref = reportError(new Error("Sebagian webhook HR gagal dikirim"), "org.hr.error_logs.realtime_alert_webhook", {
            failed_targets: failed.length,
            total_targets: targets.length,
            error_ref: entry.error_ref,
          });
          toast.warning(appendErrorReference("Sebagian alert realtime HR gagal dikirim", ref));
        }
      };

      try {
        const { data, error } = await supabase.functions.invoke(CRITICAL_ALERT_RELAY_FUNCTION, {
          body: payload,
        });
        if (error) throw error;
        const response = (data || {}) as Record<string, unknown>;
        const failedTargets = Number(response.failed || 0);
        if (Number.isFinite(failedTargets) && failedTargets > 0) {
          const ref = reportError(new Error("Sebagian webhook HR gagal dikirim lewat relay"), "org.hr.error_logs.realtime_alert_relay_partial", {
            failed_targets: failedTargets,
            attempted_targets: Number(response.attempted || targets.length),
            error_ref: entry.error_ref,
          });
          toast.warning(appendErrorReference("Sebagian alert realtime HR gagal dikirim", ref));
        }
      } catch {
        await postDirectlyFromClient();
      }
    },
    [alertSettings, tenantId],
  );

  useEffect(() => {
    if (!tenantId || !alertSettings.enableRealtimeAlerts) return;

    const channel = supabase
      .channel(`org-hr-error-alert-${tenantId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_error_logs",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const next = payload.new as ClientErrorLogRow;
          if (!next || !isHrError(next)) return;
          if (next.is_non_critical || next.is_archived || next.is_resolved) return;
          if (realtimeNotifiedRefs.current.has(next.error_ref)) return;
          realtimeNotifiedRefs.current.add(next.error_ref);

          setRows((prev) => {
            if (prev.some((entry) => entry.id === next.id)) return prev;
            return [next, ...prev];
          });

          toast.error(`Error kritis HR baru: ${next.error_ref}`, {
            description: `${next.context} — ${next.message.slice(0, 120)}`,
          });
          void sendCriticalAlertToWebhooks(next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alertSettings.enableRealtimeAlerts, sendCriticalAlertToWebhooks, tenantId]);

  const now = Date.now();

  const contexts = useMemo(() => {
    const unique = new Set(rows.map((row) => row.context).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const counts = useMemo(() => {
    const bucket = {
      kritis: 0,
      non_kritis: 0,
      selesai: 0,
      arsip_kritis: 0,
      arsip_non_kritis: 0,
    } as Record<HrErrorStatus, number>;

    rows.forEach((entry) => {
      bucket[deriveStatus(entry)] += 1;
    });

    return {
      ...bucket,
      total: rows.length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const hours = Number(rangeHours);
    const minTime = now - hours * 60 * 60 * 1000;
    const normalizedKeyword = keyword.trim().toLowerCase();

    return rows.filter((entry) => {
      const entryTime = new Date(entry.occurred_at).getTime();
      if (Number.isFinite(entryTime) && entryTime < minTime) return false;
      if (deriveStatus(entry) !== activeTab) return false;
      if (selectedContext !== "all" && entry.context !== selectedContext) return false;

      if (!normalizedKeyword) return true;
      const haystack = [
        entry.error_ref,
        entry.context,
        entry.message,
        entry.name,
        entry.route,
        JSON.stringify(entry.metadata || {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [activeTab, keyword, now, rangeHours, rows, selectedContext]);

  const patchStatusForRows = async (nextStatus: HrErrorStatus) => {
    if (filteredRows.length === 0) return;
    const ids = filteredRows.map((entry) => entry.id);

    const patch: Record<string, unknown> = {};
    if (nextStatus === "non_kritis") {
      patch.is_non_critical = true;
      patch.is_archived = false;
      patch.archived_at = null;
      patch.archive_note = null;
    } else if (nextStatus === "selesai") {
      patch.is_resolved = true;
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = "org_hr";
    } else if (nextStatus === "arsip_kritis") {
      patch.is_archived = true;
      patch.archived_at = new Date().toISOString();
      patch.archive_note = "Arsip per halaman HR";
      patch.is_non_critical = false;
    } else if (nextStatus === "arsip_non_kritis") {
      patch.is_archived = true;
      patch.archived_at = new Date().toISOString();
      patch.archive_note = "Arsip non kritis per halaman HR";
      patch.is_non_critical = true;
    }

    try {
      if (!tenantId) {
        toast.error("Tenant organisasi tidak ditemukan.");
        return;
      }
      const { error } = await supabase
        .from("client_error_logs")
        .update(patch)
        .eq("tenant_id", tenantId)
        .in("id", ids);
      if (error) throw error;
      toast.success(`Status ${ids.length} log diperbarui.`);
      await fetchRows();
    } catch (error) {
      const ref = reportError(error, "org.hr.error_logs.bulk_status_update", {
        target_status: nextStatus,
        total_ids: ids.length,
      });
      toast.error(appendErrorReference("Gagal memperbarui status log", ref));
    }
  };

  const handleRetentionNow = async () => {
    try {
      if (!tenantId) {
        toast.error("Tenant organisasi tidak ditemukan.");
        return;
      }

      const { error } = await supabase.rpc("apply_client_error_logs_retention_for_tenant", {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      toast.success("Retensi log dijalankan.");
      await fetchRows();
    } catch (error) {
      const ref = reportError(error, "org.hr.error_logs.retention.run", {
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menjalankan retensi log", ref));
    }
  };

  const handleClearLocalLogs = () => {
    if (typeof window === "undefined") return;
    window.clearAbsensikuErrorLogs?.();
    if (!window.clearAbsensikuErrorLogs) {
      window.localStorage.removeItem(ERROR_STORAGE_KEY);
    }
    toast.success("Log error lokal browser dibersihkan.");
  };

  const handleExportCsv = () => {
    download(`hr-error-logs-${Date.now()}.csv`, toCsv(filteredRows), "text/csv;charset=utf-8;");
  };

  const handleExportJson = () => {
    download(`hr-error-logs-${Date.now()}.json`, JSON.stringify(filteredRows, null, 2), "application/json");
  };

  const saveAlertSettings = async () => {
    if (!tenantId) return;
    setIsSavingAlertSettings(true);
    try {
      await saveTenantHrErrorAlertSettings(tenantId, alertSettings);
      toast.success("Pengaturan alert realtime HR tersimpan.");
    } catch (error) {
      const ref = reportError(error, "org.hr.error_logs.alert_settings.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan alert HR", ref));
    } finally {
      setIsSavingAlertSettings(false);
    }
  };

  const resetAlertSettings = async () => {
    setAlertSettings(DEFAULT_HR_ERROR_ALERT_SETTINGS);
    if (!tenantId) return;
    setIsSavingAlertSettings(true);
    try {
      await saveTenantHrErrorAlertSettings(tenantId, DEFAULT_HR_ERROR_ALERT_SETTINGS);
      toast.success("Pengaturan alert realtime HR direset.");
    } catch (error) {
      const ref = reportError(error, "org.hr.error_logs.alert_settings.reset");
      toast.error(appendErrorReference("Gagal reset pengaturan alert HR", ref));
    } finally {
      setIsSavingAlertSettings(false);
    }
  };

  const resetFilters = () => {
    setKeyword("");
    setSelectedContext("all");
    setRangeHours("24");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">HR</Badge>
            <Badge variant="secondary">{getHrRouteStatusBadgeLabel(routePolicy.status)}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Log Error HR</h1>
          <p className="text-sm text-muted-foreground">Catatan error operasional HR berdasarkan nomor referensi untuk kebutuhan triase internal.</p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat triase, ekspor, dan konfigurasi alert" : access.canView ? "monitoring internal hanya-baca" : "akses dibatasi"}
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{getHrRouteStatusDescription(routePolicy.status, "audit")}</p>
          </CardContent>
        </Card>

        <Card className="border-amber-300/70 bg-amber-50/50">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void fetchRows()} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Muat Ulang
              </Button>
              <Button variant="outline" onClick={handleExportCsv} disabled={isLoadingAccess || !access.canExport}>
                <Download className="mr-2 h-4 w-4" />
                Ekspor CSV
              </Button>
              <Button variant="outline" onClick={handleExportJson} disabled={isLoadingAccess || !access.canExport}>
                <Download className="mr-2 h-4 w-4" />
                Ekspor JSON
              </Button>
              <Button variant="outline" onClick={() => void handleRetentionNow()} disabled={isLoadingAccess || !access.canApprove}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Retensi Sekarang
              </Button>
              <Button variant="destructive" onClick={handleClearLocalLogs} disabled={isLoadingAccess || !access.canEdit}>
                <Trash2 className="mr-2 h-4 w-4" />
                Bersihkan Log Lokal
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              Alert Realtime Kritis
            </CardTitle>
            <CardDescription>
              Simpan endpoint webhook untuk notifikasi realtime error kritis (webhook umum, Slack, WhatsApp, email).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Aktifkan alert realtime kritis</p>
                <p className="text-xs text-muted-foreground">Saat aktif, setiap log kritis baru akan mengirim notifikasi ke endpoint yang terisi.</p>
              </div>
              <Switch
                checked={alertSettings.enableRealtimeAlerts}
                onCheckedChange={(checked) => setAlertSettings((prev) => ({ ...prev, enableRealtimeAlerts: checked }))}
                disabled={isLoadingAccess || !access.canConfigure}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                value={alertSettings.webhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, webhookUrl: event.target.value }))}
                placeholder="Webhook Umum (https://...)"
                disabled={isLoadingAccess || !access.canConfigure}
              />
              <Input
                value={alertSettings.slackWebhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, slackWebhookUrl: event.target.value }))}
                placeholder="Slack Webhook (https://...)"
                disabled={isLoadingAccess || !access.canConfigure}
              />
              <Input
                value={alertSettings.whatsappWebhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, whatsappWebhookUrl: event.target.value }))}
                placeholder="WhatsApp Webhook (https://...)"
                disabled={isLoadingAccess || !access.canConfigure}
              />
              <Input
                value={alertSettings.emailWebhookUrl}
                onChange={(event) => setAlertSettings((prev) => ({ ...prev, emailWebhookUrl: event.target.value }))}
                placeholder="Email Webhook (https://...)"
                disabled={isLoadingAccess || !access.canConfigure}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveAlertSettings()} disabled={isSavingAlertSettings || !canManageAlertSettings || isLoadingAccess || !access.canConfigure}>
                Simpan Pengaturan Alert
              </Button>
              <Button variant="outline" onClick={() => void resetAlertSettings()} disabled={isSavingAlertSettings || !canManageAlertSettings || isLoadingAccess || !access.canConfigure}>
                Muat Ulang Pengaturan
              </Button>
              {!canManageAlertSettings ? (
                <p className="self-center text-xs text-muted-foreground">Hanya admin organisasi yang dapat mengubah pengaturan alert.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Error</CardTitle>
            <CardDescription>
              {counts.total} error tercatat • Sumber: Terpusat (`client_error_logs`)
            </CardDescription>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Rentang: {rangeHours} Jam</Badge>
              <Badge variant="destructive">Kritis: {counts.kritis}</Badge>
              <Badge variant="secondary">Non Kritis: {counts.non_kritis}</Badge>
              <Badge variant="outline">Selesai: {counts.selesai}</Badge>
              <Badge variant="outline">Arsip Kritis: {counts.arsip_kritis}</Badge>
              <Badge variant="outline">Arsip Non Kritis: {counts.arsip_non_kritis}</Badge>
              <Badge>Total: {counts.total}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant={activeTab === "kritis" ? "default" : "outline"} onClick={() => setActiveTab("kritis")}>Kritis ({counts.kritis})</Button>
              <Button variant={activeTab === "non_kritis" ? "default" : "outline"} onClick={() => setActiveTab("non_kritis")}>Non Kritis ({counts.non_kritis})</Button>
              <Button variant={activeTab === "selesai" ? "default" : "outline"} onClick={() => setActiveTab("selesai")}>Selesai ({counts.selesai})</Button>
              <Button variant={activeTab === "arsip_kritis" ? "default" : "outline"} onClick={() => setActiveTab("arsip_kritis")}>Arsip Kritis ({counts.arsip_kritis})</Button>
              <Button variant={activeTab === "arsip_non_kritis" ? "default" : "outline"} onClick={() => setActiveTab("arsip_non_kritis")}>Arsip Non Kritis ({counts.arsip_non_kritis})</Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void patchStatusForRows("non_kritis")} disabled={isLoadingAccess || !access.canEdit}>
                Tandai Halaman Ini Non Kritis
              </Button>
              <Button variant="outline" onClick={() => void patchStatusForRows("selesai")} disabled={isLoadingAccess || !access.canApprove}>
                Tandai Halaman Ini Selesai
              </Button>
              <Button
                variant="outline"
                onClick={() => void patchStatusForRows(activeTab === "kritis" ? "arsip_kritis" : "arsip_non_kritis")}
                disabled={isLoadingAccess || !access.canApprove}
              >
                Arsipkan Halaman Ini
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label className="mb-2 block text-xs">Pencarian</Label>
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="Cari berdasarkan Ref, context, pesan, atau route..."
                />
              </div>
              <div>
                <Label className="mb-2 block text-xs">Konteks</Label>
                <Select value={selectedContext} onValueChange={setSelectedContext}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Konteks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Konteks</SelectItem>
                    {contexts.map((ctx) => (
                      <SelectItem key={ctx} value={ctx}>
                        {ctx}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block text-xs">Rentang</Label>
                <Select value={rangeHours} onValueChange={setRangeHours}>
                  <SelectTrigger>
                    <SelectValue placeholder="24 Jam" />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Button variant="outline" onClick={resetFilters}>Reset Semua Filter</Button>
            </div>

            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref Error</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Konteks</TableHead>
                    <TableHead>Pesan</TableHead>
                    <TableHead>Rute</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        {isLoading ? "Memuat data..." : "Tidak ada data pada filter aktif."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {entry.error_ref}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{parseDateLabel(entry.occurred_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.context}</TableCell>
                        <TableCell className="max-w-[420px] whitespace-normal break-words">{entry.message}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.route || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
