import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  FileText, 
  Search,
  UserPlus,
  Settings,
  XCircle,
  Activity,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { id } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { toast } from "sonner";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface AuditLog {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  employee: {
    name: string;
    email: string;
  } | null;
  tenant: {
    name: string;
  } | null;
}

const actionIcons: Record<string, typeof Activity> = {
  INSERT: UserPlus,
  UPDATE: Settings,
  DELETE: XCircle,
};

const actionLabels: Record<string, { label: string; color: string }> = {
  INSERT: { label: "Create", color: "bg-green-500" },
  UPDATE: { label: "Update", color: "bg-blue-500" },
  DELETE: { label: "Delete", color: "bg-red-500" },
};

const tableLabels: Record<string, string> = {
  system_settings: "Pengaturan Sistem",
  tenants: "Organisasi",
  employees: "Pegawai",
  subscriptions: "Langganan",
  leave_requests: "Pengajuan Cuti",
  attendance_records: "Absensi",
  attendance_records_partitioned: "Absensi",
  offices: "Kantor",
  holidays: "Hari Libur",
  user_roles: "User Role",
  work_hours: "Jam Kerja",
  opd: "OPD",
  work_units: "Satuan Kerja",
};

const ITEMS_PER_PAGE = 20;

// Buat opsi bulan untuk 12 bulan terakhir
const getMonthOptions = () => {
  const options = [];
  for (let i = 0; i < 12; i++) {
    const date = subMonths(new Date(), i);
    options.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy", { locale: id }),
    });
  }
  return options;
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [tableFilter, setTableFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const monthOptions = getMonthOptions();

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Parse month filter
      const [year, month] = monthFilter.split("-").map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      const escapedQuery = searchQuery.trim().replace(/[%_]/g, "\\$&");
      const isUuidQuery = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        escapedQuery
      );
      const searchParts = [
        `action.ilike.%${escapedQuery}%`,
        `table_name.ilike.%${escapedQuery}%`,
        `ip_address.ilike.%${escapedQuery}%`,
      ];
      if (isUuidQuery) {
        searchParts.push(`record_id.eq.${escapedQuery}`);
      }

      let countQuery = supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (actionFilter !== "all") {
        countQuery = countQuery.eq("action", actionFilter);
      }

      if (tableFilter !== "all") {
        countQuery = countQuery.eq("table_name", tableFilter);
      }

      if (escapedQuery) {
        countQuery = countQuery.or(searchParts.join(","));
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const safeCount = count || 0;
      setTotalCount(safeCount);

      // Fetch paginated data
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let dataQuery = supabase
        .from("audit_logs")
        .select(`
          *,
          employee:employees!audit_logs_employee_id_fkey(name, email),
          tenant:tenants!audit_logs_tenant_id_fkey(name)
        `)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false })
        .range(from, to);

      if (actionFilter !== "all") {
        dataQuery = dataQuery.eq("action", actionFilter);
      }

      if (tableFilter !== "all") {
        dataQuery = dataQuery.eq("table_name", tableFilter);
      }

      if (escapedQuery) {
        dataQuery = dataQuery.or(searchParts.join(","));
      }

      const { data, error } = await dataQuery;

      if (error) throw error;
      setLogs((data as unknown as AuditLog[]) || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.audit_logs.fetch", {
        month_filter: monthFilter,
        action_filter: actionFilter,
        table_filter: tableFilter,
        search: searchQuery,
        page: currentPage,
      });
      const message = appendErrorReference("Gagal memuat audit log", errorRef);
      toast.error(message);
      setLoadError(message);
      setLogs([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [monthFilter, currentPage, actionFilter, tableFilter, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, actionFilter, tableFilter, monthFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const pageStart = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const visiblePages = Array.from({ length: Math.min(3, totalPages) }, (_, idx) => pageStart + idx).filter(
    (page) => page <= totalPages
  );
  const isFaqSyncQuickFilterActive = actionFilter === "UPDATE" && tableFilter === "system_settings";

  const applyFaqSyncQuickFilter = () => {
    setActionFilter("UPDATE");
    setTableFilter("system_settings");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const resetQuickFilter = () => {
    setActionFilter("all");
    setTableFilter("all");
    setSearchQuery("");
    setCurrentPage(1);
  };

  return (
    <SuperAdminLayout title="Audit Log" subtitle="Riwayat aktivitas sistem">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari aktivitas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Bulan" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Action</SelectItem>
                  <SelectItem value="INSERT">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Table" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Table</SelectItem>
                  {Object.entries(tableLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchLogs} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={isFaqSyncQuickFilterActive ? "default" : "outline"}
                onClick={applyFaqSyncQuickFilter}
              >
                Filter Cepat: FAQ Sync
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetQuickFilter}>
                Reset Filter Cepat
              </Button>
              <span className="text-xs text-muted-foreground">
                Menampilkan jejak perubahan FAQ di `system_settings` (action update).
              </span>
            </div>
          </CardContent>
        </Card>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/* Logs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Log Aktivitas
                </CardTitle>
                <CardDescription>
                  {totalCount} aktivitas pada {monthOptions.find(m => m.value === monthFilter)?.label}
                </CardDescription>
              </div>
              <span className="text-sm text-muted-foreground">
                Halaman {currentPage} / {totalPages}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-start gap-4 animate-pulse">
                    <div className="h-10 w-10 rounded-full bg-muted"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-64"></div>
                      <div className="h-3 bg-muted rounded w-40"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Tidak ada log ditemukan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => {
                  const Icon = actionIcons[log.action] || Activity;
                  const actionStyle = actionLabels[log.action];
                  
                  return (
                    <div key={log.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className={`p-2 rounded-full ${actionStyle?.color || 'bg-gray-500'}`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium">
                              {log.employee?.name || "System"}
                              <span className="text-muted-foreground font-normal">
                                {" "}melakukan {actionStyle?.label || log.action} pada{" "}
                              </span>
                              <Badge variant="outline" className="ml-1">
                                {tableLabels[log.table_name] || log.table_name}
                              </Badge>
                            </div>
                            {log.tenant && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Organisasi: {log.tenant.name}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-sm text-muted-foreground whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: id })}
                            </div>
                          </div>
                        </div>
                        {log.ip_address && (
                          <p className="text-xs text-muted-foreground mt-2">
                            IP: {log.ip_address}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-6 pt-4 border-t">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className={currentPage === 1 || isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {visiblePages.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === currentPage}
                          onClick={() => setCurrentPage(page)}
                          className={isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages || isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="admin_audit_logs" />
      </div>
    </SuperAdminLayout>
  );
}
