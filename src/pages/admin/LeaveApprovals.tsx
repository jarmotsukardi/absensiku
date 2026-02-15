import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  FileText,
  Loader2,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  created_at: string;
  is_half_day: boolean;
  attachment_url: string | null;
  rejection_reason?: string;
  employee: {
    name: string;
    email: string;
    position: string | null;
  };
}

const leaveTypeLabels: Record<string, string> = {
  izin: "Izin",
  cuti_tahunan: "Cuti Tahunan",
  cuti_penting: "Cuti Penting",
  cuti_lainnya: "Cuti Lainnya",
  sakit: "Sakit",
  tugas_luar: "Tugas Luar",
};

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  menunggu: { label: "Menunggu", variant: "secondary" },
  disetujui: { label: "Disetujui", variant: "default" },
  ditolak: { label: "Ditolak", variant: "destructive" },
};

export default function LeaveApprovals() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("menunggu");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchLeaveRequests();
  }, []);

  const fetchLeaveRequests = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("leave_requests")
        .select(`*, employee:employees!leave_requests_employee_id_fkey(name, email, position)`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests((data as unknown as LeaveRequest[]) || []);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      toast.error("Gagal memuat data pengajuan");
    } finally {
      setIsLoading(false);
    }
  };

  const filterRequests = useCallback(() => {
    let filtered = [...requests];
    if (statusFilter !== "all") filtered = filtered.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") filtered = filtered.filter(r => r.leave_type === typeFilter);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.employee.name.toLowerCase().includes(query) ||
        r.employee.email.toLowerCase().includes(query) ||
        r.reason.toLowerCase().includes(query)
      );
    }
    setFilteredRequests(filtered);
  }, [requests, searchQuery, statusFilter, typeFilter]);

  useEffect(() => {
    filterRequests();
  }, [filterRequests]);

  const handleApprove = async () => {
    if (!selectedRequest) return;
    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: empData } = await supabase.from("employees").select("id").eq("user_id", user?.id).single();
      const { error } = await supabase.from("leave_requests").update({
        status: "disetujui",
        approved_by: empData?.id,
        approved_at: new Date().toISOString(),
      }).eq("id", selectedRequest.id);
      if (error) throw error;
      toast.success(`Pengajuan ${selectedRequest.employee.name} telah disetujui`);
      setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, status: "disetujui" } : r));
      setSelectedRequest(null);
      setActionType(null);
    } catch (error) {
      toast.error("Gagal menyetujui pengajuan");
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
      const { data: { user } } = await supabase.auth.getUser();
      const { data: empData } = await supabase.from("employees").select("id").eq("user_id", user?.id).single();
      const { error } = await supabase.from("leave_requests").update({
        status: "ditolak",
        rejection_reason: rejectionReason,
        approved_by: empData?.id,
        approved_at: new Date().toISOString(),
      }).eq("id", selectedRequest.id);
      if (error) throw error;
      toast.success(`Pengajuan ${selectedRequest.employee.name} telah ditolak`);
      setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, status: "ditolak" } : r));
      setSelectedRequest(null);
      setActionType(null);
      setRejectionReason("");
    } catch (error) {
      toast.error("Gagal menolak pengajuan");
    } finally {
      setIsProcessing(false);
    }
  };

  const getDayCount = (startDate: string, endDate: string, isHalfDay: boolean) => {
    if (isHalfDay) return 0.5;
    const diffTime = Math.abs(new Date(endDate).getTime() - new Date(startDate).getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const pendingCount = requests.filter(r => r.status === "menunggu").length;

  return (
    <SuperAdminLayout title="Approval Pengajuan" subtitle="Kelola pengajuan izin & cuti pegawai">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("menunggu")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Menunggu</p><p className="text-2xl font-bold text-amber-600">{requests.filter(r => r.status === "menunggu").length}</p></div>
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("disetujui")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Disetujui</p><p className="text-2xl font-bold text-green-600">{requests.filter(r => r.status === "disetujui").length}</p></div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("ditolak")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Ditolak</p><p className="text-2xl font-bold text-red-600">{requests.filter(r => r.status === "ditolak").length}</p></div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("all")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{requests.length}</p></div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {pendingCount > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <p className="text-sm"><strong>{pendingCount} pengajuan</strong> menunggu persetujuan</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-lg flex items-center gap-2"><Filter className="h-5 w-5" />Filter</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="menunggu">Menunggu</SelectItem>
                  <SelectItem value="disetujui">Disetujui</SelectItem>
                  <SelectItem value="ditolak">Ditolak</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Tipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tipe</SelectItem>
                  {Object.entries(leaveTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={fetchLeaveRequests}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader><CardTitle>Daftar Pengajuan</CardTitle><CardDescription>Menampilkan {filteredRequests.length} pengajuan</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-12"><FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">Tidak ada pengajuan</p></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pegawai</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-4 w-4 text-primary" /></div>
                            <div><p className="font-medium">{req.employee.name}</p><p className="text-xs text-muted-foreground">{req.employee.position || req.employee.email}</p></div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{leaveTypeLabels[req.leave_type]}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm"><Calendar className="h-3 w-3" />{format(new Date(req.start_date), "d MMM", { locale: id })}{req.start_date !== req.end_date && <> - {format(new Date(req.end_date), "d MMM", { locale: id })}</>}</div>
                        </TableCell>
                        <TableCell><Badge variant={statusLabels[req.status]?.variant}>{statusLabels[req.status]?.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          {req.status === "menunggu" ? (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="outline" className="text-green-600" onClick={() => { setSelectedRequest(req); setActionType("approve"); }}><CheckCircle2 className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" className="text-red-600" onClick={() => { setSelectedRequest(req); setActionType("reject"); }}><XCircle className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => { setSelectedRequest(req); setActionType(null); }}>Detail</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve Dialog */}
      <Dialog open={actionType === "approve"} onOpenChange={(open) => !open && setActionType(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Setujui Pengajuan</DialogTitle><DialogDescription>Yakin ingin menyetujui?</DialogDescription></DialogHeader>
          {selectedRequest && <div className="py-4 text-sm"><p><strong>{selectedRequest.employee.name}</strong> - {leaveTypeLabels[selectedRequest.leave_type]}</p><p className="text-muted-foreground mt-2">{selectedRequest.reason}</p></div>}
          <DialogFooter><Button variant="outline" onClick={() => setActionType(null)}>Batal</Button><Button onClick={handleApprove} disabled={isProcessing} className="bg-green-600">{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Setujui"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={actionType === "reject"} onOpenChange={(open) => !open && setActionType(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tolak Pengajuan</DialogTitle></DialogHeader>
          <Textarea placeholder="Alasan penolakan..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setActionType(null)}>Batal</Button><Button onClick={handleReject} disabled={isProcessing} variant="destructive">{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tolak"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={selectedRequest !== null && actionType === null} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detail Pengajuan</DialogTitle></DialogHeader>
          {selectedRequest && <div className="py-4 space-y-2 text-sm"><p><strong>{selectedRequest.employee.name}</strong></p><p>Tipe: {leaveTypeLabels[selectedRequest.leave_type]}</p><p>Status: {statusLabels[selectedRequest.status]?.label}</p><p>Alasan: {selectedRequest.reason}</p>{selectedRequest.rejection_reason && <p className="text-red-600">Alasan ditolak: {selectedRequest.rejection_reason}</p>}</div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelectedRequest(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}
