import { useState, useEffect } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";
import { formatToTimezone } from "@/lib/timezone";
import { History, Search, Filter, Plus, Pencil, Trash2, User, Calendar, Loader2, RefreshCw } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: any;
  new_values: any;
  created_at: string;
  employee: {
    name: string;
  } | null;
}

const actionLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  INSERT: { label: "Tambah", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: Plus },
  UPDATE: { label: "Ubah", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Pencil },
  DELETE: { label: "Hapus", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: Trash2 },
};

const tableLabels: Record<string, string> = {
  employees: "Pegawai",
  offices: "Lokasi Kantor",
  attendance_records: "Absensi",
  leave_requests: "Cuti/Izin",
  wfh_requests: "WFH",
  holidays: "Hari Libur",
  opd: "OPD",
  positions: "Jabatan",
  work_units: "Satuan Kerja",
  work_hours: "Jam Kerja",
  work_holidays: "Libur Kerja",
  employee_invitations: "Undangan",
  news: "Berita",
};

const ITEMS_PER_PAGE = 20;

export default function OrgAuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchLogs();
  }, [currentPage]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get tenant_id
      const { data: employee } = await supabase
        .from("employees")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!employee?.tenant_id) return;

      // Get count
      const { count } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", employee.tenant_id);

      setTotalCount(count || 0);

      // Get paginated logs
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          id,
          action,
          table_name,
          record_id,
          old_values,
          new_values,
          created_at,
          employee:employee_id(name)
        `)
        .eq("tenant_id", employee.tenant_id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.employee?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tableLabels[log.table_name]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.table_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    const matchesTable = tableFilter === "all" || log.table_name === tableFilter;
    
    return matchesSearch && matchesAction && matchesTable;
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const getChangeSummary = (log: AuditLog): string => {
    if (log.action === "DELETE") {
      return "Data dihapus";
    }
    if (log.action === "INSERT") {
      if (log.new_values?.name) return `Menambah: ${log.new_values.name}`;
      if (log.new_values?.email) return `Menambah: ${log.new_values.email}`;
      return "Data baru ditambahkan";
    }
    if (log.action === "UPDATE" && log.old_values && log.new_values) {
      const changedFields: string[] = [];
      for (const key of Object.keys(log.new_values)) {
        if (log.old_values[key] !== log.new_values[key] && !['updated_at', 'created_at'].includes(key)) {
          changedFields.push(key);
        }
      }
      if (changedFields.length > 0) {
        return `Field diubah: ${changedFields.slice(0, 3).join(", ")}${changedFields.length > 3 ? "..." : ""}`;
      }
    }
    return "-";
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6" />
              Log Aktivitas
            </h1>
            <p className="text-muted-foreground">Riwayat perubahan data di organisasi Anda</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari berdasarkan nama atau tabel..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Aksi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Aksi</SelectItem>
                  <SelectItem value="INSERT">Tambah</SelectItem>
                  <SelectItem value="UPDATE">Ubah</SelectItem>
                  <SelectItem value="DELETE">Hapus</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tabel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tabel</SelectItem>
                  {Object.entries(tableLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs List */}
        <Card>
          <CardHeader>
            <CardTitle>Riwayat Aktivitas</CardTitle>
            <CardDescription>
              Menampilkan {filteredLogs.length} dari {totalCount} log
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Belum ada log aktivitas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLogs.map((log) => {
                  const action = actionLabels[log.action] || actionLabels.UPDATE;
                  const ActionIcon = action.icon;
                  
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className={`p-2 rounded-full ${action.color}`}>
                        <ActionIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">
                            {tableLabels[log.table_name] || log.table_name}
                          </Badge>
                          <span className="text-sm font-medium">{action.label}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getChangeSummary(log)}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {log.employee?.name || "Sistem"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatToTimezone(new Date(log.created_at), "Asia/Jakarta", "dd MMM yyyy HH:mm")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i + 1;
                      if (totalPages > 5) {
                        if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                      }
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
