import { useState, useEffect, useCallback } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Activity
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

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
const TABLES_PER_PAGE = 10;
const SETTINGS_PER_PAGE = 10;

export default function DatabaseManagement({ embedded = false }: { embedded?: boolean }) {
  const [tableStats, setTableStats] = useState<TableStats[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [tablesPage, setTablesPage] = useState(1);
  const [settingsPage, setSettingsPage] = useState(1);

  const fetchTableStats = useCallback(async () => {
    setIsLoading(true);
    
    try {
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
        supabase.from('tenants').select('id', { count: 'exact', head: true }),
        supabase.from('employees').select('id', { count: 'exact', head: true }),
        supabase.from('offices').select('id', { count: 'exact', head: true }),
        supabase.from('attendance_records_partitioned').select('id', { count: 'exact', head: true }),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('holidays').select('id', { count: 'exact', head: true }),
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
        supabase.from('notifications').select('id', { count: 'exact', head: true }),
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
    }
  }, []);

  const fetchSystemSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('key');

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
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchTableStats(), fetchSystemSettings()]);
  }, [fetchSystemSettings, fetchTableStats]);

  const updateSystemSetting = async (key: string, value: string) => {
    const jsonValue = isNaN(Number(value)) ? `"${value}"` : value;

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: JSON.parse(jsonValue), updated_at: new Date().toISOString() })
        .eq('key', key);

      if (error) throw error;
      toast.success("Pengaturan berhasil diperbarui");
      await fetchSystemSettings();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.database.system_settings.update", { key });
      toast.error(appendErrorReference("Gagal memperbarui pengaturan", errorRef));
    }
  };

  const exportTableData = async (tableName: string) => {
    toast.info(`Mengekspor data ${tableName}...`);

    try {
      // Simplified export - in real app would use proper export logic
      const { data, error } = await supabase
        .from(tableName as 'tenants')
        .select('*')
        .limit(1000);

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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {loadError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              {loadError}
            </CardContent>
          </Card>
        )}
        <TabsList>
          <TabsTrigger value="overview">
            <Database className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tables">
            <Table2 className="h-4 w-4 mr-2" />
            Tabel
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Pengaturan Sistem
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
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
