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
  const [records, setRecords] = useState<AbsentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const initTenant = async () => {
      try {
        setTenantId(await resolveOrgTenantId());
      } catch (error) {
        const errorRef = reportError(error, "org.absent_without_notice.resolve_tenant");
        setLoadError(appendErrorReference("Gagal menentukan tenant organisasi", errorRef));
        setTenantId(null);
      }
    };
    void initTenant();
  }, []);

  const fetchData = useCallback(async () => {
    setLoadError(null);
    try {
      if (!tenantId) {
        setRecords([]);
        return;
      }
      const employeeIds = await getTenantEmployeeIds(tenantId);
      if (employeeIds.length === 0) {
        setRecords([]);
        return;
      }

      // Fetch dari tabel partitioned - tanpa join karena partitioned table
      const { data: attendanceData, error } = await supabase
        .from("attendance_records_partitioned")
        .select("*")
        .in("employee_id", employeeIds)
        .eq("status", "tidak_hadir")
        .order("date", { ascending: false });

      if (error) throw error;

      // Fetch employees data untuk join manual
      const matchedEmployeeIds = [...new Set((attendanceData || []).map((record) => record.employee_id))];
      const { data: employeesData } = await supabase
        .from("employees")
        .select("id, name, nip, opd(code)")
        .in("id", matchedEmployeeIds);

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
            <p className="text-muted-foreground">Daftar ketidakhadiran tanpa keterangan</p>
          </div>
          <Button variant="outline" onClick={() => toast.info("Fitur export akan segera tersedia")}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Absen Tanpa Keterangan</CardTitle>
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
