import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  DEFAULT_ORG_WORKSPACE_MODULES,
  ORG_WORKSPACE_MODULES_SETTING_KEY,
  parseOrgWorkspaceModulesSetting,
  type OrgWorkspaceModules,
} from "@/lib/orgWorkspaceModules";
import { HR_ERROR_ALERT_SETTINGS_KEY, type HrErrorAlertSettings } from "@/lib/hrErrorAlertSettings";

type TenantRow = {
  id: string;
  name: string;
  code: string;
  is_active: boolean | null;
  created_at?: string | null;
};

type SettingRow = {
  tenant_id: string | null;
  setting_key: string;
  setting_value: unknown;
};

type AggregatedTenant = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  modules: OrgWorkspaceModules;
  employeeCount: number;
  contractCount: number;
  openTicketCount: number;
  criticalErrorCount: number;
  lastHrActivityAt: string | null;
  hasRealtimeAlerts: boolean;
};

const DEFAULT_ALERT_SETTINGS: HrErrorAlertSettings = {
  enableRealtimeAlerts: false,
  webhookUrl: "",
  slackWebhookUrl: "",
  whatsappWebhookUrl: "",
  emailWebhookUrl: "",
};

const normalizeAlertSettings = (value: unknown): HrErrorAlertSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_ALERT_SETTINGS;
  const raw = value as Record<string, unknown>;
  return {
    enableRealtimeAlerts: Boolean(raw.enable_realtime_alerts),
    webhookUrl: typeof raw.webhook_url === "string" ? raw.webhook_url.trim() : "",
    slackWebhookUrl: typeof raw.slack_webhook_url === "string" ? raw.slack_webhook_url.trim() : "",
    whatsappWebhookUrl: typeof raw.whatsapp_webhook_url === "string" ? raw.whatsapp_webhook_url.trim() : "",
    emailWebhookUrl: typeof raw.email_webhook_url === "string" ? raw.email_webhook_url.trim() : "",
  };
};

const isHrError = (row: { context: string | null; route: string | null }) => {
  const context = (row.context || "").toLowerCase();
  const route = (row.route || "").toLowerCase();
  return context.startsWith("org.hr.") || route.includes("/org/hr");
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const byLatestActivity = (a: AggregatedTenant, b: AggregatedTenant) => {
  const left = a.lastHrActivityAt ? new Date(a.lastHrActivityAt).getTime() : 0;
  const right = b.lastHrActivityAt ? new Date(b.lastHrActivityAt).getTime() : 0;
  return right - left;
};

const PAGE_SIZE = 15;

export default function AdminHRTenants() {
  const [rows, setRows] = useState<AggregatedTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tenantsRes, settingsRes, employeesRes, contractsRes, ticketsRes, errorsRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, name, code, is_active, created_at")
          .order("name", { ascending: true })
          .limit(500),
        supabase
          .from("organization_settings")
          .select("tenant_id, setting_key, setting_value")
          .in("setting_key", [ORG_WORKSPACE_MODULES_SETTING_KEY, HR_ERROR_ALERT_SETTINGS_KEY])
          .limit(2000),
        supabase.from("employees").select("tenant_id").eq("is_active", true).limit(10000),
        supabase.from("hr_contracts").select("tenant_id").limit(10000),
        supabase
          .from("feedback_reports")
          .select("tenant_id, created_at, status, feedback_type, reporter_role")
          .eq("feedback_type", "ticket")
          .eq("reporter_role", "admin_organisasi")
          .limit(10000),
        supabase
          .from("client_error_logs")
          .select("tenant_id, occurred_at, context, route, is_non_critical, is_resolved, is_archived")
          .order("occurred_at", { ascending: false })
          .limit(5000),
      ]);

      if (tenantsRes.error) throw tenantsRes.error;
      if (settingsRes.error) throw settingsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (contractsRes.error) throw contractsRes.error;
      if (ticketsRes.error) throw ticketsRes.error;
      if (errorsRes.error) throw errorsRes.error;

      const tenantRows = (tenantsRes.data || []) as TenantRow[];
      const settingRows = (settingsRes.data || []) as SettingRow[];
      const employeeRows = (employeesRes.data || []) as Array<{ tenant_id: string | null }>;
      const contractRows = (contractsRes.data || []) as Array<{ tenant_id: string | null }>;
      const ticketRows = (ticketsRes.data || []) as Array<{ tenant_id: string | null; created_at: string | null; status: string | null }>;
      const errorRows = ((errorsRes.data || []) as Array<{
        tenant_id: string | null;
        occurred_at: string | null;
        context: string | null;
        route: string | null;
        is_non_critical: boolean;
        is_resolved: boolean;
        is_archived: boolean;
      }>).filter(isHrError);

      const settingsByTenant = new Map<string, { modules: OrgWorkspaceModules; alerts: HrErrorAlertSettings }>();
      settingRows.forEach((setting) => {
        if (!setting.tenant_id) return;
        const current = settingsByTenant.get(setting.tenant_id) || {
          modules: DEFAULT_ORG_WORKSPACE_MODULES,
          alerts: DEFAULT_ALERT_SETTINGS,
        };

        if (setting.setting_key === ORG_WORKSPACE_MODULES_SETTING_KEY) {
          current.modules = parseOrgWorkspaceModulesSetting(setting.setting_value);
        }
        if (setting.setting_key === HR_ERROR_ALERT_SETTINGS_KEY) {
          current.alerts = normalizeAlertSettings(setting.setting_value);
        }
        settingsByTenant.set(setting.tenant_id, current);
      });

      const employeeCountMap = new Map<string, number>();
      employeeRows.forEach((row) => {
        if (!row.tenant_id) return;
        employeeCountMap.set(row.tenant_id, (employeeCountMap.get(row.tenant_id) || 0) + 1);
      });

      const contractCountMap = new Map<string, number>();
      contractRows.forEach((row) => {
        if (!row.tenant_id) return;
        contractCountMap.set(row.tenant_id, (contractCountMap.get(row.tenant_id) || 0) + 1);
      });

      const openTicketMap = new Map<string, number>();
      const lastTicketMap = new Map<string, string>();
      ticketRows.forEach((row) => {
        if (!row.tenant_id) return;
        if (row.status !== "resolved") {
          openTicketMap.set(row.tenant_id, (openTicketMap.get(row.tenant_id) || 0) + 1);
        }
        if (row.created_at) {
          const currentLatest = lastTicketMap.get(row.tenant_id);
          if (!currentLatest || new Date(row.created_at).getTime() > new Date(currentLatest).getTime()) {
            lastTicketMap.set(row.tenant_id, row.created_at);
          }
        }
      });

      const criticalErrorMap = new Map<string, number>();
      const lastErrorMap = new Map<string, string>();
      errorRows.forEach((row) => {
        if (!row.tenant_id) return;
        if (!row.is_non_critical && !row.is_resolved && !row.is_archived) {
          criticalErrorMap.set(row.tenant_id, (criticalErrorMap.get(row.tenant_id) || 0) + 1);
        }
        if (row.occurred_at) {
          const currentLatest = lastErrorMap.get(row.tenant_id);
          if (!currentLatest || new Date(row.occurred_at).getTime() > new Date(currentLatest).getTime()) {
            lastErrorMap.set(row.tenant_id, row.occurred_at);
          }
        }
      });

      const nextRows = tenantRows.map((tenant) => {
        const settings = settingsByTenant.get(tenant.id) || {
          modules: DEFAULT_ORG_WORKSPACE_MODULES,
          alerts: DEFAULT_ALERT_SETTINGS,
        };
        const lastTicketAt = lastTicketMap.get(tenant.id) || null;
        const lastErrorAt = lastErrorMap.get(tenant.id) || null;
        const lastHrActivityAt =
          lastTicketAt && lastErrorAt
            ? new Date(lastTicketAt).getTime() > new Date(lastErrorAt).getTime()
              ? lastTicketAt
              : lastErrorAt
            : lastTicketAt || lastErrorAt;

        return {
          id: tenant.id,
          name: tenant.name,
          code: tenant.code,
          isActive: tenant.is_active ?? false,
          modules: settings.modules,
          employeeCount: employeeCountMap.get(tenant.id) || 0,
          contractCount: contractCountMap.get(tenant.id) || 0,
          openTicketCount: openTicketMap.get(tenant.id) || 0,
          criticalErrorCount: criticalErrorMap.get(tenant.id) || 0,
          lastHrActivityAt,
          hasRealtimeAlerts: settings.alerts.enableRealtimeAlerts,
        };
      });

      setRows(nextRows.sort(byLatestActivity));
      setLastUpdatedAt(new Date());
    } catch (error) {
      const ref = reportError(error, "admin.hr.tenants.load");
      toast.error(appendErrorReference("Gagal memuat ringkasan tenant HR", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      `${row.name} ${row.code} ${row.id}`.toLowerCase().includes(keyword),
    );
  }, [rows, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(from, from + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const summary = useMemo(() => ({
    total: rows.length,
    hrEnabled: rows.filter((row) => row.modules.hr).length,
    realtimeAlerts: rows.filter((row) => row.hasRealtimeAlerts).length,
    criticalIssues: rows.filter((row) => row.criticalErrorCount > 0).length,
  }), [rows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <AdminHRPageShell
      title="Tenant HR"
      subtitle="Kontrol tenant modul HR"
      description="Pantau tenant yang mengaktifkan HR, alert bawaan, volume data inti, dan sinyal risiko dari tiket serta error kritis."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Ringkasan ini menggabungkan status area kerja, alert HR, data pegawai/kontrak, tiket terbuka, dan error kritis.
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memuat data..." : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Cari nama, kode, atau id tenant..."
                className="w-[280px] pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Muat Ulang
            </Button>
            <Button asChild size="sm">
              <Link to="/admin/hr/settings#workspace-tenant">Buka Pengaturan Tenant</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard title="Total Tenant" value={summary.total} note="Tenant yang terdaftar di sistem." />
          <MetricCard title="HR Aktif" value={summary.hrEnabled} note="Tenant dengan area kerja HR aktif." />
          <MetricCard title="Alert Realtime" value={summary.realtimeAlerts} note="Tenant yang menyalakan alert error HR." />
          <MetricCard title="Perlu Perhatian" value={summary.criticalIssues} note="Tenant dengan error kritis terbuka." />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Tenant HR</CardTitle>
            <CardDescription>
              {filteredRows.length} tenant cocok dengan filter saat ini. Prioritaskan tenant dengan error kritis atau tiket terbuka.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Area Kerja HR</TableHead>
                    <TableHead>Alert HR</TableHead>
                    <TableHead>Pegawai Aktif</TableHead>
                    <TableHead>Kontrak</TableHead>
                    <TableHead>Tiket Terbuka</TableHead>
                    <TableHead>Error Kritis</TableHead>
                    <TableHead>Aktivitas HR Terakhir</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                        Memuat tenant HR...
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                        Tidak ada tenant yang cocok dengan pencarian ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.code} • {row.id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.modules.hr ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}
                        </TableCell>
                        <TableCell>
                          {row.hasRealtimeAlerts ? <Badge variant="secondary">Realtime Aktif</Badge> : <Badge variant="outline">Manual</Badge>}
                        </TableCell>
                        <TableCell>{row.employeeCount}</TableCell>
                        <TableCell>{row.contractCount}</TableCell>
                        <TableCell>{row.openTicketCount}</TableCell>
                        <TableCell>
                          {row.criticalErrorCount > 0 ? <Badge variant="destructive">{row.criticalErrorCount}</Badge> : <Badge variant="outline">0</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{formatDateTime(row.lastHrActivityAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link to={`/admin/hr/error-logs?tenant=${row.id}`}>Log Error</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link to="/admin/hr/settings#workspace-tenant">Pengaturan</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <TablePaginationFooter
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={filteredRows.length}
              pageSize={PAGE_SIZE}
              itemLabel="tenant"
              onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            />
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}

function MetricCard({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
