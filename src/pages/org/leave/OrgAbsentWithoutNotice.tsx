import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileWarning, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { LeaveRequestTabs } from "@/components/org/leave/LeaveRequestTabs";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

type AttendanceRecord = Tables<"attendance_records_partitioned">;
type EmployeeSummary = {
  id: string;
  name: string;
  nip: string | null;
  opd: { code: string } | null;
};
type AbsentRecord = AttendanceRecord & {
  employees: EmployeeSummary | null;
};

export default function OrgAbsentWithoutNotice() {
  const ITEMS_PER_PAGE = 15;
  const ABSENT_WITHOUT_NOTICE_QUERY_TIMEOUT_MS = 15000;
  const ABSENT_WITHOUT_NOTICE_QUERY_RETRY_MAX = 1;
  const [records, setRecords] = useState<AbsentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initializeTenant = useCallback(async () => {
    try {
      const resolvedTenantId = await withTimeout(
        resolveOrgTenantId(),
        ABSENT_WITHOUT_NOTICE_QUERY_TIMEOUT_MS,
        "org.absent_without_notice.resolve_tenant timeout",
      );
      setTenantId(resolvedTenantId);
      setLoadError(null);
    } catch (error) {
      const errorRef = reportError(error, "org.absent_without_notice.resolve_tenant");
      setLoadError(appendErrorReference("Gagal menentukan tenant organisasi", errorRef));
      setTenantId(null);
    }
  }, []);

  useEffect(() => {
    void initializeTenant();
  }, [initializeTenant]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      if (!tenantId) {
        setRecords([]);
        return;
      }
      const employeeIds = await withExponentialBackoff(
        () =>
          withTimeout(
            getTenantEmployeeIds(tenantId),
            ABSENT_WITHOUT_NOTICE_QUERY_TIMEOUT_MS,
            "org.absent_without_notice.fetch.employee_ids timeout",
          ),
        {
          maxRetries: ABSENT_WITHOUT_NOTICE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (employeeIds.length === 0) {
        setRecords([]);
        return;
      }

      // Fetch dari tabel partitioned - tanpa join karena partitioned table
      const { data: attendanceData, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("attendance_records_partitioned")
              .select("*")
              .in("employee_id", employeeIds)
              .eq("status", "tidak_hadir")
              .order("date", { ascending: false }),
            ABSENT_WITHOUT_NOTICE_QUERY_TIMEOUT_MS,
            "org.absent_without_notice.fetch.attendance timeout",
          ),
        {
          maxRetries: ABSENT_WITHOUT_NOTICE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      // Fetch employees data untuk join manual
      const matchedEmployeeIds = [...new Set((attendanceData || []).map((record) => record.employee_id))];
      const { data: employeesData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("id, name, nip, opd(code)")
              .in("id", matchedEmployeeIds),
            ABSENT_WITHOUT_NOTICE_QUERY_TIMEOUT_MS,
            "org.absent_without_notice.fetch.employees timeout",
          ),
        {
          maxRetries: ABSENT_WITHOUT_NOTICE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      // Manual join
      const recordsWithEmployee: AbsentRecord[] = (attendanceData || []).map((record) => ({
        ...record,
        employees: (employeesData?.find((employee) => employee.id === record.employee_id) || null) as EmployeeSummary | null,
      }));

      setRecords(recordsWithEmployee);
    } catch (error) {
      const errorRef = reportError(error, "org.absent_without_notice.fetch", { tenant_id: tenantId });
      const message = appendErrorReference("Gagal memuat data tanpa keterangan", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId === undefined) return;
    if (tenantId === null) {
      setIsLoading(false);
      return;
    }
    void fetchData();
  }, [tenantId, fetchData]);

  const handleRetryLoad = async () => {
    await initializeTenant();
    if (tenantId) {
      await fetchData();
    }
  };

  const filteredRecords = records.filter((record) =>
    (record.employees?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE));
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileWarning className="h-6 w-6" />
              Tanpa Keterangan
            </h1>
            <p className="text-muted-foreground">Kelola data ketidakhadiran tanpa keterangan</p>
          </div>
          <Button variant="outline" onClick={() => toast.info("Fitur export akan segera tersedia")}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
        <LeaveRequestTabs />

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center justify-between gap-3 pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button size="sm" variant="outline" onClick={handleRetryLoad} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                Coba Lagi
              </Button>
            </CardContent>
          </Card>
        )}
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sedang mencoba ulang koneksi data...
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Tanpa Keterangan</CardTitle>
            <CardDescription>Total {filteredRecords.length} data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Pegawai</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>OPD</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div></TableCell></TableRow>
                ) : paginatedRecords.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                ) : (
                  paginatedRecords.map((record, index) => (
                    <TableRow key={record.id}>
                      <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell>{format(new Date(record.date), "d MMM yyyy", { locale: id })}</TableCell>
                      <TableCell>{record.employees?.name}</TableCell>
                      <TableCell className="font-mono text-sm">{record.employees?.nip || "-"}</TableCell>
                      <TableCell>{record.employees?.opd?.code || "-"}</TableCell>
                      <TableCell>{record.notes || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {currentPage} dari {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Berikutnya
              </Button>
            </div>
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_leave_requests" />
      </div>
    </OrganizationLayout>
  );
}
