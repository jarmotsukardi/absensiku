import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, BellRing, Copy, Download, Eye, RefreshCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { fetchTenantPayrollIntegrations, saveTenantPayrollIntegrations } from "@/lib/payrollIntegrationSettings";

type PayrollAuditLog = Database["public"]["Tables"]["payroll_audit_logs"]["Row"];
type SeverityFilter = "all" | "error" | "warning";
type ErrorTab = "critical" | "non_critical" | "done" | "archived_critical" | "archived_non_critical";
type TimeRange = "24h" | "7d" | "30d";

const ITEMS_PER_PAGE = 20;

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "24h": "24 jam",
  "7d": "7 hari",
  "30d": "30 hari",
};

const SEVERITY_LABELS: Record<Exclude<SeverityFilter, "all">, string> = {
  error: "Error",
  warning: "Peringatan",
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const inferSeverity = (row: PayrollAuditLog): "error" | "warning" => {
  const dynamicSeverity = (row as unknown as Record<string, unknown>).severity;
  if (dynamicSeverity === "warning") return "warning";
  if (dynamicSeverity === "error") return "error";
  const haystack = `${row.action_type || ""} ${row.action_label || ""} ${row.notes || ""}`.toLowerCase();
  if (haystack.includes("warn")) return "warning";
  return "error";
};

const inferStatus = (row: PayrollAuditLog): "open" | "done" | "archived" => {
  const dynamicStatus = (row as unknown as Record<string, unknown>).status;
  if (dynamicStatus === "done") return "done";
  if (dynamicStatus === "archived") return "archived";
  if (dynamicStatus === "open") return "open";
  const haystack = `${row.action_type || ""} ${row.action_label || ""} ${row.notes || ""}`.toLowerCase();
  if (haystack.includes("archive") || haystack.includes("arsip")) return "archived";
  if (
    haystack.includes("done") ||
    haystack.includes("resolved") ||
    haystack.includes("selesai") ||
    haystack.includes("fixed")
  ) {
    return "done";
  }
  return "open";
};

const inferContext = (row: PayrollAuditLog): string => {
  const route = inferRoute(row);
  if (row.action_type === "webhook_test_failed" || route.includes("/integrations")) return "integration.webhook";
  if (route.includes("/roles")) return "org.payroll.roles.fetch";
  if (route.includes("/validation")) return "org.payroll.validation";
  if (route.includes("/run-engine")) return "org.payroll.run_engine";
  return row.entity_type || "payroll.audit";
};

const inferRoute = (row: PayrollAuditLog): string => {
  const dynamicRoute = (row as unknown as Record<string, unknown>).source_route;
  if (typeof dynamicRoute === "string" && dynamicRoute.trim().length > 0) return dynamicRoute.trim();
  const notes = row.notes || "";
  const match = notes.match(/\/org\/payroll\/[a-z-]+/i);
  if (match?.[0]) return match[0];
  if (row.entity_type === "payroll_webhook") return "/org/payroll/integrations";
  return "/org/payroll/audit-log";
};

const isErrorLikeRow = (row: PayrollAuditLog): boolean => {
  const haystack = `${row.action_type || ""} ${row.action_label || ""} ${row.notes || ""}`.toLowerCase();
  return (
    haystack.includes("error") ||
    haystack.includes("failed") ||
    haystack.includes("fail") ||
    haystack.includes("gagal") ||
    haystack.includes("invalid") ||
    haystack.includes("warn")
  );
};

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

export default function OrgPayrollErrorLog() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<PayrollAuditLog[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [activeTab, setActiveTab] = useState<ErrorTab>("critical");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [contextFilter, setContextFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertWebhookUrl, setAlertWebhookUrl] = useState("");
  const [alertSlackUrl, setAlertSlackUrl] = useState("");
  const [alertWhatsappUrl, setAlertWhatsappUrl] = useState("");
  const [alertEmailWebhookUrl, setAlertEmailWebhookUrl] = useState("");
  const [isSavingAlert, setIsSavingAlert] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const { data, error } = await supabase
        .from("payroll_audit_logs")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("created_at", { ascending: false })
        .limit(600);
      if (error) throw error;

      setRows((data || []).filter(isErrorLikeRow));
    } catch (error) {
      const ref = reportError(error, "org.payroll.error_log.fetch");
      const message = appendErrorReference("Gagal memuat log error payroll", ref);
      setLoadError(message);
      toast.error(message);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const loadAlertSettings = useCallback(async () => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const integrationRes = await fetchTenantPayrollIntegrations(resolvedTenantId);
      setAlertEnabled(integrationRes.settings.errorAlert.enabled);
      setAlertWebhookUrl(integrationRes.settings.errorAlert.webhookUrl);
      setAlertSlackUrl(integrationRes.settings.errorAlert.slackWebhookUrl);
      setAlertWhatsappUrl(integrationRes.settings.errorAlert.whatsappWebhookUrl);
      setAlertEmailWebhookUrl(integrationRes.settings.errorAlert.emailWebhookUrl);
    } catch (error) {
      const ref = reportError(error, "org.payroll.error_log.alert_settings.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan alert payroll", ref));
    }
  }, [tenantId]);

  useEffect(() => {
    void loadAlertSettings();
  }, [loadAlertSettings]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, severityFilter, activeTab, contextFilter, userFilter, tenantFilter, timeRange]);

  const visibleRows = useMemo(() => rows.filter((row) => !hiddenIds.has(row.id)), [rows, hiddenIds]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const now = Date.now();
    const timeWindowMs = timeRange === "24h" ? 24 * 60 * 60 * 1000 : timeRange === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    return visibleRows.filter((row) => {
      const createdAtMs = new Date(row.created_at || "").getTime();
      if (!Number.isNaN(createdAtMs) && now - createdAtMs > timeWindowMs) return false;

      const severity = inferSeverity(row);
      const status = inferStatus(row);
      const isCritical = severity === "error";

      if (severityFilter !== "all" && severity !== severityFilter) return false;
      if (activeTab === "critical" && (!isCritical || status !== "open")) return false;
      if (activeTab === "non_critical" && (isCritical || status !== "open")) return false;
      if (activeTab === "done" && status !== "done") return false;
      if (activeTab === "archived_critical" && !(status === "archived" && isCritical)) return false;
      if (activeTab === "archived_non_critical" && !(status === "archived" && !isCritical)) return false;

      if (contextFilter !== "all" && inferContext(row) !== contextFilter) return false;
      if (userFilter !== "all" && (row.actor_role || "-") !== userFilter) return false;
      if (tenantFilter !== "all" && row.tenant_id !== tenantFilter) return false;

      if (!keyword) return true;
      const haystack = [
        row.action_type,
        row.action_label,
        row.entity_type,
        row.entity_id,
        row.trace_id,
        row.log_id,
        row.notes,
        row.actor_role,
        inferContext(row),
        inferRoute(row),
      ]
        .map((value) => String(value || ""))
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [visibleRows, searchTerm, severityFilter, activeTab, contextFilter, userFilter, tenantFilter, timeRange]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = useMemo(() => {
    const from = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(from, from + ITEMS_PER_PAGE);
  }, [filteredRows, safePage]);

  const summary = useMemo(() => {
    const dataset = visibleRows;
    const criticalOpen = dataset.filter((row) => inferSeverity(row) === "error" && inferStatus(row) === "open").length;
    const nonCriticalOpen = dataset.filter((row) => inferSeverity(row) === "warning" && inferStatus(row) === "open").length;
    const done = dataset.filter((row) => inferStatus(row) === "done").length;
    const archivedCritical = dataset.filter((row) => inferSeverity(row) === "error" && inferStatus(row) === "archived").length;
    const archivedNonCritical = dataset.filter((row) => inferSeverity(row) === "warning" && inferStatus(row) === "archived").length;
    const withTraceCount = dataset.filter((row) => Boolean(row.trace_id)).length;
    return {
      total: dataset.length,
      criticalOpen,
      nonCriticalOpen,
      done,
      archivedCritical,
      archivedNonCritical,
      withTraceCount,
    };
  }, [visibleRows]);

  const contextOptions = useMemo(
    () => Array.from(new Set(visibleRows.map((row) => inferContext(row)))).sort((a, b) => a.localeCompare(b)),
    [visibleRows],
  );
  const userOptions = useMemo(
    () => Array.from(new Set(visibleRows.map((row) => row.actor_role || "-"))).sort((a, b) => a.localeCompare(b)),
    [visibleRows],
  );
  const tenantOptions = useMemo(
    () => Array.from(new Set(visibleRows.map((row) => row.tenant_id))).sort((a, b) => a.localeCompare(b)),
    [visibleRows],
  );

  const handleExportCsv = () => {
    const csv = [
      ["ref_error", "waktu", "konteks", "pesan", "route", "severity", "status", "actor_role", "tenant_id", "notes"],
      ...filteredRows.map((row) => [
        row.trace_id || row.log_id || row.id,
        row.created_at || "",
        inferContext(row),
        row.action_label || row.action_type || "",
        inferRoute(row),
        inferSeverity(row),
        inferStatus(row),
        row.actor_role || "",
        row.tenant_id,
        row.notes || "",
      ]),
    ]
      .map((line) => line.map((value) => toCsvSafe(value)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-error-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV berhasil");
  };

  const handleExportJson = () => {
    const payload = filteredRows.map((row) => ({
      ...row,
      inferred_context: inferContext(row),
      inferred_route: inferRoute(row),
      inferred_severity: inferSeverity(row),
      inferred_status: inferStatus(row),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-error-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Export JSON berhasil");
  };

  const clearLocalRows = () => {
    setHiddenIds(new Set(visibleRows.map((row) => row.id)));
    toast.success("Log lokal pada halaman ini sudah dibersihkan");
  };

  const handleSaveAlertSettings = async () => {
    try {
      setIsSavingAlert(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const existing = await fetchTenantPayrollIntegrations(resolvedTenantId);
      await saveTenantPayrollIntegrations(resolvedTenantId, {
        ...existing.settings,
        errorAlert: {
          enabled: alertEnabled,
          webhookUrl: alertWebhookUrl.trim(),
          slackWebhookUrl: alertSlackUrl.trim(),
          whatsappWebhookUrl: alertWhatsappUrl.trim(),
          emailWebhookUrl: alertEmailWebhookUrl.trim(),
        },
      });
      toast.success("Pengaturan alert realtime tersimpan");
    } catch (error) {
      const ref = reportError(error, "org.payroll.error_log.alert_settings.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan alert payroll", ref));
    } finally {
      setIsSavingAlert(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">Ditunda</Badge>
              <Badge variant="outline">Observabilitas</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Log Error Payroll</h1>
            <p className="text-sm text-muted-foreground">
              Catatan error payroll berdasarkan nomor referensi, konteks, dan rute kejadian.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/org/payroll/audit-log")}>
              Buka Audit Log
            </Button>
            <Button variant="outline" onClick={() => navigate("/org/payroll")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Tahap observabilitas</CardDescription>
              <CardTitle className="text-base">Pantau error aktif lebih cepat</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Halaman ini dipakai saat payroll sudah cukup stabil untuk memusatkan penelusuran error aktif.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Prioritas tindakan</CardDescription>
              <CardTitle className="text-base">Mulai dari error kritis</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Fokus ke tab kritis, salin nomor referensi, lalu cocokkan dengan konteks proses payroll yang terkait.
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardDescription>Langkah berikutnya</CardDescription>
              <CardTitle className="text-base">Lanjut ke audit untuk jejak perubahan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Gunakan audit log saat butuh melihat siapa melakukan perubahan, pada periode mana, dan dari proses yang mana.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/audit-log")}>
                Buka Audit Log
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-yellow-300/80 bg-yellow-50/40">
          <CardContent className="flex flex-wrap gap-2 p-4">
            <Button variant="outline" onClick={() => void fetchRows()} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Muat Ulang
            </Button>
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={handleExportJson}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                toast.success(`Retensi dihitung dari ${summary.total} log error`);
              }}
            >
              Cek Retensi
            </Button>
            <Button variant="destructive" onClick={clearLocalRows}>
              <Trash2 className="mr-2 h-4 w-4" />
              Bersihkan Log Lokal
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              Alert Realtime Kritis
            </CardTitle>
            <CardDescription>
              Simpan endpoint notifikasi untuk error kritis agar triase lebih cepat saat payroll sudah aktif digunakan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Aktifkan alert realtime kritis</p>
                <p className="text-sm text-muted-foreground">
                  Saat aktif, setiap log kritis baru akan mengirim notifikasi ke endpoint yang terisi.
                </p>
              </div>
              <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={alertWebhookUrl}
                onChange={(event) => setAlertWebhookUrl(event.target.value)}
                placeholder="Webhook Umum (https://...)"
              />
              <Input
                value={alertSlackUrl}
                onChange={(event) => setAlertSlackUrl(event.target.value)}
                placeholder="Slack Webhook (https://...)"
              />
              <Input
                value={alertWhatsappUrl}
                onChange={(event) => setAlertWhatsappUrl(event.target.value)}
                placeholder="WhatsApp Webhook (https://...)"
              />
              <Input
                value={alertEmailWebhookUrl}
                onChange={(event) => setAlertEmailWebhookUrl(event.target.value)}
                placeholder="Email Webhook (https://...)"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSaveAlertSettings()} disabled={isSavingAlert}>
                Simpan Pengaturan Alert
              </Button>
              <Button
                variant="outline"
                onClick={() => void loadAlertSettings()}
              >
                Muat Ulang Pengaturan
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Kritis" value={String(summary.criticalOpen)} subtitle="error aktif" />
          <SummaryCard title="Non Kritis" value={String(summary.nonCriticalOpen)} subtitle="warning aktif" />
          <SummaryCard title="Selesai" value={String(summary.done)} subtitle="sudah diselesaikan" />
          <SummaryCard title="Arsip" value={String(summary.archivedCritical + summary.archivedNonCritical)} subtitle={`trace id: ${summary.withTraceCount}`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Error</CardTitle>
            <CardDescription>
              {summary.total} error tercatat • Sumber dari audit payroll. Rentang aktif {TIME_RANGE_LABELS[timeRange]}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant={activeTab === "critical" ? "default" : "outline"} onClick={() => setActiveTab("critical")}>
                Kritis ({summary.criticalOpen})
              </Button>
              <Button variant={activeTab === "non_critical" ? "default" : "outline"} onClick={() => setActiveTab("non_critical")}>
                Non Kritis ({summary.nonCriticalOpen})
              </Button>
              <Button variant={activeTab === "done" ? "default" : "outline"} onClick={() => setActiveTab("done")}>
                Selesai ({summary.done})
              </Button>
              <Button variant={activeTab === "archived_critical" ? "default" : "outline"} onClick={() => setActiveTab("archived_critical")}>
                Arsip Kritis ({summary.archivedCritical})
              </Button>
              <Button variant={activeTab === "archived_non_critical" ? "default" : "outline"} onClick={() => setActiveTab("archived_non_critical")}>
                Arsip Non Kritis ({summary.archivedNonCritical})
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="relative md:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari berdasarkan ref, konteks, pesan, atau route..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <Select value={contextFilter} onValueChange={setContextFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Konteks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Konteks</SelectItem>
                  {contextOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                <SelectTrigger>
                  <SelectValue placeholder="Rentang waktu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 Jam</SelectItem>
                  <SelectItem value="7d">7 Hari</SelectItem>
                  <SelectItem value="30d">30 Hari</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as SeverityFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Tingkat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tingkat</SelectItem>
                  <SelectItem value="error">{SEVERITY_LABELS.error}</SelectItem>
                  <SelectItem value="warning">{SEVERITY_LABELS.warning}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setContextFilter("all");
                  setUserFilter("all");
                  setTenantFilter("all");
                  setSeverityFilter("all");
                  setTimeRange("24h");
                }}
              >
                Reset Semua Filter
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Pengguna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Pengguna</SelectItem>
                  {userOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tenant</SelectItem>
                  {tenantOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input disabled placeholder="Filter cepat: hanya saya, semua tenant saya, dan konteks." />
            </div>

            <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              Auto-refresh dinonaktifkan untuk menjaga performa aplikasi gabungan absensi + HR + payroll.
              Gunakan tombol <span className="font-medium">Refresh</span> saat perlu memuat data terbaru.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Log Error</CardTitle>
            <CardDescription>
              Menampilkan {pageRows.length} dari {filteredRows.length} log (total basis data error: {rows.length}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref Error</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Konteks</TableHead>
                    <TableHead>Aksi</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Memuat log error payroll...
                      </TableCell>
                    </TableRow>
                  ) : pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Tidak ada log error payroll untuk filter ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((row) => {
                      const severity = inferSeverity(row);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={severity === "error" ? "destructive" : "secondary"} className="font-mono">
                                {row.trace_id || row.log_id || row.id.slice(0, 10)}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  void navigator.clipboard.writeText(row.trace_id || row.log_id || row.id);
                                  toast.success("Ref error disalin");
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{formatDateTime(row.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{inferContext(row)}</TableCell>
                          <TableCell className="text-xs">
                            <p className="font-medium">{row.action_label || row.action_type || "-"}</p>
                            <p className="line-clamp-2 text-muted-foreground">{row.notes || row.action_type || "-"}</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{inferRoute(row)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                toast.message(row.notes || row.action_label || row.action_type || "-", {
                                  description: `Trace: ${row.trace_id || "-"} | Log: ${row.log_id || "-"}`,
                                });
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <p>
                Halaman {safePage} dari {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage <= 1}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage >= totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <OrgPayrollPageGuide pathname="/org/payroll/error-log" />
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
