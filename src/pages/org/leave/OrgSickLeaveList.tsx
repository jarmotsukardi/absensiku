import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, HeartPulse, Download } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { id } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";

type SickLeaveRequest = Tables<"leave_requests"> & {
  employees: {
    name: string;
    nip: string | null;
  } | null;
};

export default function OrgSickLeaveList() {
  const ITEMS_PER_PAGE = 15;
  const [requests, setRequests] = useState<SickLeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);

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
        setRequests([]);
        return;
      }
      const employeeIds = await getTenantEmployeeIds(tenantId);
      if (employeeIds.length === 0) {
        setRequests([]);
        return;
      }

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, employees!leave_requests_employee_id_fkey(name, nip)")
        .in("employee_id", employeeIds)
        .eq("leave_type", "sakit")
        .order("start_date", { ascending: false });

      if (error) throw error;
      setRequests((data || []) as SickLeaveRequest[]);
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

  const filteredRequests = requests.filter(req =>
    (req.employees?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
  const paginatedRequests = filteredRequests.slice(
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
              <HeartPulse className="h-6 w-6" />
              Data Sakit
            </h1>
            <p className="text-muted-foreground">Daftar permohonan sakit pegawai</p>
          </div>
          <Button variant="outline" onClick={() => toast.info("Fitur export akan segera tersedia")}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Sakit</CardTitle>
            <CardDescription>Total {filteredRequests.length} data</CardDescription>
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
                  <TableHead>Pegawai</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div></TableCell></TableRow>
                ) : paginatedRequests.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                ) : (
                  paginatedRequests.map((req, i) => (
                    <TableRow key={req.id}>
                      <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                      <TableCell>{req.employees?.name}</TableCell>
                      <TableCell>{format(new Date(req.start_date), "d MMM yyyy", { locale: id })}</TableCell>
                      <TableCell>{format(new Date(req.end_date), "d MMM yyyy", { locale: id })}</TableCell>
                      <TableCell>{differenceInDays(new Date(req.end_date), new Date(req.start_date)) + 1} hari</TableCell>
                      <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                      <TableCell>{req.status}</TableCell>
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
      </div>
    </OrganizationLayout>
  );
}
