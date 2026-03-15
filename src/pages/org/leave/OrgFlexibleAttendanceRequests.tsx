import { useCallback, useEffect, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, MapPinOff, Check, X, Clock, CheckCircle2, XCircle, Loader2, Car, Users, MapPin, Briefcase, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { logAuditIfEnabled } from "@/lib/auditLoggingPolicy";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { LeaveRequestTabs } from "@/components/org/leave/LeaveRequestTabs";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

// Mapping ikon untuk jenis alasan
const REASON_ICONS: Record<string, React.ElementType> = {
  dinas_luar: Car,
  rapat_eksternal: Users,
  kunjungan_lapangan: MapPin,
  tugas_pimpinan: Briefcase,
  kegiatan_instansi: Building2,
};

const REASON_LABELS: Record<string, string> = {
  dinas_luar: "Dinas Luar",
  rapat_eksternal: "Rapat Eksternal",
  kunjungan_lapangan: "Kunjungan Lapangan",
  tugas_pimpinan: "Tugas Pimpinan",
  kegiatan_instansi: "Kegiatan Instansi",
};

interface FlexibleRequest {
  id: string;
  employee_id: string;
  request_date: string;
  reason_type: string;
  reason: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  employee?: {
    name: string;
    nip: string | null;
    email: string;
    opd?: { code: string; name: string } | null;
  };
}

const ITEMS_PER_PAGE = 10;

export default function OrgFlexibleAttendanceRequests() {
  const FLEXIBLE_REQUESTS_QUERY_TIMEOUT_MS = 15000;
  const FLEXIBLE_REQUESTS_QUERY_RETRY_MAX = 1;
  const [requests, setRequests] = useState<FlexibleRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("menunggu");
  const [currentPage, setCurrentPage] = useState(1);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Dialog state
  const [selectedRequest, setSelectedRequest] = useState<FlexibleRequest | null>(null);
  const [dialogMode, setDialogMode] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch tenant_id from current user
  const initializeTenant = useCallback(async () => {
    try {
      const resolved = await withTimeout(
        resolveOrgTenantId(),
        FLEXIBLE_REQUESTS_QUERY_TIMEOUT_MS,
        "org.flexible_requests.resolve_tenant timeout",
      );
      setTenantId(resolved);
      setLoadError(null);
    } catch {
      const errorRef = reportError(new Error("Tenant organisasi tidak dapat ditentukan"), "org.flexible_requests.resolve_tenant");
      const message = appendErrorReference("Gagal menentukan tenant organisasi", errorRef);
      toast.error(message);
      setLoadError(message);
      setTenantId(null);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void initializeTenant();
  }, [initializeTenant]);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      let query = supabase
        .from("flexible_attendance_requests")
        .select(`
          *,
          employee:employees!flexible_attendance_requests_employee_id_fkey(
            name, nip, email,
            opd:opd_id(code, name)
          )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            query,
            FLEXIBLE_REQUESTS_QUERY_TIMEOUT_MS,
            "org.flexible_requests.fetch_data.query timeout",
          ),
        {
          maxRetries: FLEXIBLE_REQUESTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      setRequests((data || []) as FlexibleRequest[]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.flexible_requests.fetch_data", {
        tenant_id: tenantId,
        status_filter: statusFilter,
      });
      const message = appendErrorReference("Gagal memuat data permohonan", errorRef);
      toast.error(message);
      setLoadError(message);
      setRequests([]);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [statusFilter, tenantId]);

  useEffect(() => {
    if (tenantId) {
      void fetchData();
      return;
    }
    if (tenantId === null) {
      setIsLoading(false);
    }
  }, [tenantId, fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleApprove = async () => {
    if (!selectedRequest) return;
    setIsProcessing(true);

    try {
      // Get current user's employee id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User tidak ditemukan");

      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single();

      // Update request status
      const { error } = await supabase
        .from("flexible_attendance_requests")
        .update({
          status: "disetujui",
          approved_by: empData?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      await logAuditIfEnabled({
        tenantId,
        payload: {
          tenant_id: tenantId,
          employee_id: selectedRequest.employee_id,
          user_id: user.id,
          table_name: "flexible_attendance_requests",
          action: "flexible_attendance_approved",
          record_id: selectedRequest.id,
          old_values: {
            status: selectedRequest.status,
            request_date: selectedRequest.request_date,
            reason_type: selectedRequest.reason_type,
          },
          new_values: {
            status: "disetujui",
            request_date: selectedRequest.request_date,
            reason_type: selectedRequest.reason_type,
            approved_by: empData?.id || null,
          },
        },
      });

      // Optional: Update employee's allow_flexible_attendance flag for that date
      // This could be handled via a separate approval mechanism

      toast.success("Permohonan berhasil disetujui");
      setDialogMode(null);
      setSelectedRequest(null);
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.flexible_requests.approve", {
        request_id: selectedRequest.id,
      });
      const errorMessage = error instanceof Error ? error.message : "Gagal menyetujui permohonan";
      toast.error(appendErrorReference(errorMessage, errorRef));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!rejectionReason.trim()) {
      toast.error("Masukkan alasan penolakan");
      return;
    }

    setIsProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User tidak ditemukan");

      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single();

      const { error } = await supabase
        .from("flexible_attendance_requests")
        .update({
          status: "ditolak",
          approved_by: empData?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason.trim(),
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      await logAuditIfEnabled({
        tenantId,
        payload: {
          tenant_id: tenantId,
          employee_id: selectedRequest.employee_id,
          user_id: user.id,
          table_name: "flexible_attendance_requests",
          action: "flexible_attendance_rejected",
          record_id: selectedRequest.id,
          old_values: {
            status: selectedRequest.status,
            request_date: selectedRequest.request_date,
            reason_type: selectedRequest.reason_type,
          },
          new_values: {
            status: "ditolak",
            request_date: selectedRequest.request_date,
            reason_type: selectedRequest.reason_type,
            approved_by: empData?.id || null,
            rejection_reason: rejectionReason.trim(),
          },
        },
      });

      toast.success("Permohonan berhasil ditolak");
      setDialogMode(null);
      setSelectedRequest(null);
      setRejectionReason("");
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.flexible_requests.reject", {
        request_id: selectedRequest.id,
      });
      const errorMessage = error instanceof Error ? error.message : "Gagal menolak permohonan";
      toast.error(appendErrorReference(errorMessage, errorRef));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryLoad = async () => {
    await initializeTenant();
    if (tenantId) {
      await fetchData();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-300">
            <Clock className="h-3 w-3 mr-1" />
            Menunggu
          </Badge>
        );
      case "disetujui":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Disetujui
          </Badge>
        );
      case "ditolak":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-300">
            <XCircle className="h-3 w-3 mr-1" />
            Ditolak
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredRequests = requests.filter(req =>
    req.employee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.employee?.nip?.includes(searchTerm) ||
    req.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPinOff className="h-6 w-6" />
            Absensi Khusus
          </h1>
          <p className="text-muted-foreground">
            Kelola data permohonan absensi khusus pegawai
          </p>
        </div>
        <LeaveRequestTabs />

        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button size="sm" variant="outline" onClick={handleRetryLoad} className="border-destructive/30 text-destructive hover:bg-destructive/10">
              Coba Lagi
            </Button>
          </div>
        )}
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sedang mencoba ulang koneksi data...
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Absensi Khusus</CardTitle>
            <CardDescription>
              {filteredRequests.length} permohonan ditemukan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, NIP, atau alasan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="menunggu">Menunggu</SelectItem>
                  <SelectItem value="disetujui">Disetujui</SelectItem>
                  <SelectItem value="ditolak">Ditolak</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : paginatedRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Tidak ada permohonan
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRequests.map((req, index) => {
                      const Icon = REASON_ICONS[req.reason_type] || MapPinOff;
                      return (
                        <TableRow key={req.id}>
                          <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{req.employee?.name}</div>
                            <div className="text-xs text-muted-foreground">{req.employee?.nip}</div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(req.request_date), "dd MMM yyyy", { locale: localeId })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{REASON_LABELS[req.reason_type] || req.reason_type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="text-sm truncate">{req.reason}</p>
                          </TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell className="text-right">
                            {req.status === "menunggu" && (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setDialogMode("approve");
                                  }}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setDialogMode("reject");
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
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
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
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

        {/* Approve Dialog */}
        <Dialog open={dialogMode === "approve"} onOpenChange={() => { setDialogMode(null); setSelectedRequest(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Setujui Permohonan</DialogTitle>
              <DialogDescription>
                Apakah Anda yakin ingin menyetujui permohonan absensi khusus ini?
              </DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-3 py-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="font-medium">{selectedRequest.employee?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Tanggal: {format(new Date(selectedRequest.request_date), "EEEE, dd MMMM yyyy", { locale: localeId })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Jenis: {REASON_LABELS[selectedRequest.reason_type]}
                  </p>
                  <p className="text-sm">{selectedRequest.reason}</p>
                </div>
              </div>
            )}
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Pastikan detail permohonan sudah diverifikasi sebelum disetujui.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setDialogMode(null)} disabled={isProcessing}>
                  Batal
                </Button>
                <Button onClick={handleApprove} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Setujui
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={dialogMode === "reject"} onOpenChange={() => { setDialogMode(null); setSelectedRequest(null); setRejectionReason(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tolak Permohonan</DialogTitle>
              <DialogDescription>
                Masukkan alasan penolakan permohonan absensi khusus ini.
              </DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4 py-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="font-medium">{selectedRequest.employee?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Tanggal: {format(new Date(selectedRequest.request_date), "dd MMMM yyyy", { locale: localeId })}
                  </p>
                  <p className="text-sm">{selectedRequest.reason}</p>
                </div>
                <div className="space-y-2">
                  <Label>Alasan Penolakan *</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Jelaskan alasan penolakan..."
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Isi alasan penolakan agar pegawai dapat melakukan perbaikan.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setDialogMode(null)} disabled={isProcessing}>
                  Batal
                </Button>
                <Button onClick={handleReject} disabled={isProcessing || !rejectionReason.trim()} variant="destructive">
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                  Tolak
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PageGlossarySection preset="org_leave_requests" />
      </div>
    </OrganizationLayout>
  );
}
