import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, ClipboardList, Check, X, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, isBefore, startOfDay } from "date-fns";
import { id } from "date-fns/locale";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";

type RequestStatus = Enums<"request_status">;
type LeaveRequest = Tables<"leave_requests"> & {
  employees: {
    name: string;
    nip: string | null;
    opd: { code: string } | null;
  } | null;
};

export default function OrgLeaveRequests() {
  const PAGE_SIZE = 20;
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [expiredRequests, setExpiredRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("menunggu");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const initTenant = async () => {
      try {
        const resolved = await resolveOrgTenantId();
        setTenantId(resolved);
        setLoadError(null);
      } catch (error) {
        const errorRef = reportError(error, "org.leave_requests.resolve_tenant");
        const message = appendErrorReference("Gagal menentukan tenant organisasi", errorRef);
        setLoadError(message);
        toast.error(message);
        setTenantId(null);
      }
    };
    void initTenant();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoadError(null);
      if (!tenantId) {
        setRequests([]);
        setExpiredRequests([]);
        setTotalCount(0);
        return;
      }

      const employeeIds = await getTenantEmployeeIds(tenantId);
      if (employeeIds.length === 0) {
        setRequests([]);
        setExpiredRequests([]);
        return;
      }

      // Auto-expire: mark pending requests past start_date as expired
      const today = format(new Date(), "yyyy-MM-dd");
      await supabase
        .from("leave_requests")
        .update({
          status: "ditolak" as RequestStatus,
          rejection_reason: "Otomatis kedaluwarsa (melewati tanggal mulai)",
        })
        .in("employee_id", employeeIds)
        .eq("status", "menunggu")
        .lt("start_date", today);

      let query = supabase
        .from("leave_requests")
        .select("*, employees!leave_requests_employee_id_fkey(name, nip, opd(code))", { count: "exact" })
        .in("employee_id", employeeIds)
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as RequestStatus);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalCount(count || 0);
      
      // Separate expired ones
      const expired = (data || []).filter(
        (r) => r.status === "ditolak" && r.rejection_reason?.includes("kedaluwarsa")
      );
      setExpiredRequests(expired as LeaveRequest[]);
      setRequests((data || []) as LeaveRequest[]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.leave_requests.fetch_data", {
        tenant_id: tenantId,
        status: statusFilter,
        page: currentPage,
      });
      const message = appendErrorReference("Gagal memuat data permohonan cuti", errorRef);
      setLoadError(message);
      toast.error(message);
      setRequests([]);
      setExpiredRequests([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, statusFilter, tenantId]);

  useEffect(() => {
    if (tenantId === undefined) return;
    if (tenantId === null) {
      setIsLoading(false);
      return;
    }
    void fetchData();
  }, [fetchData, tenantId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleApprove = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user?.id)
        .single();

      const { error } = await supabase
        .from("leave_requests")
        .update({ 
          status: "disetujui", 
          approved_by: empData?.id,
          approved_at: new Date().toISOString() 
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Permohonan disetujui");
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.leave_requests.approve", { request_id: id, tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyetujui permohonan", errorRef));
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Alasan penolakan:");
    if (!reason) return;

    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status: "ditolak", rejection_reason: reason })
        .eq("id", id);

      if (error) throw error;
      toast.success("Permohonan ditolak");
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.leave_requests.reject", { request_id: id, tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menolak permohonan", errorRef));
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return <Badge variant="secondary">Menunggu</Badge>;
      case "disetujui":
        return <Badge variant="default">Disetujui</Badge>;
      case "ditolak":
        return <Badge variant="destructive">Ditolak</Badge>;
      case "kedaluwarsa":
        return <Badge variant="outline" className="text-amber-600 border-amber-300">Kedaluwarsa</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredRequests = requests.filter(req =>
    (req.employees?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Permohonan Cuti
          </h1>
          <p className="text-muted-foreground">Kelola permohonan izin dan cuti pegawai</p>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Permohonan</CardTitle>
            <CardDescription>Total {totalCount} permohonan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari permohonan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
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

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pegawai</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Tidak ada permohonan
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{req.employees?.name}</div>
                          <div className="text-xs text-muted-foreground">{req.employees?.nip}</div>
                        </div>
                      </TableCell>
                      <TableCell>{getLeaveTypeLabel(req.leave_type)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(req.start_date), "d MMM", { locale: id })} - {format(new Date(req.end_date), "d MMM yyyy", { locale: id })}
                        </div>
                      </TableCell>
                      <TableCell>{differenceInDays(new Date(req.end_date), new Date(req.start_date)) + 1} hari</TableCell>
                      <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                      <TableCell>{getStatusBadge(req.status)}</TableCell>
                      <TableCell className="text-right">
                        {req.status === "menunggu" && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleApprove(req.id)}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleReject(req.id)}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage((prev) => prev - 1);
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
                          if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
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

        <PageGlossarySection preset="org_leave_requests" />
      </div>
    </OrganizationLayout>
  );
}
