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

type WfhRequest = Tables<"wfh_requests"> & {
  employees: {
    name: string;
    nip: string | null;
    opd: { name: string; code: string } | null;
  } | null;
};

export default function OrgWfhRequests() {
  const PAGE_SIZE = 20;
  const [requests, setRequests] = useState<WfhRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
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

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    if (!tenantId) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    const employeeIds = await getTenantEmployeeIds(tenantId);
    if (employeeIds.length === 0) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    const { data, error, count } = await supabase
      .from("wfh_requests")
      .select("*, employees!wfh_requests_employee_id_fkey(name, nip, opd(name, code))", { count: "exact" })
      .in("employee_id", employeeIds)
      .order("created_at", { ascending: false })
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    
    if (!error) {
      setRequests((data || []) as WfhRequest[]);
      setTotalCount(count || 0);
    }
    setIsLoading(false);
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
    const { error } = await supabase
      .from("wfh_requests")
      .update({ status: "disetujui", approved_by: employee.id, approved_at: new Date().toISOString() })
      .eq("id", id);
    
    if (!error) {
      toast.success("Pengajuan WFH disetujui");
      void fetchRequests();
    }
    setIsSubmitting(false);
  };

  const handleReject = async () => {
    if (!employee?.id || !selectedRequest) return;
    setIsSubmitting(true);
    const { error } = await supabase
      .from("wfh_requests")
      .update({ status: "ditolak", approved_by: employee.id, approved_at: new Date().toISOString(), rejection_reason: rejectionReason })
      .eq("id", selectedRequest);
    
    if (!error) {
      toast.success("Pengajuan WFH ditolak");
      setRejectDialogOpen(false);
      setRejectionReason("");
      void fetchRequests();
    }
    setIsSubmitting(false);
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
          <p className="text-muted-foreground">Kelola pengajuan work from home pegawai</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Pengajuan</CardTitle>
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
      </div>
    </OrganizationLayout>
  );
}
