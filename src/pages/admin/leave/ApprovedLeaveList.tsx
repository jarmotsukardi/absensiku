import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, Calendar, Download, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Enums, Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

type LeaveRequest = Tables<"leave_requests">;
type Employee = Tables<"employees">;
type LeaveType = Enums<"leave_type">;
type LeaveRequestWithEmployee = LeaveRequest & { employee?: Employee | null };
const ADMIN_APPROVED_LEAVE_READ_TIMEOUT_MS = 12000;
const ADMIN_APPROVED_LEAVE_MAX_RETRIES = 2;

export default function ApprovedLeaveList() {
  const ITEMS_PER_PAGE = 15;
  const [requests, setRequests] = useState<LeaveRequestWithEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsRetrying(false);
      setLoadError(null);
      
      let query = supabase
        .from("leave_requests")
        .select("*, employee:employees!leave_requests_employee_id_fkey(*)")
        .eq("status", "disetujui")
        .order("start_date", { ascending: false });

      if (typeFilter !== "all") {
        query = query.eq("leave_type", typeFilter as LeaveType);
      }

      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            query,
            ADMIN_APPROVED_LEAVE_READ_TIMEOUT_MS,
            "Permintaan daftar izin/cuti disetujui timeout."
          ),
        {
          maxRetries: ADMIN_APPROVED_LEAVE_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setRequests((data as LeaveRequestWithEmployee[]) || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.leave.approved.fetch", { leave_type: typeFilter });
      const message = appendErrorReference("Gagal memuat data izin/cuti disetujui", errorRef);
      setLoadError(message);
      toast.error(message);
      setRequests([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleExport = () => {
    toast.info("Fitur export ke Excel akan segera tersedia");
  };

  const getLeaveTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      izin: "Izin",
      cuti_tahunan: "Cuti Tahunan",
      cuti_penting: "Cuti Penting",
      cuti_lainnya: "Cuti Lainnya",
      sakit: "Sakit",
      tugas_luar: "Tugas Luar",
    };
    return types[type] || type;
  };

  const filteredRequests = requests.filter((req) =>
    req.employee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Izin/Cuti</h1>
            <p className="text-muted-foreground">
              Daftar izin dan cuti yang disetujui
            </p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Ekspor Excel
          </Button>
        </div>

        {isRetrying && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat daftar izin/cuti...
          </div>
        )}

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              Coba Lagi
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daftar Izin/Cuti Disetujui
            </CardTitle>
            <CardDescription>
              Total {filteredRequests.length} izin/cuti disetujui
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau alasan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  <SelectItem value="izin">Izin</SelectItem>
                  <SelectItem value="cuti_tahunan">Cuti Tahunan</SelectItem>
                  <SelectItem value="cuti_penting">Cuti Penting</SelectItem>
                  <SelectItem value="cuti_lainnya">Cuti Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Tanggal Mulai</TableHead>
                    <TableHead>Tanggal Selesai</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Alasan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : paginatedRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Tidak ada data izin/cuti
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRequests.map((req, index) => {
                      const startDate = new Date(req.start_date);
                      const endDate = new Date(req.end_date);
                      const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                      
                      return (
                        <TableRow key={req.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {req.employee?.name || "-"}
                        </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{getLeaveTypeLabel(req.leave_type)}</Badge>
                          </TableCell>
                          <TableCell>
                            {format(startDate, "dd MMM yyyy", { locale: localeId })}
                          </TableCell>
                          <TableCell>
                            {format(endDate, "dd MMM yyyy", { locale: localeId })}
                          </TableCell>
                          <TableCell>{duration} hari</TableCell>
                          <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage((p) => p - 1);
                        }}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                            isActive={currentPage === page}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage((p) => p + 1);
                        }}
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
