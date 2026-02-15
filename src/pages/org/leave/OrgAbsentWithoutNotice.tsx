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
  const [records, setRecords] = useState<AbsentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const initTenant = async () => {
      try {
        setTenantId(await resolveOrgTenantId());
      } catch {
        setTenantId(null);
      }
    };
    void initTenant();
  }, []);

  const fetchData = useCallback(async () => {
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
      toast.error("Gagal memuat data");
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
                ) : filteredRecords.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                ) : (
                  filteredRecords.map((record, index) => (
                    <TableRow key={record.id}>
                      <TableCell>{index + 1}</TableCell>
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
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
