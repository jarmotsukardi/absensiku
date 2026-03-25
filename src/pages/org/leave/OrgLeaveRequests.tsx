import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
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
import { Search, ClipboardList, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, isBefore, startOfDay } from "date-fns";
import { id } from "date-fns/locale";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  LEAVE_REQUEST_CATEGORY_OPTIONS,
  type LeaveRequestCategory,
  getLeaveRequestPresentation,
} from "@/lib/leaveRequestPresentation";
import {
  getApprovalRoleLabel,
  getApprovalTypeLabel,
  type HrApprovalHistoryEntry,
} from "@/lib/hrApprovalWorkflow";
import { processLeaveApprovalStep, processLeaveRejection } from "@/lib/leaveApprovalActions";
import { formatLeaveDayAmount } from "@/lib/hrLeaveTypes";
import {
  EARLY_LEAVE_PERMISSION_REASON_PREFIX,
  LATE_PERMISSION_REASON_PREFIX,
  isAutoCanceledLatePermissionRejectionReason,
} from "@/lib/latePermissionRequest";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { LeaveRequestTabs } from "@/components/org/leave/LeaveRequestTabs";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { OrgHRPageGuide } from "@/components/org/hr/OrgHRPageGuide";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { getOrgLeavePageContext } from "@/lib/orgLeavePageContext";

type RequestStatus = Enums<"request_status">;
type DisplayRequestStatus = RequestStatus | "kedaluwarsa" | "unknown";
type LeaveRequest = Tables<"leave_requests"> & {
  employees: {
    name: string;
    nip: string | null;
    opd: { code: string } | null;
  } | null;
  leave_type_id?: string | null;
  leave_type_meta?: {
    leave_name: string;
    request_type: Enums<"leave_type">;
    approval_type_code: string;
    max_days_per_year: number | null;
  } | null;
  approval_type_code?: string | null;
  current_approval_level?: number | null;
  required_approval_levels?: number | null;
  approval_history?: HrApprovalHistoryEntry[] | null;
  document_reference_number?: string | null;
  document_reference_date?: string | null;
  document_reference_issuer?: string | null;
  document_reference_notes?: string | null;
};

const getDisplayRequestStatus = (request: Pick<LeaveRequest, "status" | "start_date">): DisplayRequestStatus => {
  if (!request.status) return "unknown";
  if (request.status !== "menunggu") return request.status;

  const requestStart = startOfDay(new Date(request.start_date));
  const today = startOfDay(new Date());
  if (isBefore(requestStart, today)) return "kedaluwarsa";

  return "menunggu";
};

export default function OrgLeaveRequests() {
  const location = useLocation();
  const PAGE_SIZE = 20;
  const FETCH_CHUNK = 500;
  const LEAVE_REQUEST_QUERY_TIMEOUT_MS = 15000;
  const LEAVE_REQUEST_QUERY_RETRY_MAX = 1;
  const pageContext = getOrgLeavePageContext(location.pathname);
  const isHrContext = pageContext.hrCapabilityPath !== null;
  const { access: hrAccess, isLoading: isLoadingHrAccess } = useHrPageAccess(pageContext.hrCapabilityPath || "");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("menunggu");
  const [requestCategoryFilter, setRequestCategoryFilter] = useState<LeaveRequestCategory>("all");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetRequestId, setRejectTargetRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const initializeTenant = useCallback(async () => {
    try {
      const resolved = await withTimeout(
        resolveOrgTenantId(),
        LEAVE_REQUEST_QUERY_TIMEOUT_MS,
        "org.leave_requests.resolve_tenant timeout",
      );
      setTenantId(resolved);
      setLoadError(null);
    } catch (error) {
      const errorRef = reportError(error, "org.leave_requests.resolve_tenant");
      const message = appendErrorReference("Gagal menentukan tenant organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
      setTenantId(null);
    }
  }, []);

  useEffect(() => {
    void initializeTenant();
  }, [initializeTenant]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      if (!tenantId) {
        setRequests([]);
        return;
      }

      const employeeIds = await withExponentialBackoff(
        () =>
          withTimeout(
            getTenantEmployeeIds(tenantId),
            LEAVE_REQUEST_QUERY_TIMEOUT_MS,
            "org.leave_requests.fetch.employee_ids timeout",
          ),
        {
          maxRetries: LEAVE_REQUEST_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (employeeIds.length === 0) {
        setRequests([]);
        return;
      }

      const allRows: LeaveRequest[] = [];
      let offset = 0;
      const today = format(new Date(), "yyyy-MM-dd");

      while (true) {
        let query = supabase
          .from("leave_requests")
          .select(
            "*, employees!leave_requests_employee_id_fkey(name, nip, opd(code)), leave_type_meta:leave_type_id(leave_name, request_type, approval_type_code, max_days_per_year)",
          )
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: false })
          .range(offset, offset + FETCH_CHUNK - 1);

        if (statusFilter === "kedaluwarsa") {
          query = query
            .eq("status", "menunggu")
            .lt("start_date", today);
        } else if (statusFilter === "menunggu") {
          query = query
            .eq("status", "menunggu")
            .gte("start_date", today);
        } else if (statusFilter !== "all") {
          query = query.eq("status", statusFilter as RequestStatus);
        }

        if (requestCategoryFilter === "late_permission") {
          query = query
            .eq("leave_type", "izin")
            .like("reason", `${LATE_PERMISSION_REASON_PREFIX}%`);
        } else if (requestCategoryFilter === "early_leave_permission") {
          query = query
            .eq("leave_type", "izin")
            .like("reason", `${EARLY_LEAVE_PERMISSION_REASON_PREFIX}%`);
        } else if (requestCategoryFilter === "regular") {
          query = query
            .not("reason", "like", `${LATE_PERMISSION_REASON_PREFIX}%`)
            .not("reason", "like", `${EARLY_LEAVE_PERMISSION_REASON_PREFIX}%`);
        }

        const { data, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              query,
              LEAVE_REQUEST_QUERY_TIMEOUT_MS,
              "org.leave_requests.fetch.query timeout",
            ),
          {
            maxRetries: LEAVE_REQUEST_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (error) throw error;

        const chunk = (data || []) as LeaveRequest[];
        allRows.push(...chunk);

        if (chunk.length < FETCH_CHUNK) break;
        offset += FETCH_CHUNK;
      }

      setRequests(allRows);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.leave_requests.fetch_data", {
        tenant_id: tenantId,
        status: statusFilter,
        request_category: requestCategoryFilter,
      });
      const message = appendErrorReference("Gagal memuat data permohonan cuti", errorRef);
      setLoadError(message);
      toast.error(message);
      setRequests([]);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [requestCategoryFilter, statusFilter, tenantId]);

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
  }, [searchTerm, statusFilter, requestCategoryFilter]);

  const handleApprove = async (id: string) => {
    if (isHrContext && !hrAccess.canApprove) {
      toast.error("Tenant HR sedang dalam mode monitoring hanya-baca. Persetujuan cuti dinonaktifkan.");
      return;
    }

    const targetRequest = requests.find((item) => item.id === id);
    if (!targetRequest) {
      toast.warning("Data permohonan tidak ditemukan. Muat ulang halaman.");
      void fetchData();
      return;
    }

    const targetDisplayStatus = getDisplayRequestStatus(targetRequest);
    if (targetDisplayStatus !== "menunggu") {
      toast.warning("Permohonan sudah tidak berstatus menunggu.");
      void fetchData();
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sesi login tidak ditemukan. Silakan login ulang.");
        return;
      }
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user?.id)
        .single();
      const result = await processLeaveApprovalStep({
        request: targetRequest,
        approverUserId: user.id,
        approverEmployeeId: empData?.id || null,
        tenantId,
      });

      if (!result.updated) {
        toast.warning("Permohonan sudah diproses admin lain. Data disegarkan.");
        void fetchData();
        return;
      }

      if (!result.isFinalApproval) {
        toast.success(
          `Approval level ${result.currentApprovalLevel}/${result.requiredApprovalLevels} tersimpan. Menunggu level berikutnya.`,
        );
        void fetchData();
        return;
      }
      toast.success(
        `Permohonan disetujui pada level ${result.requiredApprovalLevels}/${result.requiredApprovalLevels}`,
      );
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.leave_requests.approve", { request_id: id, tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyetujui permohonan", errorRef));
    }
  };

  const handleOpenRejectDialog = (id: string) => {
    if (isHrContext && !hrAccess.canApprove) {
      toast.error("Tenant HR sedang dalam mode monitoring hanya-baca. Penolakan cuti dinonaktifkan.");
      return;
    }

    const targetRequest = requests.find((item) => item.id === id);
    if (!targetRequest) {
      toast.warning("Data permohonan tidak ditemukan. Muat ulang halaman.");
      void fetchData();
      return;
    }

    const targetDisplayStatus = getDisplayRequestStatus(targetRequest);
    if (targetDisplayStatus !== "menunggu") {
      toast.warning("Permohonan sudah tidak berstatus menunggu.");
      void fetchData();
      return;
    }

    setRejectTargetRequestId(id);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (isHrContext && !hrAccess.canApprove) {
      toast.error("Tenant HR sedang dalam mode monitoring hanya-baca. Penolakan cuti dinonaktifkan.");
      return;
    }

    if (!rejectTargetRequestId) return;
    const targetRequest = requests.find((item) => item.id === rejectTargetRequestId);
    if (!targetRequest) {
      toast.warning("Data permohonan tidak ditemukan. Muat ulang halaman.");
      setRejectDialogOpen(false);
      setRejectTargetRequestId(null);
      void fetchData();
      return;
    }

    const targetDisplayStatus = getDisplayRequestStatus(targetRequest);
    if (targetDisplayStatus !== "menunggu") {
      toast.warning("Permohonan sudah tidak berstatus menunggu.");
      setRejectDialogOpen(false);
      setRejectTargetRequestId(null);
      void fetchData();
      return;
    }

    const reason = rejectionReason.trim();
    if (reason.length < 3) {
      toast.error("Alasan penolakan minimal 3 karakter.");
      return;
    }

    setIsRejecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const result = await processLeaveRejection({
        request: targetRequest,
        approverUserId: user?.id || null,
        rejectionReason: reason,
      });

      if (!result.updated) {
        toast.warning("Permohonan sudah diproses admin lain. Data disegarkan.");
        void fetchData();
        return;
      }
      toast.success("Permohonan ditolak");
      setRejectDialogOpen(false);
      setRejectTargetRequestId(null);
      setRejectionReason("");
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.leave_requests.reject", {
        request_id: rejectTargetRequestId,
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menolak permohonan", errorRef));
    } finally {
      setIsRejecting(false);
    }
  };

  const handleRetryLoad = async () => {
    await initializeTenant();
    if (tenantId) {
      await fetchData();
    }
  };

  const getStatusBadge = (status: DisplayRequestStatus, rejectionReason?: string | null) => {
    switch (status) {
      case "menunggu":
        return <Badge variant="secondary">Menunggu</Badge>;
      case "disetujui":
        return <Badge variant="default">Disetujui</Badge>;
      case "ditolak":
        if (isAutoCanceledLatePermissionRejectionReason(rejectionReason)) {
          return (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
              Batal Otomatis
            </Badge>
          );
        }
        return <Badge variant="destructive">Ditolak</Badge>;
      case "kedaluwarsa":
        return <Badge variant="outline" className="text-amber-600 border-amber-300">Kedaluwarsa</Badge>;
      case "unknown":
        return <Badge variant="outline">Tidak diketahui</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getApprovalProgressText = (request: LeaveRequest) => {
    const current = Math.max(1, Number(request.current_approval_level || 1));
    const required = Math.max(1, Number(request.required_approval_levels || 1));
    if (request.status === "disetujui") return `Selesai pada tahap ${required}/${required}`;
    if (request.status === "ditolak") return `Ditolak pada tahap ${Math.min(current, required)}/${required}`;

    const approvalRole =
      request.approval_history
        ?.slice()
        .reverse()
        .find((entry) => entry.level_order === current)?.approver_role || null;

    if (approvalRole) {
      return `${getApprovalRoleLabel(approvalRole)} • tahap ${Math.min(current, required)}/${required}`;
    }

    return `Tahap ${Math.min(current, required)}/${required}`;
  };

  const filteredRequests = requests.filter((request) => {
    const displayStatus = getDisplayRequestStatus(request);
    if (statusFilter === "kedaluwarsa" && displayStatus !== "kedaluwarsa") return false;
    if (statusFilter === "menunggu" && displayStatus !== "menunggu") return false;
    if (statusFilter === "disetujui" && displayStatus !== "disetujui") return false;
    if (statusFilter === "ditolak" && displayStatus !== "ditolak") return false;

    const searchNeedle = searchTerm.trim().toLowerCase();
    if (!searchNeedle) return true;

    const presentation = getLeaveRequestPresentation({
      leave_type: request.leave_type,
      reason: request.reason,
      leave_type_name: request.leave_type_meta?.leave_name,
    });
    return (
      (request.employees?.name || "").toLowerCase().includes(searchNeedle) ||
      presentation.reasonText.toLowerCase().includes(searchNeedle) ||
      presentation.leaveTypeLabel.toLowerCase().includes(searchNeedle)
    );
  });
  const totalCount = filteredRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const isHrReadonly = isHrContext && !isLoadingHrAccess && !hrAccess.canApprove;

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          {pageContext.badgeLabel ? <Badge variant="outline">{pageContext.badgeLabel}</Badge> : null}
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            {pageContext.title}
          </h1>
          <p className="text-muted-foreground">{pageContext.description}</p>
          {isHrContext ? (
            <p className="text-xs text-muted-foreground">
              Capability halaman:{" "}
              {isLoadingHrAccess
                ? "memverifikasi..."
                : hrAccess.canApprove
                  ? "admin dapat memproses persetujuan"
                  : "monitoring hanya-baca"}
            </p>
          ) : null}
        </div>
        {isHrContext ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Route Terkait HR</CardTitle>
              <CardDescription>
                Gunakan jalur HR ini untuk tetap berada di konteks tenant HR tanpa meloncat kembali ke tab permohonan absensi umum.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {pageContext.hrContextLinks.map((item) => (
                <Button key={item.path} asChild variant="outline" size="sm">
                  <OrgHRContextLink to={item.path}>{item.label}</OrgHRContextLink>
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : (
          <LeaveRequestTabs />
        )}

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
        {isHrReadonly ? (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Tenant HR sedang berada pada mode `Read Only`. Tombol persetujuan dan penolakan dinonaktifkan sampai akses HR kembali editable.
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{pageContext.cardTitle}</CardTitle>
            <CardDescription>Total {totalCount} permohonan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 min-w-[200px] sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={pageContext.searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="menunggu">Menunggu</SelectItem>
                  <SelectItem value="kedaluwarsa">Kedaluwarsa</SelectItem>
                  <SelectItem value="disetujui">Disetujui</SelectItem>
                  <SelectItem value="ditolak">Ditolak</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={requestCategoryFilter}
                onValueChange={(value) => setRequestCategoryFilter(value as LeaveRequestCategory)}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Kategori Permohonan" />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_REQUEST_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
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
                  <TableHead>Alur Approval</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Tidak ada permohonan
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRequests.map((req) => {
                    const presentation = getLeaveRequestPresentation({
                      leave_type: req.leave_type,
                      reason: req.reason,
                      leave_type_name: req.leave_type_meta?.leave_name,
                    });
                    const displayStatus = getDisplayRequestStatus(req);
                    return (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{req.employees?.name}</div>
                            <div className="text-xs text-muted-foreground">{req.employees?.nip}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(presentation.isLatePermission || presentation.isEarlyLeavePermission) ? (
                            <Badge
                              variant="outline"
                              className={
                                presentation.isLatePermission
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-blue-300 bg-blue-50 text-blue-700"
                              }
                            >
                              {presentation.leaveTypeLabel}
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              <div>{presentation.leaveTypeLabel}</div>
                              {req.leave_type_meta?.approval_type_code ? (
                                <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                  {getApprovalTypeLabel(req.leave_type_meta.approval_type_code)}
                                </Badge>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(req.start_date), "d MMM", { locale: id })} - {format(new Date(req.end_date), "d MMM yyyy", { locale: id })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatLeaveDayAmount(req.is_half_day ? 0.5 : differenceInDays(new Date(req.end_date), new Date(req.start_date)) + 1)} hari
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <p className="truncate text-sm">{presentation.reasonText}</p>
                          {req.document_reference_number ? (
                            <p className="text-xs text-muted-foreground">
                              Referensi: {req.document_reference_number}
                              {req.document_reference_issuer ? ` • ${req.document_reference_issuer}` : ""}
                            </p>
                          ) : null}
                          {(presentation.isLatePermission || presentation.isEarlyLeavePermission) && (
                            <p className="text-xs text-muted-foreground">
                              {presentation.detailLabel}: {presentation.detailText ?? "-"}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(displayStatus, req.rejection_reason)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {getApprovalProgressText(req)}
                        </TableCell>
                        <TableCell className="text-right">
                          {displayStatus === "menunggu" && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleApprove(req.id)}
                                disabled={isHrContext && (isLoadingHrAccess || !hrAccess.canApprove)}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenRejectDialog(req.id)}
                                disabled={isHrContext && (isLoadingHrAccess || !hrAccess.canApprove)}
                              >
                                <X className="h-4 w-4 text-destructive" />
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

        {isHrContext ? (
          <OrgHRPageGuide pathname={location.pathname} />
        ) : (
          <PageGlossarySection preset="org_leave_requests" />
        )}
      </div>

      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          setRejectDialogOpen(open);
          if (!open) {
            setRejectTargetRequestId(null);
            setRejectionReason("");
            setIsRejecting(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Permohonan</DialogTitle>
            <DialogDescription>Masukkan alasan penolakan agar pengaju dapat menindaklanjuti.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Alasan penolakan..."
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            rows={4}
          />
          <DialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>Alasan penolakan akan tercatat di riwayat permohonan.</DialogActionHint>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="w-full sm:w-auto bg-white"
                onClick={() => setRejectDialogOpen(false)}
                disabled={isRejecting}
              >
                Batal
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="destructive"
                onClick={() => void handleConfirmReject()}
                disabled={isRejecting || rejectionReason.trim().length < 3}
              >
                Tolak Permohonan
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
