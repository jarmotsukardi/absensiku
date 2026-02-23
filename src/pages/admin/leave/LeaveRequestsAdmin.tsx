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
import { Search, FileText, Check, X, Filter } from "lucide-react";
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
type RequestStatus = Enums<"request_status">;
type LeaveRequestWithEmployee = LeaveRequest & { employee?: Employee | null };
const ADMIN_LEAVE_REQUESTS_READ_TIMEOUT_MS = 12000;
const ADMIN_LEAVE_REQUESTS_WRITE_TIMEOUT_MS = 15000;
const ADMIN_LEAVE_REQUESTS_MAX_RETRIES = 2;

export default function LeaveRequestsAdmin() {
  const ITEMS_PER_PAGE = 15;
  const [requests, setRequests] = useState<LeaveRequestWithEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("menunggu");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsRetrying(false);
      setLoadError(null);
      
      let query = supabase
        .from("leave_requests")
        .select("*, employee:employees!leave_requests_employee_id_fkey(*)") 
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as RequestStatus);
      }

      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            query,
            ADMIN_LEAVE_REQUESTS_READ_TIMEOUT_MS,
            "Permintaan data permohonan cuti timeout."
          ),
        {
          maxRetries: ADMIN_LEAVE_REQUESTS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setRequests((data as LeaveRequestWithEmployee[]) || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.leave-requests.fetch", {
        status_filter: statusFilter,
      });
      const message = appendErrorReference("Gagal memuat data", errorRef);
      setLoadError(message);
      setRequests([]);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const getCurrentEmployeeId = useCallback(async () => {
    const {
      data: { user },
      error: authError,
    } = await withTimeout(
      supabase.auth.getUser(),
      ADMIN_LEAVE_REQUESTS_WRITE_TIMEOUT_MS,
      "Permintaan user auth timeout."
    );
    if (authError) throw authError;
    if (!user) throw new Error("Sesi login tidak valid. Silakan login ulang.");

    const { data: currentEmployee, error: employeeError } = await withTimeout(
      supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single(),
      ADMIN_LEAVE_REQUESTS_WRITE_TIMEOUT_MS,
      "Permintaan profil pegawai timeout."
    );
    if (employeeError) throw employeeError;
    return currentEmployee?.id ?? null;
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const currentEmployeeId = await getCurrentEmployeeId();

      const { error } = await withTimeout(
        supabase
          .from("leave_requests")
          .update({ 
            status: "disetujui", 
            approved_by: currentEmployeeId,
            approved_at: new Date().toISOString()
          })
          .eq("id", id),
        ADMIN_LEAVE_REQUESTS_WRITE_TIMEOUT_MS,
        "Persetujuan permohonan cuti timeout."
      );

      if (error) throw error;
      toast.success("Permohonan cuti disetujui");
      await fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.leave-requests.approve", { request_id: id });
      toast.error(appendErrorReference("Gagal menyetujui permohonan", errorRef));
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Masukkan alasan penolakan:");
    if (!reason) return;

    try {
      const { error } = await withTimeout(
        supabase
          .from("leave_requests")
          .update({ 
            status: "ditolak", 
            rejection_reason: reason 
          })
          .eq("id", id),
        ADMIN_LEAVE_REQUESTS_WRITE_TIMEOUT_MS,
        "Penolakan permohonan cuti timeout."
      );

      if (error) throw error;
      toast.success("Permohonan cuti ditolak");
      await fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.leave-requests.reject", { request_id: id });
      toast.error(appendErrorReference("Gagal menolak permohonan", errorRef));
    }
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
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
  );
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Permohonan Cuti</h1>
          <p className="text-muted-foreground">
            Kelola permohonan cuti dan izin pegawai
          </p>
        </div>

        {isRetrying && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat data permohonan...
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
              <FileText className="h-5 w-5" />
              Daftar Permohonan
            </CardTitle>
            <CardDescription>
              Total {filteredRequests.length} permohonan
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="menunggu">Menunggu</SelectItem>
                  <SelectItem value="disetujui">Disetujui</SelectItem>
                  <SelectItem value="ditolak">Ditolak</SelectItem>
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
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32 text-right">Aksi</TableHead>
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
                        Tidak ada permohonan
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRequests.map((req, index) => (
                      <TableRow key={req.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {req.employee?.name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getLeaveTypeLabel(req.leave_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(req.start_date), "dd MMM yyyy", { locale: localeId })} - {format(new Date(req.end_date), "dd MMM yyyy", { locale: localeId })}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                        <TableCell>{getStatusBadge(req.status || "menunggu")}</TableCell>
                        <TableCell className="text-right">
                          {req.status === "menunggu" && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-green-500 hover:text-green-600"
                                onClick={() => handleApprove(req.id)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => handleReject(req.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!isLoading && filteredRequests.length > 0 && totalPages > 1 && (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (currentPage > 1) {
                            setCurrentPage((page) => page - 1);
                          }
                        }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {pageNumbers.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          isActive={page === currentPage}
                          onClick={(event) => {
                            event.preventDefault();
                            setCurrentPage(page);
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
                          if (currentPage < totalPages) {
                            setCurrentPage((page) => page + 1);
                          }
                        }}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
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
