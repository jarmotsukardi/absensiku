import { useCallback, useEffect, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Json, Tables, TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Search, ClipboardList, Loader2, Check, X, Eye, ArrowRight, UserCog, Plus } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { AdminMutationForm } from "@/components/org/AdminMutationForm";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

type MutationRequestRow = Tables<"mutation_requests">;
type MutationStatus = Enums<"request_status">;

interface EmployeeOption {
  id: string;
  name: string;
  nip: string | null;
  tenant_id: string;
  opd_id: string | null;
  work_unit_id: string | null;
  office_id: string | null;
  opd: { id: string; name: string } | null;
  work_unit: { id: string; name: string } | null;
  offices: { id: string; name: string } | null;
}

const toJsonRecord = (value: Json | null): Record<string, Json | undefined> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json | undefined>;
  }
  return {};
};

interface MutationRequest {
  id: string;
  employee_id: string;
  mutation_type: "profile_change" | "transfer";
  requested_changes: Record<string, Json | undefined>;
  original_data: Record<string, Json | undefined>;
  reason: string;
  status: MutationStatus;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  employees: {
    id: string;
    name: string;
    nip: string | null;
    opd: { name: string } | null;
  };
}

export default function OrgMutationRequests() {
  const PAGE_SIZE = 20;
  const [requests, setRequests] = useState<MutationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("menunggu");
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState<MutationRequest | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // State untuk tambah mutasi admin
  const [showAddMutationDialog, setShowAddMutationDialog] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);

  useEffect(() => {
    const initTenant = async () => {
      try {
        const resolved = await resolveOrgTenantId();
        setTenantId(resolved);
        setLoadError(null);
      } catch (error) {
        const errorRef = reportError(error, "org.mutation_requests.resolve_tenant");
        const message = appendErrorReference("Gagal menentukan tenant organisasi", errorRef);
        setLoadError(message);
        toast.error(message);
        setTenantId(null);
      }
    };
    void initTenant();
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoadError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: emp } = await supabase
        .from("employees")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();
      
      if (!emp?.tenant_id) return;
      
      const { data } = await supabase
        .from("employees")
        .select("id, name, nip, opd:opd_id(id, name), work_unit:work_unit_id(id, name), offices:office_id(id, name), tenant_id, opd_id, work_unit_id, office_id")
        .eq("tenant_id", emp.tenant_id)
        .eq("is_active", true)
        .order("name");
      
      setEmployees((data || []) as EmployeeOption[]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.mutation_requests.fetch_employees");
      const message = appendErrorReference("Gagal memuat data pegawai", errorRef);
      toast.error(message);
      setLoadError(message);
      setEmployees([]);
    }
  }, []);
  
  const handleOpenAddMutation = () => {
    setSelectedEmployeeId("");
    setSelectedEmployee(null);
    setShowAddMutationDialog(true);
  };
  
  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const emp = employees.find((employee) => employee.id === employeeId);
    setSelectedEmployee(emp || null);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      if (!tenantId) {
        setRequests([]);
        setTotalCount(0);
        return;
      }

      const employeeIds = await getTenantEmployeeIds(tenantId);
      if (employeeIds.length === 0) {
        setRequests([]);
        setTotalCount(0);
        return;
      }

      let query = supabase
        .from("mutation_requests")
        .select("*, employees!mutation_requests_employee_id_fkey(id, name, nip, opd(name))", { count: "exact" })
        .in("employee_id", employeeIds)
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as MutationStatus);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const requestsWithEmployees = (data || []).map((req: MutationRequestRow & {
        employees?: MutationRequest["employees"] | null;
      }) => ({
        ...req,
        requested_changes: toJsonRecord(req.requested_changes),
        original_data: toJsonRecord(req.original_data),
        employees: req.employees || { id: "", name: "-", nip: "-", opd: null },
      })) as MutationRequest[];

      setRequests(requestsWithEmployees);
      setTotalCount(count || 0);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.mutation_requests.fetch_data", {
        tenant_id: tenantId,
        status: statusFilter,
        page: currentPage,
      });
      const message = appendErrorReference("Gagal memuat data permohonan mutasi", errorRef);
      setLoadError(message);
      toast.error(message);
      setRequests([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, statusFilter, tenantId]);

  useEffect(() => {
    if (tenantId === undefined) return;
    void fetchData();
    void fetchEmployees();
  }, [fetchData, fetchEmployees, tenantId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleApprove = async (request: MutationRequest) => {
    setIsProcessing(true);
    try {
      // Update status pengajuan
      const { error: updateError } = await supabase
        .from("mutation_requests")
        .update({
          status: "disetujui",
          approved_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (updateError) throw updateError;

      // Filter out non-column fields (display-only fields like opd_name, work_unit_name, office_name)
      const updateData: Record<string, unknown> = {};
      const excludeFields = ["opd_name", "work_unit_name", "office_name"];
      
      Object.entries(request.requested_changes).forEach(([key, value]) => {
        if (!excludeFields.includes(key) && value !== undefined && value !== null) {
          updateData[key] = value;
        }
      });

      // Update data karyawan dengan perubahan yang disetujui (hanya field yang valid)
      if (Object.keys(updateData).length > 0) {
        const { error: employeeError } = await supabase
          .from("employees")
          .update(updateData as TablesUpdate<"employees">)
          .eq("id", request.employee_id);

        if (employeeError) throw employeeError;
      }

      // Get employee user_id untuk notifikasi
      const { data: empData } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", request.employee_id)
        .single();

      // Buat notifikasi untuk karyawan
      if (empData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: empData.user_id,
          title: "Pengajuan Mutasi Disetujui",
          message: `Pengajuan mutasi Anda dengan alasan "${request.reason}" telah disetujui.`,
          type: "success",
          related_id: request.id,
          related_type: "mutation_request",
        });
      }

      toast.success("Pengajuan mutasi disetujui");
      setShowDetailDialog(false);
      void fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Gagal menyetujui pengajuan";
      const errorRef = reportError(error, "org.mutation_requests.approve", { request_id: request.id, tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyetujui pengajuan", errorRef), { description: errorMessage });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast.error("Alasan penolakan harus diisi");
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from("mutation_requests")
        .update({
          status: "ditolak",
          rejection_reason: rejectionReason,
          approved_at: new Date().toISOString(),
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      // Get employee user_id untuk notifikasi
      const { data: empData } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", selectedRequest.employee_id)
        .single();

      // Buat notifikasi untuk karyawan
      if (empData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: empData.user_id,
          title: "Pengajuan Mutasi Ditolak",
          message: `Pengajuan mutasi Anda ditolak dengan alasan: ${rejectionReason}`,
          type: "error",
          related_id: selectedRequest.id,
          related_type: "mutation_request",
        });
      }

      toast.success("Pengajuan mutasi ditolak");
      setShowRejectDialog(false);
      setShowDetailDialog(false);
      setRejectionReason("");
      void fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Gagal menolak pengajuan";
      const errorRef = reportError(error, "org.mutation_requests.reject", {
        request_id: selectedRequest.id,
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menolak pengajuan", errorRef), { description: errorMessage });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return <Badge variant="secondary">Menunggu</Badge>;
      case "disetujui":
        return <Badge className="bg-green-500 hover:bg-green-600">Disetujui</Badge>;
      case "ditolak":
        return <Badge variant="destructive">Ditolak</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMutationTypeLabel = (type: string) => {
    return type === "profile_change" ? "Perubahan Profil" : "Mutasi/Pindah";
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      email: "Email",
      phone: "No. Telepon",
      whatsapp: "WhatsApp",
      address: "Alamat",
      gender: "Jenis Kelamin",
      golongan: "Golongan",
      position: "Jabatan",
      opd_id: "OPD",
      work_unit_id: "Satuan Kerja",
      office_id: "Lokasi Kerja",
    };
    return labels[field] || field;
  };

  const filteredRequests = requests.filter(
    (req) =>
      (req.employees?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.employees?.nip || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            Permohonan Mutasi
          </h1>
          <p className="text-muted-foreground">Kelola permohonan mutasi dan perubahan profil pegawai</p>
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
                  placeholder="Cari nama, NIP, atau alasan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="menunggu">Menunggu</SelectItem>
                  <SelectItem value="disetujui">Disetujui</SelectItem>
                  <SelectItem value="ditolak">Ditolak</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleOpenAddMutation}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Mutasi
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Tidak ada permohonan mutasi</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pegawai</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{request.employees?.name || "-"}</p>
                            <p className="text-sm text-muted-foreground">{request.employees?.nip || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getMutationTypeLabel(request.mutation_type)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{request.reason}</TableCell>
                        <TableCell>
                          {format(new Date(request.created_at), "dd MMM yyyy", { locale: localeId })}
                        </TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowDetailDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
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

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detail Pengajuan Mutasi</DialogTitle>
              <DialogDescription>
                {selectedRequest?.employees?.name} - {selectedRequest?.employees?.nip}
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Jenis Mutasi</span>
                  <Badge variant="outline">{getMutationTypeLabel(selectedRequest.mutation_type)}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Alasan</span>
                  <p className="mt-1">{selectedRequest.reason}</p>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Perubahan yang Diajukan</h4>
                  <div className="space-y-2">
                    {Object.entries(selectedRequest.requested_changes).map(([field, newValue]) => (
                      <div key={field} className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                        <span className="font-medium min-w-[100px]">{getFieldLabel(field)}</span>
                        <span className="text-muted-foreground line-through">
                          {String(selectedRequest.original_data?.[field] || "-")}
                        </span>
                        <ArrowRight className="h-3 w-3 flex-shrink-0" />
                        <span className="font-medium text-primary">{String(newValue)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedRequest.status === "ditolak" && selectedRequest.rejection_reason && (
                  <div className="border-t pt-4">
                    <span className="text-sm text-muted-foreground">Alasan Penolakan</span>
                    <p className="mt-1 text-destructive">{selectedRequest.rejection_reason}</p>
                  </div>
                )}

                {selectedRequest.status === "menunggu" && (
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRejectDialog(true);
                      }}
                      disabled={isProcessing}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Tolak
                    </Button>
                    <Button
                      onClick={() => handleApprove(selectedRequest)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      Setujui
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tolak Pengajuan Mutasi</DialogTitle>
              <DialogDescription>Berikan alasan penolakan untuk pengajuan ini</DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="Alasan penolakan..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                Batal
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={isProcessing || !rejectionReason.trim()}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Tolak Pengajuan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Mutation Dialog */}
        <Dialog open={showAddMutationDialog} onOpenChange={setShowAddMutationDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Tambah Mutasi Pegawai
              </DialogTitle>
              <DialogDescription>Pilih pegawai yang akan dimutasi</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <SearchableSelect
                  options={employees.map(e => ({ value: e.id, label: `${e.name} - ${e.nip || 'N/A'}` }))}
                  value={selectedEmployeeId}
                  onValueChange={handleEmployeeSelect}
                  placeholder="Cari dan pilih pegawai..."
                  searchPlaceholder="Ketik nama atau NIP..."
                  emptyMessage="Pegawai tidak ditemukan"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddMutationDialog(false)}>Batal</Button>
              <Button 
                disabled={!selectedEmployee} 
                onClick={() => {
                  setShowAddMutationDialog(false);
                }}
              >
                Lanjutkan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Admin Mutation Form */}
        <AdminMutationForm
          open={!!selectedEmployee && !showAddMutationDialog}
          onOpenChange={(open) => {
            if (!open) setSelectedEmployee(null);
          }}
          employee={selectedEmployee}
          onSuccess={() => {
            setSelectedEmployee(null);
            void fetchData();
          }}
        />

        <PageGlossarySection preset="org_mutation_requests" />
      </div>
    </OrganizationLayout>
  );
}
