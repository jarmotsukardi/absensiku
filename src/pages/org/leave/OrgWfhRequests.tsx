import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Home, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useEmployee } from "@/hooks/useEmployee";
import type { User } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { LeaveRequestTabs } from "@/components/org/leave/LeaveRequestTabs";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

type WfhRequest = Tables<"wfh_requests"> & {
  employees: {
    name: string;
    nip: string | null;
    opd: { name: string; code: string } | null;
  } | null;
};

export default function OrgWfhRequests() {
  const PAGE_SIZE = 20;
  const WFH_REQUEST_QUERY_TIMEOUT_MS = 15000;
  const WFH_REQUEST_QUERY_RETRY_MAX = 1;
  const [requests, setRequests] = useState<WfhRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const { employee } = useEmployee(user);

  const initializeTenant = useCallback(async () => {
    try {
      const resolvedTenantId = await withTimeout(
        resolveOrgTenantId(),
        WFH_REQUEST_QUERY_TIMEOUT_MS,
        "org.wfh_requests.resolve_tenant timeout",
      );
      setTenantId(resolvedTenantId);
      setLoadError(null);
    } catch (error) {
      const errorRef = reportError(error, "org.wfh_requests.resolve_tenant");
      const message = appendErrorReference("Gagal menentukan tenant organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
      setTenantId(null);
    }
  }, []);

  useEffect(() => {
    void initializeTenant();
  }, [initializeTenant]);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      if (!tenantId) {
        setRequests([]);
        setTotalCount(0);
        return;
      }

      const employeeIds = await withExponentialBackoff(
        () =>
          withTimeout(
            getTenantEmployeeIds(tenantId),
            WFH_REQUEST_QUERY_TIMEOUT_MS,
            "org.wfh_requests.fetch.employee_ids timeout",
          ),
        {
          maxRetries: WFH_REQUEST_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (employeeIds.length === 0) {
        setRequests([]);
        setTotalCount(0);
        return;
      }

      const { data, error, count } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("wfh_requests")
              .select("*, employees!wfh_requests_employee_id_fkey(name, nip, opd(name, code))", { count: "exact" })
              .in("employee_id", employeeIds)
              .order("created_at", { ascending: false })
              .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
            WFH_REQUEST_QUERY_TIMEOUT_MS,
            "org.wfh_requests.fetch.query timeout",
          ),
        {
          maxRetries: WFH_REQUEST_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      
      if (error) throw error;

      setRequests((data || []) as WfhRequest[]);
      setTotalCount(count || 0);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.wfh_requests.fetch_data", {
        tenant_id: tenantId,
        page: currentPage,
      });
      const message = appendErrorReference("Gagal memuat data pengajuan WFH", errorRef);
      setLoadError(message);
      toast.error(message);
      setRequests([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [currentPage, tenantId]);

  useEffect(() => {
    if (tenantId === undefined) return;
    if (tenantId === null) {
      setIsLoading(false);
      return;
    }
    void fetchRequests();
  }, [tenantId, fetchRequests]);

  const handleApprove = async (id: string) => {
    if (!employee?.id) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("wfh_requests")
        .update({ status: "disetujui", approved_by: employee.id, approved_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      toast.success("Pengajuan WFH disetujui");
      void fetchRequests();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.wfh_requests.approve", { request_id: id, tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyetujui pengajuan WFH", errorRef));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!employee?.id || !selectedRequest) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("wfh_requests")
        .update({ status: "ditolak", approved_by: employee.id, approved_at: new Date().toISOString(), rejection_reason: rejectionReason })
        .eq("id", selectedRequest);

      if (error) throw error;

      toast.success("Pengajuan WFH ditolak");
      setRejectDialogOpen(false);
      setRejectionReason("");
      void fetchRequests();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.wfh_requests.reject", { request_id: selectedRequest, tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menolak pengajuan WFH", errorRef));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryLoad = async () => {
    await initializeTenant();
    if (tenantId) {
      await fetchRequests();
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { icon: LucideIcon; label: string; class: string }> = {
      disetujui: { icon: CheckCircle2, label: "Disetujui", class: "bg-green-500/10 text-green-700 border-green-500/30" },
      ditolak: { icon: XCircle, label: "Ditolak", class: "bg-red-500/10 text-red-700 border-red-500/30" },
      menunggu: { icon: Clock, label: "Menunggu", class: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
    };
    const { icon: Icon, label, class: cls } = map[status] || map.menunggu;
    return <Badge className={cls}><Icon className="w-3 h-3 mr-1" />{label}</Badge>;
  };
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Home className="h-6 w-6" />Pengajuan WFH</h1>
          <p className="text-muted-foreground">Kelola data pengajuan WFH pegawai</p>
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
            <CardTitle>Daftar Pengajuan WFH</CardTitle>
            <CardDescription>Total {totalCount} pengajuan WFH</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pegawai</TableHead>
                  <TableHead>Tanggal WFH</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : requests.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Tidak ada pengajuan</TableCell></TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div><p className="font-medium">{req.employees?.name}</p><p className="text-xs text-muted-foreground">{req.employees?.nip}</p></div>
                      </TableCell>
                      <TableCell>{format(new Date(req.request_date), "EEEE, d MMM yyyy", { locale: id })}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                      <TableCell>{getStatusBadge(req.status)}</TableCell>
                      <TableCell>
                        {req.status === "menunggu" && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApprove(req.id)} disabled={isSubmitting}>Setujui</Button>
                            <Dialog open={rejectDialogOpen && selectedRequest === req.id} onOpenChange={(o) => { setRejectDialogOpen(o); if (o) setSelectedRequest(req.id); }}>
                              <DialogTrigger asChild><Button size="sm" variant="destructive">Tolak</Button></DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>Tolak Pengajuan WFH</DialogTitle></DialogHeader>
                                <Textarea placeholder="Alasan penolakan..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
                                <Button onClick={handleReject} disabled={isSubmitting || !rejectionReason}>Konfirmasi Tolak</Button>
                              </DialogContent>
                            </Dialog>
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
