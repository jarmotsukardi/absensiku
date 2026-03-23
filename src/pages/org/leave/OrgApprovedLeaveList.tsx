import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Calendar, Download } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { id } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { LeaveRequestTabs } from "@/components/org/leave/LeaveRequestTabs";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LEAVE_REQUEST_CATEGORY_OPTIONS,
  type LeaveRequestCategory,
  getLeaveRequestPresentation,
  matchesLeaveRequestCategory,
} from "@/lib/leaveRequestPresentation";

type ApprovedLeaveRequest = Tables<"leave_requests"> & {
  employees: {
    name: string;
    nip: string | null;
  } | null;
};

export default function OrgApprovedLeaveList() {
  const ITEMS_PER_PAGE = 15;
  const APPROVED_LEAVE_QUERY_TIMEOUT_MS = 15000;
  const APPROVED_LEAVE_QUERY_RETRY_MAX = 1;
  const [requests, setRequests] = useState<ApprovedLeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestCategoryFilter, setRequestCategoryFilter] =
    useState<LeaveRequestCategory>("all");

  const initializeTenant = useCallback(async () => {
    try {
      const resolvedTenantId = await withTimeout(
        resolveOrgTenantId(),
        APPROVED_LEAVE_QUERY_TIMEOUT_MS,
        "org.approved_leave.resolve_tenant timeout",
      );
      setTenantId(resolvedTenantId);
      setLoadError(null);
    } catch (error) {
      const errorRef = reportError(error, "org.approved_leave.resolve_tenant");
      setLoadError(appendErrorReference("Gagal menentukan tenant organisasi", errorRef));
      setTenantId(null);
    }
  }, []);

  useEffect(() => {
    void initializeTenant();
  }, [initializeTenant]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      if (!tenantId) {
        setRequests([]);
        return;
      }
      const employeeIds = await withExponentialBackoff(
        () =>
          withTimeout(
            getTenantEmployeeIds(tenantId),
            APPROVED_LEAVE_QUERY_TIMEOUT_MS,
            "org.approved_leave.fetch.employee_ids timeout",
          ),
        {
          maxRetries: APPROVED_LEAVE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (employeeIds.length === 0) {
        setRequests([]);
        return;
      }

      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("leave_requests")
              .select("*, employees!leave_requests_employee_id_fkey(name, nip)")
              .in("employee_id", employeeIds)
              .eq("status", "disetujui")
              .in("leave_type", ["izin", "cuti_tahunan", "cuti_penting", "cuti_lainnya"])
              .order("start_date", { ascending: false }),
            APPROVED_LEAVE_QUERY_TIMEOUT_MS,
            "org.approved_leave.fetch.query timeout",
          ),
        {
          maxRetries: APPROVED_LEAVE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      setRequests((data || []) as ApprovedLeaveRequest[]);
    } catch (error) {
      const errorRef = reportError(error, "org.approved_leave.fetch", { tenant_id: tenantId });
      const message = appendErrorReference("Gagal memuat daftar izin/cuti disetujui", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
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

  const handleRetryLoad = async () => {
    await initializeTenant();
    if (tenantId) {
      await fetchData();
    }
  };

  const handleExport = () => {
    toast.info("Fitur export akan segera tersedia");
  };

  const requestCategoryCounts = useMemo(() => {
    const counts: Record<LeaveRequestCategory, number> = {
      all: requests.length,
      regular: 0,
      late_permission: 0,
      early_leave_permission: 0,
    };

    requests.forEach((request) => {
      const category = getLeaveRequestPresentation(request).category;
      counts[category] += 1;
    });
    return counts;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const searchNeedle = searchTerm.trim().toLowerCase();
    return requests.filter((request) => {
      if (!matchesLeaveRequestCategory(request, requestCategoryFilter)) {
        return false;
      }
      if (!searchNeedle) return true;

      const presentation = getLeaveRequestPresentation(request);
      return (
        (request.employees?.name || "").toLowerCase().includes(searchNeedle) ||
        presentation.reasonText.toLowerCase().includes(searchNeedle) ||
        presentation.leaveTypeLabel.toLowerCase().includes(searchNeedle)
      );
    });
  }, [requests, requestCategoryFilter, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, requestCategoryFilter]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              Izin/Cuti Disetujui
            </h1>
            <p className="text-muted-foreground">Kelola data izin/cuti yang telah disetujui</p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
        <LeaveRequestTabs />

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center justify-between gap-3 pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button size="sm" variant="outline" onClick={handleRetryLoad} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                Coba Lagi
              </Button>
            </CardContent>
          </Card>
        )}
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sedang mencoba ulang koneksi data...
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Izin/Cuti Disetujui</CardTitle>
            <CardDescription>Total {filteredRequests.length} data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
            <Tabs
              value={requestCategoryFilter}
              onValueChange={(value) => setRequestCategoryFilter(value as LeaveRequestCategory)}
            >
              <TabsList className="mb-4 h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-1.5">
                {LEAVE_REQUEST_CATEGORY_OPTIONS.map((option) => (
                  <TabsTrigger key={option.value} value={option.value} className="whitespace-nowrap">
                    {option.label} ({requestCategoryCounts[option.value]})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Pegawai</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div></TableCell></TableRow>
                ) : paginatedRequests.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                ) : (
                  paginatedRequests.map((req, i) => {
                    const presentation = getLeaveRequestPresentation(req);
                    return (
                    <TableRow key={req.id}>
                      <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                      <TableCell>{req.employees?.name}</TableCell>
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
                        ) : presentation.leaveTypeLabel}
                      </TableCell>
                      <TableCell>{format(new Date(req.start_date), "d MMM yyyy", { locale: id })}</TableCell>
                      <TableCell>{format(new Date(req.end_date), "d MMM yyyy", { locale: id })}</TableCell>
                      <TableCell>{differenceInDays(new Date(req.end_date), new Date(req.start_date)) + 1} hari</TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="truncate text-sm">{presentation.reasonText}</p>
                        {(presentation.isLatePermission || presentation.isEarlyLeavePermission) && (
                          <p className="text-xs text-muted-foreground">
                            {presentation.detailLabel}: {presentation.detailText ?? "-"}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })
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
