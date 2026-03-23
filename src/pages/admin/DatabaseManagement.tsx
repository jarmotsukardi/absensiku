import { useState, useEffect, useCallback, useMemo } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { 
  Database, 
  Table2, 
  Users, 
  Building2, 
  MapPin, 
  Calendar, 
  FileText,
  RefreshCw,
  Download,
  Settings,
  Activity,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

interface TableStats {
  name: string;
  icon: typeof Database;
  count: number;
  description: string;
}

interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

interface AutoFixOffice {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  tenant: {
    name: string;
    code: string;
  } | null;
}

const TABLES_PER_PAGE = 10;
const SETTINGS_PER_PAGE = 10;

export default function DatabaseManagement({ embedded = false }: { embedded?: boolean }) {
  const ADMIN_DATABASE_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_DATABASE_QUERY_RETRY_MAX = 1;
  const [tableStats, setTableStats] = useState<TableStats[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [autoFixOffices, setAutoFixOffices] = useState<AutoFixOffice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isRetrying, setIsRetrying] = useState(false);
  const [tablesPage, setTablesPage] = useState(1);
  const [settingsPage, setSettingsPage] = useState(1);
  const [resolvingOfficeId, setResolvingOfficeId] = useState<string | null>(null);
  const [isResolvingBulk, setIsResolvingBulk] = useState(false);
  const [showReadyOnly, setShowReadyOnly] = useState(false);

  const fetchTableStats = useCallback(async () => {
    setIsLoading(true);
    
    try {
      setIsRetrying(false);
      setLoadError(null);
      const [
        tenantsRes,
        employeesRes,
        officesRes,
        attendanceRes,
        leaveRequestsRes,
        userRolesRes,
        holidaysRes,
        auditLogsRes,
        notificationsRes,
      ] = await Promise.all([
        withExponentialBackoff(
          () => withTimeout(supabase.from('tenants').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.tenants timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('employees').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.employees timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('offices').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.offices timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('attendance_records_partitioned').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.attendance timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('leave_requests').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.leave_requests timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('user_roles').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.user_roles timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('holidays').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.holidays timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('audit_logs').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.audit_logs timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
        withExponentialBackoff(
          () => withTimeout(supabase.from('notifications').select('id', { count: 'exact', head: true }), ADMIN_DATABASE_QUERY_TIMEOUT_MS, "admin.database.fetch_table_stats.notifications timeout"),
          { maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) },
        ),
      ]);

      const responses = [
        tenantsRes,
        employeesRes,
        officesRes,
        attendanceRes,
        leaveRequestsRes,
        userRolesRes,
        holidaysRes,
        auditLogsRes,
        notificationsRes,
      ];
      const firstError = responses.find((res) => res.error)?.error;
      if (firstError) throw firstError;

      setTableStats([
        { name: 'Organisasi (Tenants)', icon: Building2, count: tenantsRes.count || 0, description: 'Daftar organisasi terdaftar' },
        { name: 'Pegawai (Employees)', icon: Users, count: employeesRes.count || 0, description: 'Data pegawai semua organisasi' },
        { name: 'Kantor (Offices)', icon: MapPin, count: officesRes.count || 0, description: 'Lokasi kantor untuk absensi' },
        { name: 'Absensi (Attendance)', icon: Activity, count: attendanceRes.count || 0, description: 'Rekaman absensi pegawai' },
        { name: 'Pengajuan Cuti (Leave)', icon: Calendar, count: leaveRequestsRes.count || 0, description: 'Pengajuan izin dan cuti' },
        { name: 'Role Pengguna', icon: Users, count: userRolesRes.count || 0, description: 'Role dan permission' },
        { name: 'Hari Libur', icon: Calendar, count: holidaysRes.count || 0, description: 'Kalender hari libur' },
        { name: 'Audit Log', icon: FileText, count: auditLogsRes.count || 0, description: 'Catatan aktivitas sistem' },
        { name: 'Notifikasi', icon: Activity, count: notificationsRes.count || 0, description: 'Notifikasi pengguna' },
      ]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.table_stats.fetch");
      const message = appendErrorReference("Gagal memuat statistik database", errorRef);
      setLoadError(message);
      setTableStats([]);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, []);

  const fetchSystemSettings = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from('system_settings')
              .select('*')
              .order('key'),
            ADMIN_DATABASE_QUERY_TIMEOUT_MS,
            "admin.database.fetch_system_settings timeout",
          ),
        {
          maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      if (data) {
        setSystemSettings(data.map(s => ({
          ...s,
          value: typeof s.value === 'string' ? s.value.replace(/"/g, '') : JSON.stringify(s.value),
        })));
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.system_settings.fetch");
      const message = appendErrorReference("Gagal memuat pengaturan sistem", errorRef);
      setLoadError((prev) => prev ?? message);
      setSystemSettings([]);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const fetchAutoFixOffices = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("offices")
              .select("id,name,address,latitude,longitude,updated_at,tenant:tenants(name,code)")
              .or("name.ilike.[AUTO-FIX]%,address.ilike.%autogenerated for data consistency%")
              .order("updated_at", { ascending: false })
              .limit(20),
            ADMIN_DATABASE_QUERY_TIMEOUT_MS,
            "admin.database.fetch_auto_fix_offices timeout",
          ),
        {
          maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      const rows = ((data || []) as unknown as AutoFixOffice[]).map((item) => ({
        id: item.id,
        name: item.name,
        address: item.address,
        latitude: item.latitude,
        longitude: item.longitude,
        updated_at: item.updated_at,
        tenant: item.tenant
          ? { name: item.tenant.name, code: item.tenant.code }
          : null,
      }));

      setAutoFixOffices(rows);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.auto_fix_offices.fetch");
      const message = appendErrorReference("Gagal memuat data auto-fix kantor", errorRef);
      setLoadError((prev) => prev ?? message);
      setAutoFixOffices([]);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const isDefaultCoordinate = (latitude: number | null, longitude: number | null) => {
    if (latitude === null || longitude === null) return true;
    return latitude === 0 && longitude === 0;
  };

  const markAutoFixResolved = async (office: AutoFixOffice) => {
    if (isDefaultCoordinate(office.latitude, office.longitude)) {
      toast.error("Koordinat masih default 0,0. Lengkapi dulu di Master Kantor sebelum tandai selesai.");
      return;
    }

    setResolvingOfficeId(office.id);
    try {
      setIsRetrying(false);
      const cleanedName = office.name.replace(/^\[AUTO-FIX\]\s*/i, "").trim();
      const cleanedAddress = (office.address || "")
        .replace(/\s*\(perlu update koordinat real\)\s*/gi, " ")
        .replace(/Default office autogenerated for data consistency/gi, "")
        .trim();

      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("offices")
              .update({
                name: cleanedName || office.name,
                address: cleanedAddress || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", office.id),
            ADMIN_DATABASE_QUERY_TIMEOUT_MS,
            "admin.database.auto_fix.resolve_one timeout",
          ),
        {
          maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      toast.success("Data auto-fix ditandai selesai.");
      await Promise.all([fetchAutoFixOffices(), fetchTableStats()]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.auto_fix_offices.resolve", { office_id: office.id });
      toast.error(appendErrorReference("Gagal menandai data auto-fix sebagai selesai", errorRef));
    } finally {
      setResolvingOfficeId(null);
      setIsRetrying(false);
    }
  };

  const markAllAutoFixResolved = async () => {
    const validOffices = autoFixOffices.filter(
      (office) => !isDefaultCoordinate(office.latitude, office.longitude)
    );

    if (validOffices.length === 0) {
      toast.error("Belum ada data valid untuk ditandai selesai.");
      return;
    }

    setIsResolvingBulk(true);
    try {
      setIsRetrying(false);
      for (const office of validOffices) {
        const cleanedName = office.name.replace(/^\[AUTO-FIX\]\s*/i, "").trim();
        const cleanedAddress = (office.address || "")
          .replace(/\s*\(perlu update koordinat real\)\s*/gi, " ")
          .replace(/Default office autogenerated for data consistency/gi, "")
          .trim();

        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("offices")
                .update({
                  name: cleanedName || office.name,
                  address: cleanedAddress || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", office.id),
              ADMIN_DATABASE_QUERY_TIMEOUT_MS,
              "admin.database.auto_fix.resolve_bulk_row timeout",
            ),
          {
            maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (error) throw error;
      }

      toast.success(`${validOffices.length} data auto-fix berhasil ditandai selesai.`);
      await Promise.all([fetchAutoFixOffices(), fetchTableStats()]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.auto_fix_offices.resolve_bulk", {
        valid_count: validOffices.length,
      });
      toast.error(appendErrorReference("Gagal menandai data auto-fix secara massal", errorRef));
    } finally {
      setIsResolvingBulk(false);
      setIsRetrying(false);
    }
  };

  const exportAutoFixCsv = () => {
    const rows = visibleAutoFixOffices.map((office) => ({
      tenant_name: office.tenant?.name || "",
      tenant_code: office.tenant?.code || "",
      office_name: office.name,
      address: office.address || "",
      latitude: office.latitude ?? "",
      longitude: office.longitude ?? "",
      status: isDefaultCoordinate(office.latitude, office.longitude)
        ? "Perlu Koordinat Real"
        : "Siap Ditandai",
      updated_at: office.updated_at ? new Date(office.updated_at).toISOString() : "",
    }));

    if (rows.length === 0) {
      toast.error("Tidak ada data untuk diekspor.");
      return;
    }

    const headers = [
      "tenant_name",
      "tenant_code",
      "office_name",
      "address",
      "latitude",
      "longitude",
      "status",
      "updated_at",
    ] as const;

    const escapeCsvValue = (value: string | number) => {
      const raw = String(value ?? "");
      if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };

    const csvLines = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(",")),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const suffix = showReadyOnly ? "ready-only" : "all";
    link.href = url;
    link.download = `auto-fix-offices-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Export Auto-Fix berhasil (${rows.length} baris)`);
  };

  const autoFixSummary = useMemo(() => {
    const ready = autoFixOffices.filter((office) => !isDefaultCoordinate(office.latitude, office.longitude)).length;
    const pending = autoFixOffices.length - ready;
    return { ready, pending };
  }, [autoFixOffices]);

  const visibleAutoFixOffices = useMemo(
    () =>
      showReadyOnly
        ? autoFixOffices.filter((office) => !isDefaultCoordinate(office.latitude, office.longitude))
        : autoFixOffices,
    [autoFixOffices, showReadyOnly]
  );

  useEffect(() => {
    void Promise.all([fetchTableStats(), fetchSystemSettings(), fetchAutoFixOffices()]);
  }, [fetchAutoFixOffices, fetchSystemSettings, fetchTableStats]);

  const updateSystemSetting = async (key: string, value: string) => {
    const jsonValue = isNaN(Number(value)) ? `"${value}"` : value;

    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from('system_settings')
              .update({ value: JSON.parse(jsonValue), updated_at: new Date().toISOString() })
              .eq('key', key),
            ADMIN_DATABASE_QUERY_TIMEOUT_MS,
            "admin.database.update_system_setting timeout",
          ),
        {
          maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      toast.success("Pengaturan berhasil diperbarui");
      await fetchSystemSettings();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.system_settings.update", { key });
      toast.error(appendErrorReference("Gagal memperbarui pengaturan", errorRef));
    } finally {
      setIsRetrying(false);
    }
  };

  const exportTableData = async (tableName: string) => {
    toast.info(`Mengekspor data ${tableName}...`);

    try {
      // Simplified export - in real app would use proper export logic
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from(tableName as 'tenants')
              .select('*')
              .limit(1000),
            ADMIN_DATABASE_QUERY_TIMEOUT_MS,
            "admin.database.export_table timeout",
          ),
        {
          maxRetries: ADMIN_DATABASE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      if (!data) {
        throw new Error(`Data ${tableName} kosong atau tidak tersedia.`);
      }

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Data ${tableName} berhasil diekspor`);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.export_table", { table_name: tableName });
      toast.error(appendErrorReference(`Gagal mengekspor data ${tableName}`, errorRef));
    } finally {
      setIsRetrying(false);
    }
  };

  const tableNameMap: Record<string, string> = {
    'Organisasi (Tenants)': 'tenants',
    'Pegawai (Employees)': 'employees',
    'Kantor (Offices)': 'offices',
    'Absensi (Attendance)': 'attendance_records_partitioned',
    'Pengajuan Cuti (Leave)': 'leave_requests',
    'Role Pengguna': 'user_roles',
    'Hari Libur': 'holidays',
    'Audit Log': 'audit_logs',
    'Notifikasi': 'notifications',
  };
  const tableTotalPages = Math.max(1, Math.ceil(tableStats.length / TABLES_PER_PAGE));
  const tablePageNumbers = Array.from({ length: tableTotalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === tableTotalPages || Math.abs(page - tablesPage) <= 1
  );
  const paginatedTableStats = tableStats.slice(
    (tablesPage - 1) * TABLES_PER_PAGE,
    tablesPage * TABLES_PER_PAGE
  );
  const settingsTotalPages = Math.max(1, Math.ceil(systemSettings.length / SETTINGS_PER_PAGE));
  const settingsPageNumbers = Array.from({ length: settingsTotalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === settingsTotalPages || Math.abs(page - settingsPage) <= 1
  );
  const paginatedSettings = systemSettings.slice(
    (settingsPage - 1) * SETTINGS_PER_PAGE,
    settingsPage * SETTINGS_PER_PAGE
  );

  useEffect(() => {
    setTablesPage(1);
  }, [tableStats.length]);

  useEffect(() => {
    setSettingsPage(1);
  }, [systemSettings.length]);

  const content = (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4 text-sm text-amber-800">
              Sedang mencoba ulang koneksi data database...
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{loadError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void Promise.all([fetchTableStats(), fetchSystemSettings(), fetchAutoFixOffices()]);
                  }}
                >
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <TabsTrigger value="overview" className="whitespace-nowrap">
              <Database className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="tables" className="whitespace-nowrap">
              <Table2 className="h-4 w-4 mr-2" />
              Tabel
            </TabsTrigger>
            <TabsTrigger value="settings" className="whitespace-nowrap">
              <Settings className="h-4 w-4 mr-2" />
              Pengaturan Sistem
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          {autoFixOffices.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-5 w-5" />
                    Data Auto-Fix Kantor ({autoFixOffices.length})
                  </CardTitle>
                  <CardDescription>
                    Data kantor ini dibuat otomatis untuk memperbaiki relasi pegawai. Harap lengkapi nama/alamat/koordinat real.
                  </CardDescription>
                  <div className="mt-2 flex gap-2">
                    <Badge className="bg-green-600 hover:bg-green-600">Siap Ditandai: {autoFixSummary.ready}</Badge>
                    <Badge variant="destructive">Perlu Perbaikan: {autoFixSummary.pending}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportAutoFixCsv}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Auto-Fix CSV
                  </Button>
                  <Button
                    variant={showReadyOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowReadyOnly((prev) => !prev)}
                  >
                    {showReadyOnly ? "Tampilkan Semua" : "Hanya Siap Ditandai"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isResolvingBulk || autoFixOffices.every((office) => isDefaultCoordinate(office.latitude, office.longitude))}
                    onClick={() => {
                      void markAllAutoFixResolved();
                    }}
                  >
                    {isResolvingBulk ? "Memproses..." : "Tandai Selesai Semua yang Valid"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={fetchAutoFixOffices}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => window.location.assign("/admin/master/offices")}>
                    Buka Master Kantor
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organisasi</TableHead>
                      <TableHead>Nama Kantor</TableHead>
                      <TableHead>Alamat</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Koordinat</TableHead>
                      <TableHead>Update Terakhir</TableHead>
                      <TableHead className="w-[160px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAutoFixOffices.map((office) => (
                      <TableRow key={office.id}>
                        <TableCell>
                          <div className="font-medium">{office.tenant?.name || "-"}</div>
                          <div className="text-xs text-muted-foreground">{office.tenant?.code || "-"}</div>
                        </TableCell>
                        <TableCell className="font-medium">{office.name}</TableCell>
                        <TableCell className="text-muted-foreground">{office.address || "-"}</TableCell>
                        <TableCell>
                          {isDefaultCoordinate(office.latitude, office.longitude) ? (
                            <Badge variant="destructive">Perlu Koordinat Real</Badge>
                          ) : (
                            <Badge className="bg-green-600 hover:bg-green-600">Siap Ditandai</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {office.latitude ?? "-"}, {office.longitude ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {office.updated_at ? new Date(office.updated_at).toLocaleString("id-ID") : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resolvingOfficeId === office.id || isDefaultCoordinate(office.latitude, office.longitude)}
                            onClick={() => {
                              void markAutoFixResolved(office);
                            }}
                          >
                            {resolvingOfficeId === office.id ? "Menyimpan..." : "Tandai Selesai"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {visibleAutoFixOffices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                          Tidak ada data yang sesuai filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Database className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">
                      {tableStats.reduce((acc, t) => acc + t.count, 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">Total Record</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Table2 className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{tableStats.length}</p>
                    <p className="text-sm text-muted-foreground">Tabel Aktif</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Settings className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{systemSettings.length}</p>
                    <p className="text-sm text-muted-foreground">Pengaturan</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table Stats Grid */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Statistik Tabel</CardTitle>
                <CardDescription>Ringkasan data di setiap tabel</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchTableStats}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {isLoading ? (
                  Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                  ))
                ) : (
                  tableStats.map((table) => (
                    <Card key={table.name} className="bg-muted/30">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center">
                            <table.icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{table.name}</p>
                            <p className="text-xs text-muted-foreground">{table.description}</p>
                          </div>
                          <Badge variant="secondary" className="text-lg font-bold">
                            {table.count.toLocaleString()}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table2 className="h-5 w-5" />
                Daftar Tabel
              </CardTitle>
              <CardDescription>
                Lihat dan ekspor data dari setiap tabel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Tabel</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="text-right">Jumlah Record</TableHead>
                    <TableHead className="w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTableStats.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <table.icon className="h-4 w-4 text-muted-foreground" />
                          {table.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {table.description}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{table.count.toLocaleString()}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exportTableData(tableNameMap[table.name] || 'tenants')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {tableStats.length > 0 && (
                <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-muted-foreground">
                    Halaman {tablesPage} dari {tableTotalPages}
                  </span>
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            if (tablesPage > 1) {
                              setTablesPage((page) => page - 1);
                            }
                          }}
                          className={tablesPage === 1 ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                      {tablePageNumbers.map((page) => (
                        <PaginationItem key={`table-page-${page}`}>
                          <PaginationLink
                            href="#"
                            isActive={page === tablesPage}
                            onClick={(event) => {
                              event.preventDefault();
                              setTablesPage(page);
                            }}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            if (tablesPage < tableTotalPages) {
                              setTablesPage((page) => page + 1);
                            }
                          }}
                          className={tablesPage === tableTotalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Pengaturan Sistem
              </CardTitle>
              <CardDescription>
                Konfigurasi global aplikasi
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunci</TableHead>
                    <TableHead>Nilai</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSettings.map((setting) => (
                    <TableRow key={setting.id}>
                      <TableCell className="font-mono text-sm">
                        {setting.key}
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={setting.value}
                          className="max-w-[200px]"
                          onBlur={(e) => {
                            if (e.target.value !== setting.value) {
                              updateSystemSetting(setting.key, e.target.value);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {setting.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          Editable
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {systemSettings.length > 0 && (
                <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-muted-foreground">
                    Halaman {settingsPage} dari {settingsTotalPages}
                  </span>
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            if (settingsPage > 1) {
                              setSettingsPage((page) => page - 1);
                            }
                          }}
                          className={settingsPage === 1 ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                      {settingsPageNumbers.map((page) => (
                        <PaginationItem key={`settings-page-${page}`}>
                          <PaginationLink
                            href="#"
                            isActive={page === settingsPage}
                            onClick={(event) => {
                              event.preventDefault();
                              setSettingsPage(page);
                            }}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            if (settingsPage < settingsTotalPages) {
                              setSettingsPage((page) => page + 1);
                            }
                          }}
                          className={settingsPage === settingsTotalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PageGlossarySection preset="admin_database_management" />
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <SuperAdminLayout
      title="Manajemen Database"
      subtitle="Kelola dan monitor database sistem"
    >
      {content}
    </SuperAdminLayout>
  );
}
