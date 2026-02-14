import { useState, useEffect } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Check, X, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

type LeaveRequest = Tables<"leave_requests">;
type Employee = Tables<"employees">;

export default function LeaveRequestsAdmin() {
  const [requests, setRequests] = useState<(LeaveRequest & { employee?: Employee })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("menunggu");

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from("leave_requests")
        .select("*, employee:employees!leave_requests_employee_id_fkey(*)") 
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests((data || []) as any);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const handleApprove = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: currentEmployee } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single();

      const { error } = await supabase
        .from("leave_requests")
        .update({ 
          status: "disetujui", 
          approved_by: currentEmployee?.id,
          approved_at: new Date().toISOString()
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Permohonan cuti disetujui");
      fetchData();
    } catch (error) {
      console.error("Error approving request:", error);
      toast.error("Gagal menyetujui permohonan");
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Masukkan alasan penolakan:");
    if (!reason) return;

    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({ 
          status: "ditolak", 
          rejection_reason: reason 
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Permohonan cuti ditolak");
      fetchData();
    } catch (error) {
      console.error("Error rejecting request:", error);
      toast.error("Gagal menolak permohonan");
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
    (req.employee as any)?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Permohonan Cuti</h1>
          <p className="text-muted-foreground">
            Kelola permohonan cuti dan izin pegawai
          </p>
        </div>

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
                  ) : filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Tidak ada permohonan
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((req, index) => (
                      <TableRow key={req.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {(req.employee as any)?.name || "-"}
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
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
