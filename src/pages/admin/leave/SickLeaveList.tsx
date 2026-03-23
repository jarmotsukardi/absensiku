import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Search, HeartPulse, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
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
type LeaveRequestWithEmployee = LeaveRequest & { employee?: Employee | null };
const ADMIN_SICK_LEAVE_READ_TIMEOUT_MS = 12000;
const ADMIN_SICK_LEAVE_MAX_RETRIES = 2;

export default function SickLeaveList() {
  const ITEMS_PER_PAGE = 15;
  const [requests, setRequests] = useState<LeaveRequestWithEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsRetrying(false);
      setLoadError(null);
      
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("leave_requests")
              .select("*, employee:employees!leave_requests_employee_id_fkey(*)")
              .eq("leave_type", "sakit")
              .order("created_at", { ascending: false }),
            ADMIN_SICK_LEAVE_READ_TIMEOUT_MS,
            "Permintaan data izin sakit timeout."
          ),
        {
          maxRetries: ADMIN_SICK_LEAVE_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setRequests((data as LeaveRequestWithEmployee[]) || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.leave.sick.fetch");
      const message = appendErrorReference("Gagal memuat data izin sakit", errorRef);
      setLoadError(message);
      toast.error(message);
      setRequests([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleExport = () => {
    toast.info("Fitur export ke Excel akan segera tersedia");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">Menunggu</Badge>;
      case "disetujui":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500">Disetujui</Badge>;
      case "ditolak":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500">Ditolak</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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
  }, [searchTerm]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Sakit</h1>
            <p className="text-muted-foreground">
              Daftar izin sakit pegawai
            </p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Ekspor Excel
          </Button>
        </div>

        {isRetrying && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat data izin sakit...
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
              <HeartPulse className="h-5 w-5" />
              Daftar Izin Sakit
            </CardTitle>
            <CardDescription>
              Total {filteredRequests.length} data sakit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau keterangan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Tanggal Mulai</TableHead>
                    <TableHead>Tanggal Selesai</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Status</TableHead>
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
                        Tidak ada data sakit
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
                            {format(startDate, "dd MMM yyyy", { locale: localeId })}
                          </TableCell>
                          <TableCell>
                            {format(endDate, "dd MMM yyyy", { locale: localeId })}
                          </TableCell>
                          <TableCell>{duration} hari</TableCell>
                          <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                          <TableCell>{getStatusBadge(req.status || "menunggu")}</TableCell>
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
